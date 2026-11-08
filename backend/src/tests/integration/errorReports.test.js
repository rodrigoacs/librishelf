import request from 'supertest'
import app from '../../app.js'
import { db } from '../../database/connection.js'
import { confirmEmail } from '../helpers/confirmEmail.js'
import { tokenFrom } from '../helpers/authToken.js'
import { clearDatabase, closeDatabase } from '../../utils/db.js'
import { enqueue } from '../../jobs/queue.js'
import { drain } from '../../jobs/worker.js'
import * as errorReports from '../../services/errorReportService.js'
import { waitFor } from '../helpers/waitFor.js'

const PASSWORD = 'senha12345'
let token = ''
let unlock = ''
const asAdmin = () => ({ Authorization: `Bearer ${token}`, Cookie: unlock })
const rows = async (where = 'true') => (await db.query(`SELECT * FROM librishelf.error_reports WHERE ${where} ORDER BY id`)).rows
// A gravação não segura a resposta (204 na hora): espera a linha chegar
const rowsWhen = (where, done) => waitFor(async () => { const found = await rows(where); return done(found) && found })

beforeAll(async () => {
  await clearDatabase()
  await request(app).post('/auth/register').send({ acceptTerms: true, username: 'chefe', password: PASSWORD, email: 'chefe@example.com' })
  await confirmEmail('chefe')
  await db.query("UPDATE librishelf.users SET role = 'admin' WHERE name = 'chefe'")
  token = tokenFrom(await request(app).post('/auth/login').send({ username: 'chefe', password: PASSWORD }))
  const res = await request(app).post('/admin/unlock').set({ Authorization: `Bearer ${token}` }).send({ password: PASSWORD })
  unlock = (res.headers['set-cookie'] || []).find(c => c.startsWith('admin_unlock=')).split(';')[0]
})

afterEach(() => { delete process.env.ADMIN_EMAIL })
afterAll(closeDatabase)

describe('POST /client-errors', () => {
  const report = extra => ({ kind: 'error', message: 'Cannot read properties of undefined (reading \'title\')', page: 'https://librishelf.com/books/123?q=ana@example.com', stack: 'TypeError\n    at x (https://librishelf.com/assets/a.js:1:2)', release: 'b-1', ...extra })

  test('grava limpo e deduplica', async () => {
    for (let i = 0; i < 3; i++) {
      const res = await request(app).post('/client-errors').send(report())
      expect(res.status).toBe(204)
    }
    const [row, ...rest] = await rowsWhen("source = 'client'", found => found[0]?.occurrences === 3)
    expect(rest).toHaveLength(0)
    expect(row).toMatchObject({ location: '/books/:id', occurrences: 3 })
    expect(JSON.stringify(row)).not.toContain('example.com')
    expect(row.detail.stack).toBe('TypeError\nat x (/assets/a.js:1:2)')
  })

  test('sendBeacon (text/plain) também vale; lixo é ignorado sem erro', async () => {
    let res = await request(app).post('/client-errors').set('Content-Type', 'text/plain').send(JSON.stringify(report({ kind: 'unhandledrejection', message: 'Falha na rede' })))
    expect(res.status).toBe(204)
    res = await request(app).post('/client-errors').set('Content-Type', 'text/plain').send('{nada')
    expect(res.status).toBe(204)
    res = await request(app).post('/client-errors').send({ kind: 'x' })
    expect(res.status).toBe(204)
    expect(await rowsWhen("source = 'client'", found => found.length === 2)).toHaveLength(2)
  })
})

