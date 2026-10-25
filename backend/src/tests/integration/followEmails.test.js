import request from 'supertest'
import app from '../../app.js'
import { db } from '../../database/connection.js'
import { testOutbox } from '../../services/mailService.js'
import { deliverDue } from '../../services/followEmailService.js'
import { createUnsubscribeToken } from '../../utils/unsubscribeToken.js'
import { confirmEmail } from '../helpers/confirmEmail.js'
import { tokenFrom } from '../helpers/authToken.js'
import { clearDatabase, closeDatabase } from '../../utils/db.js'

const tokens = {}
const ids = {}
const auth = user => ({ Authorization: `Bearer ${tokens[user]}` })
const prefs = (user, body) => request(app).patch('/auth/me/notifications').set(auth(user)).send(body)
const follow = (who, whom) => request(app).post(`/social/follow/${whom}`).set(auth(who))

async function signUp(name, { verified = true } = {}) {
  await request(app).post('/auth/register').send({ username: name, password: 'senha12345', email: `${name}@example.com` })
  if (verified) await confirmEmail(name)
  tokens[name] = tokenFrom(await request(app).post('/auth/login').send({ username: name, password: 'senha12345' }))
  const { rows } = await db.query('SELECT id FROM librishelf.users WHERE name = $1', [name])
  ids[name] = rows[0].id
  // Aceita seguidores
  if (verified) await request(app).patch('/auth/me/visibility').set(auth(name)).send({ showActivity: true })
}

const mailsTo = name => testOutbox().filter(mail => mail.to === `${name}@example.com`)

