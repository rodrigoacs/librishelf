import request from 'supertest'
import app from '../../app.js'
import { db } from '../../database/connection.js'
import { tokenFrom } from '../helpers/authToken.js'
import { confirmEmail } from '../helpers/confirmEmail.js'
import { clearDatabase, closeDatabase } from '../../utils/db.js'
import { testOutbox } from '../../services/mailService.js'
import * as vanguarda from '../../services/vanguardaService.js'

const PASSWORD = 'senha12345'
const tokens = {}
const ids = {}
const auth = name => ({ Authorization: `Bearer ${tokens[name]}` })

async function signUp(name, { verified = true } = {}) {
  await request(app).post('/auth/register').send({ username: name, password: PASSWORD, email: `${name}@example.com` })
  if (verified) await confirmEmail(name)
  tokens[name] = tokenFrom(await request(app).post('/auth/login').send({ username: name, password: PASSWORD }))
  ids[name] = (await db.query('SELECT id FROM librishelf.users WHERE name = $1', [name])).rows[0].id
}

async function addBooks(name, count, from = 1) {
  for (let i = from; i < from + count; i++) {
    const res = await request(app).post('/library').set(auth(name)).field({ title: `Livro ${i}`, authors: 'Autora Qualquer' })
    expect(res.status).toBe(201)
  }
}

// Livros direto no banco, sem passar pelo gatilho (para montar cenários)
async function seedBooks(name, count) {
  await db.query(
    "INSERT INTO librishelf.books (title, user_id) SELECT 'Semente ' || g, $1 FROM generate_series(1, $2) g",
    [ids[name], count]
  )
}

const hasVanguarda = async name => (await db.query(
  "SELECT 1 FROM librishelf.entitlements WHERE user_id = $1 AND kind = 'vanguarda' AND ends_at IS NULL AND status = 'active'",
  [ids[name]]
)).rowCount === 1
const slotsUsed = async () => (await db.query("SELECT slots_used FROM librishelf.offers WHERE code = 'vanguarda'")).rows[0].slots_used
const me = async name => (await request(app).get('/auth/me').set(auth(name))).body.user

function verifyToken(email) {
  const mail = [...testOutbox()].reverse().find(m => m.to === email && m.text.includes('/verify-email'))
  return mail.text.match(/\/verify-email\?token=([A-Za-z0-9_-]+)/)[1]
}

beforeAll(clearDatabase)
afterAll(closeDatabase)

describe('Vanguarda — gatilhos', () => {
  test('o 10º livro concede; o 9º ainda não', async () => {
    await signUp('ana')
    await addBooks('ana', 9)
    expect(await hasVanguarda('ana')).toBe(false)

    await addBooks('ana', 1, 10)
    expect(await hasVanguarda('ana')).toBe(true)
    expect(await slotsUsed()).toBe(1)

    const user = await me('ana')
    expect(user.badges).toEqual(['vanguarda'])
    expect(user.plan).toMatchObject({ pro: true, current: { kind: 'vanguarda', lifetime: true, endsAt: null } })
  })

  test('10 livros sem e-mail confirmado não bastam; confirmar o e-mail concede', async () => {
    await signUp('bia', { verified: false })
    await addBooks('bia', 10)
    expect(await hasVanguarda('bia')).toBe(false)

    const res = await request(app).post('/auth/email/verify').send({ token: verifyToken('bia@example.com') })
    expect(res.status).toBe(200)
    expect(await hasVanguarda('bia')).toBe(true)
    expect(await slotsUsed()).toBe(2)
  })

  test('importação também é gatilho', async () => {
    await signUp('caio')
    await seedBooks('caio', 8)
    const csv = 'title,authors\nUm,Fulano\nDois,Beltrano\n'
    const res = await request(app).post('/library/import').set(auth('caio')).attach('file', Buffer.from(csv), 'livros.csv')
    expect(res.status).toBe(200)
    expect(res.body.imported).toBe(2)
    expect(await hasVanguarda('caio')).toBe(true)
  })

  test('não concede duas vezes nem gasta outra vaga', async () => {
    const before = await slotsUsed()
    await addBooks('ana', 1, 11)
    expect(await vanguarda.check(ids.ana)).toEqual({ status: 'already' })
    expect(await slotsUsed()).toBe(before)
  })

  test('excluir livros depois não tira a Vanguarda', async () => {
    await db.query('DELETE FROM librishelf.books WHERE user_id = $1', [ids.ana])
    expect(await hasVanguarda('ana')).toBe(true)
  })

  test('oferta desligada não concede', async () => {
    await signUp('davi')
    await seedBooks('davi', 10)
    await db.query("UPDATE librishelf.offers SET active = false WHERE code = 'vanguarda'")
    expect(await vanguarda.check(ids.davi)).toEqual({ status: 'closed' })
    await db.query("UPDATE librishelf.offers SET active = true WHERE code = 'vanguarda'")
    expect((await vanguarda.check(ids.davi)).status).toBe('granted')
  })
})

describe('Vanguarda — limite de 100', () => {
  test('a conta 101 é recusada, mesmo com pedidos simultâneos', async () => {
    // Faltam 2 vagas; 5 contas efetivas pedem ao mesmo tempo
    await db.query("UPDATE librishelf.offers SET slots_used = 98 WHERE code = 'vanguarda'")
    const names = ['e1', 'e2', 'e3', 'e4', 'e5']
    for (const name of names) {
      await signUp(name)
      await seedBooks(name, 10)
    }

    const results = await Promise.all(names.map(name => vanguarda.check(ids[name])))
    expect(results.filter(r => r.status === 'granted').length).toBe(2)
    expect(results.filter(r => r.status === 'closed').length).toBe(3)
    expect(results.filter(r => r.status === 'granted').map(r => r.slot).sort((a, b) => a - b)).toEqual([99, 100])
    expect(await slotsUsed()).toBe(100)

    const { rows } = await db.query("SELECT count(*)::int AS n FROM librishelf.user_badges WHERE badge = 'vanguarda' AND user_id = ANY($1)", [names.map(n => ids[n])])
    expect(rows[0].n).toBe(2)
  })

  test('com as vagas esgotadas, o 10º livro só cadastra o livro', async () => {
    await signUp('tarde')
    await seedBooks('tarde', 9)
    await addBooks('tarde', 1, 10)
    expect(await hasVanguarda('tarde')).toBe(false)
    expect((await me('tarde')).badges).toEqual([])
  })
})