describe('outras origens', () => {
  test('violação de CSP entra como csp', async () => {
    const body = { 'csp-report': { 'document-uri': 'https://librishelf.com/settings?tab=1', 'effective-directive': 'img-src', 'blocked-uri': 'https://evil.example/a.png' } }
    await request(app).post('/csp-report').set('Content-Type', 'application/csp-report').send(JSON.stringify(body))
    const [row] = await rowsWhen("source = 'csp'", found => found.length > 0)
    expect(row).toMatchObject({ message: 'img-src bloqueou https://evil.example/a.png', location: '/settings' })
  })

  test('job que desiste entra como worker', async () => {
    await enqueue('email.send', { kind: 'nao-existe' }, { maxAttempts: 1 })
    await drain('teste', { types: ['email.send'] })
    const [row] = await rows("source = 'worker'")
    expect(row).toMatchObject({ location: 'email.send', message: 'E-mail desconhecido: nao-existe' })
  })

  test('erro 500 da API entra como server', async () => {
    await errorReports.recordServerError({ method: 'GET', path: '/lists/42?x=1', context: 'Erro ao abrir lista', error: new Error('boom') })
    const [row] = await rows("source = 'server'")
    expect(row).toMatchObject({ location: 'GET /lists/:id', message: 'boom' })
    expect(row.detail.context).toBe('Erro ao abrir lista')
  })

  test('registrar nunca lança', async () => {
    await expect(errorReports.record({ source: 'inventada', message: 'x' })).resolves.toBeUndefined()
  })
})

describe('resumo por e-mail', () => {
  test('sem ADMIN_EMAIL: não manda', async () => {
    expect(await errorReports.digest({ send: async () => { throw new Error('não deveria') } })).toEqual({ skipped: 'ADMIN_EMAIL não definido' })
  })

  test('manda um resumo, respeita o intervalo e só volta com novidade', async () => {
    process.env.ADMIN_EMAIL = 'admin@example.com'
    const sent = []
    const send = async mail => { sent.push(mail) }

    const first = await errorReports.digest({ send })
    expect(first.sent).toBe(5)
    expect(sent[0].to).toBe('admin@example.com')
    expect(sent[0].subject).toBe('5 erros novos ou repetidos no Librishelf')
    expect(sent[0].text).toContain('/admin?tab=errors')

    // Logo depois: dentro do intervalo
    expect(await errorReports.digest({ send })).toEqual({ skipped: 'intervalo mínimo' })
    // Passado o intervalo, sem novidade
    expect(await errorReports.digest({ send, now: Date.now() + 61 * 60 * 1000 })).toEqual({ skipped: 'nada novo' })

    // O mesmo erro se repete: volta no próximo resumo, como repetido
    await errorReports.recordServerError({ method: 'GET', path: '/lists/7', context: 'x', error: new Error('boom') })
    const again = await errorReports.digest({ send, now: Date.now() + 61 * 60 * 1000 })
    expect(again.sent).toBe(1)
    expect(sent[1].text).toContain('API: boom · GET /lists/:id (2×)')
    expect(sent[1].text).not.toContain('[novo]')
  })
})

describe('Admin', () => {
  test('lista, filtra e resolve; voltar a acontecer reabre', async () => {
    let res = await request(app).get('/admin/errors').set(asAdmin())
    expect(res.status).toBe(200)
    expect(res.body.open).toBe(5)
    res = await request(app).get('/admin/errors?source=csp').set(asAdmin())
    expect(res.body.errors.map(e => e.source)).toEqual(['csp'])
    expect((await request(app).get('/admin/errors?status=x').set(asAdmin())).status).toBe(400)

    const id = res.body.errors[0].id
    res = await request(app).post(`/admin/errors/${id}/resolve`).set(asAdmin())
    expect(res.status).toBe(200)
    expect((await request(app).post(`/admin/errors/${id}/resolve`).set(asAdmin())).status).toBe(404)
    const { rows: [action] } = await db.query("SELECT * FROM librishelf.admin_actions WHERE action = 'error.resolve'")
    expect(action.details.errorId).toBe(id)
    expect((await request(app).get('/admin/errors').set(asAdmin())).body.open).toBe(4)

    const body = { 'csp-report': { 'document-uri': 'https://librishelf.com/settings', 'effective-directive': 'img-src', 'blocked-uri': 'https://evil.example/a.png' } }
    await request(app).post('/csp-report').set('Content-Type', 'application/csp-report').send(JSON.stringify(body))
    const open = () => request(app).get('/admin/errors').set(asAdmin()).then(res => res.body.open)
    expect(await waitFor(async () => (await open()) === 5 && 5)).toBe(5)
  })

  test('sem liberar o Admin: bloqueado', async () => {
    const res = await request(app).get('/admin/errors').set({ Authorization: `Bearer ${token}` })
    expect(res.body.code).toBe('ADMIN_LOCKED')
  })
})