// O envio não segura a resposta da API: espera um pouco
async function waitFor(check, ms = 1500) {
  const until = Date.now() + ms
  while (Date.now() < until) {
    if (check()) return true
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  return check()
}

const queueOf = async name => (await db.query('SELECT kind, actor_id FROM librishelf.follow_email_queue WHERE user_id = $1', [ids[name]])).rows
// Simula que o último e-mail foi há mais tempo que o intervalo
const pastInterval = name => db.query("UPDATE librishelf.users SET follow_email_sent_at = now() - interval '7 hours' WHERE id = $1", [ids[name]])

beforeAll(async () => {
  await clearDatabase()
  for (const name of ['ana', 'bia', 'caio', 'davi']) await signUp(name)
  await signUp('eva', { verified: false })
  testOutbox().length = 0
})

afterAll(async () => {
  await closeDatabase()
})

describe('Opção na Conta', () => {
  it('começa desligada; valida tipo, idioma e e-mail confirmado', async () => {
    expect((await request(app).get('/auth/me').set(auth('ana'))).body.user.followEmails).toBe(false)
    expect((await prefs('ana', {})).statusCode).toBe(400)
    expect((await prefs('ana', { followEmails: 'sim' })).statusCode).toBe(400)
    expect((await prefs('ana', { locale: 'fr' })).statusCode).toBe(400)
    const unverified = await prefs('eva', { followEmails: true })
    expect(unverified.statusCode).toBe(403)
    expect(unverified.body.code).toBe('EMAIL_NOT_VERIFIED_NOTIFY')

    const res = await prefs('ana', { followEmails: true, locale: 'en' })
    expect(res.body).toEqual({ followEmails: true, locale: 'en' })
    expect((await request(app).get('/auth/me').set(auth('ana'))).body.user.followEmails).toBe(true)
    await prefs('ana', { locale: 'pt' })
  })
})

describe('Pedido para seguir', () => {
  it('primeiro aviso sai na hora, com descadastro de um clique', async () => {
    await follow('bia', 'ana')
    expect(await waitFor(() => mailsTo('ana').length === 1)).toBe(true)
    const [mail] = mailsTo('ana')
    expect(mail.subject).toBe('bia pediu para seguir você no Librishelf')
    expect(mail.text).toContain('/community?tab=requests')
    expect(mail.headers).toEqual({ 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' })
    expect(mail.list.unsubscribe).toMatch(/\/api\/email\/unsubscribe\?token=\d+\.[A-Za-z0-9_-]{32}$/)
    expect(mail.text).toMatch(/\/unsubscribe\?token=/)
    expect(await queueOf('ana')).toEqual([])
  })

  it('dentro do intervalo os avisos esperam e vão juntos', async () => {
    await follow('caio', 'ana')
    await follow('davi', 'ana')
    await new Promise(resolve => setTimeout(resolve, 150))
    expect(mailsTo('ana')).toHaveLength(1)
    expect(await queueOf('ana')).toHaveLength(2)

    // Ainda dentro das 6 h: a varredura não manda
    expect(await deliverDue()).toBe(0)

    // Davi desiste antes do e-mail: o aviso dele some
    await request(app).delete('/social/follow/ana').set(auth('davi'))
    await pastInterval('ana')
    expect(await deliverDue()).toBe(1)
    const last = mailsTo('ana').at(-1)
    expect(last.subject).toBe('caio pediu para seguir você no Librishelf')
    expect(last.text).not.toContain('davi')
    expect(await queueOf('ana')).toEqual([])
  })

  it('quem não ligou a opção não recebe nada', async () => {
    await follow('ana', 'bia')
    await new Promise(resolve => setTimeout(resolve, 150))
    expect(mailsTo('bia')).toHaveLength(0)
    expect(await queueOf('bia')).toEqual([])
  })
})

describe('Pedido aceito', () => {
  it('quem pediu recebe "aceitou seu pedido" (em inglês, se escolheu)', async () => {
    await prefs('caio', { followEmails: true, locale: 'en' })
    await request(app).post('/social/requests/caio/accept').set(auth('ana'))
    expect(await waitFor(() => mailsTo('caio').length === 1)).toBe(true)
    expect(mailsTo('caio')[0].subject).toBe('ana accepted your follow request on Librishelf')
    expect(mailsTo('caio')[0].text).toContain('/community?tab=following')
  })

  it('pedido e aceite juntos no mesmo e-mail; bloqueio tira o aviso', async () => {
    await prefs('bia', { followEmails: true })
    await db.query('UPDATE librishelf.users SET follow_email_sent_at = now() WHERE id = $1', [ids.bia])
    await request(app).post('/social/requests/ana/accept').set(auth('bia')) // bia aceita ana: aviso para ana
    await follow('davi', 'bia') // pedido para bia (fica na fila)
    await follow('caio', 'bia') // outro pedido para bia
    await request(app).post('/social/blocks/caio').set(auth('bia')) // bloqueio: aviso do caio some
    await pastInterval('bia')
    await deliverDue()
    const mail = mailsTo('bia').at(-1)
    expect(mail.subject).toBe('davi pediu para seguir você no Librishelf')
    expect(mail.text).not.toContain('caio')
  })
})

describe('Descadastro', () => {
  it('POST com o token desliga e limpa a fila; desfazer liga de novo', async () => {
    const token = createUnsubscribeToken(ids.ana)
    await db.query("INSERT INTO librishelf.follow_email_queue (user_id, kind, actor_id) VALUES ($1, 'request', $2)", [ids.ana, ids.davi])

    // Como o Gmail faz: POST com o corpo do RFC 8058, sem login
    const res = await request(app).post(`/email/unsubscribe?token=${encodeURIComponent(token)}`)
      .type('form').send('List-Unsubscribe=One-Click')
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ followEmails: false })
    expect((await request(app).get('/auth/me').set(auth('ana'))).body.user.followEmails).toBe(false)
    expect(await queueOf('ana')).toEqual([])

    expect((await request(app).post(`/email/resubscribe?token=${encodeURIComponent(token)}`)).body).toEqual({ followEmails: true })
  })

  it('token inválido ou de outra pessoa → 400; GET não descadastra', async () => {
    const bad = await request(app).post('/email/unsubscribe?token=1.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx')
    expect(bad.statusCode).toBe(400)
    expect(bad.body.code).toBe('UNSUBSCRIBE_TOKEN_INVALID')
    const forged = createUnsubscribeToken(ids.bia).replace(/^\d+/, String(ids.ana))
    expect((await request(app).post(`/email/unsubscribe?token=${forged}`)).statusCode).toBe(400)
    expect((await request(app).get(`/email/unsubscribe?token=${createUnsubscribeToken(ids.ana)}`)).statusCode).toBe(404)
    expect((await request(app).get('/auth/me').set(auth('ana'))).body.user.followEmails).toBe(true)
  })
})
