import request from 'supertest'
import app from '../../app.js'
import { db } from '../../database/connection.js'
import { tokenFrom } from '../helpers/authToken.js'
import { confirmEmail } from '../helpers/confirmEmail.js'
import { clearDatabase, closeDatabase } from '../../utils/db.js'
import { setFetch } from '../../services/mercadoPago.js'
import { TERMS_VERSION } from '../../config/terms.js'

const PASSWORD = 'senha12345'
const tokens = {}
const auth = name => ({ Authorization: `Bearer ${tokens[name]}` })
const register = body => request(app).post('/auth/register').send({ password: PASSWORD, ...body })
const me = async name => (await request(app).get('/auth/me').set(auth(name))).body.user
const acceptances = async name => (await db.query(
  `SELECT t.terms_version FROM librishelf.terms_acceptance t
   JOIN librishelf.users u ON u.id = t.user_id WHERE u.name = $1 ORDER BY t.accepted_at`, [name]
)).rows.map(row => row.terms_version)

// Versão antiga: a conta perde o aceite vigente e fica só com um anterior
const toOldVersion = name => db.query(
  `UPDATE librishelf.terms_acceptance SET terms_version = '2000-01-01'
   WHERE user_id = (SELECT id FROM librishelf.users WHERE name = $1)`, [name]
)

let providerCalls = 0

beforeAll(async () => {
  await clearDatabase()
  process.env.MP_ACCESS_TOKEN = 'TEST-token'
  // O checkout recusado não pode chegar ao Mercado Pago
  setFetch(async () => {
    providerCalls += 1
    return new Response('{}', { status: 500 })
  })
  for (const name of ['ana', 'bia']) {
    await register({ username: name, email: `${name}@example.com`, acceptTerms: true })
    await confirmEmail(name)
    tokens[name] = tokenFrom(await request(app).post('/auth/login').send({ username: name, password: PASSWORD }))
  }
})

afterAll(async () => {
  setFetch(null)
  delete process.env.MP_ACCESS_TOKEN
  await closeDatabase()
})

describe('cadastro', () => {
  test('sem aceitar os termos: 400 e nenhuma conta criada', async () => {
    for (const acceptTerms of [undefined, false, 'true']) {
      const res = await register({ username: 'caio', email: 'caio@example.com', acceptTerms })
      expect(res.status).toBe(400)
      expect(res.body.code).toBe('TERMS_REQUIRED')
    }
    const { rows } = await db.query("SELECT count(*)::int AS n FROM librishelf.users WHERE name = 'caio'")
    expect(rows[0].n).toBe(0)
  })

  test('aceitando, a conta nasce com o aceite da versão vigente', async () => {
    expect(await acceptances('ana')).toEqual([TERMS_VERSION])
    expect((await me('ana')).terms).toMatchObject({ version: TERMS_VERSION, accepted: true })
  })
})

describe('versão nova', () => {
  test('sem o aceite vigente, /auth/me avisa', async () => {
    await toOldVersion('bia')
    expect((await me('bia')).terms).toEqual({ version: TERMS_VERSION, accepted: false, acceptedAt: null })
  })

  test('checkout recusado até aceitar, sem chamar o Mercado Pago', async () => {
    const res = await request(app).post('/plan/checkout').set(auth('bia')).send({ offer: 'annual' })
    expect(res.status).toBe(403)
    expect(res.body.code).toBe('TERMS_NOT_ACCEPTED')
    expect(providerCalls).toBe(0)
    const { rows } = await db.query('SELECT count(*)::int AS n FROM librishelf.offer_reservations')
    expect(rows[0].n).toBe(0)
  })

  test('aceite exige a versão que o servidor tem', async () => {
    let res = await request(app).post('/auth/me/terms').set(auth('bia')).send({})
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('TERMS_VERSION_REQUIRED')

    res = await request(app).post('/auth/me/terms').set(auth('bia')).send({ version: '2000-01-01' })
    expect(res.status).toBe(409)
    expect(res.body.code).toBe('TERMS_OUTDATED')
  })

  test('aceitando, guarda as duas versões e libera o checkout', async () => {
    const res = await request(app).post('/auth/me/terms').set(auth('bia')).send({ version: TERMS_VERSION })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ version: TERMS_VERSION, accepted: true })
    expect(await acceptances('bia')).toEqual(['2000-01-01', TERMS_VERSION])

    // Passa do aceite e chega ao provedor (que aqui falha de propósito)
    const checkout = await request(app).post('/plan/checkout').set(auth('bia')).send({ offer: 'annual' })
    expect(checkout.status).toBe(502)
    expect(providerCalls).toBe(1)
  })

  test('aceitar de novo não muda a data do primeiro aceite', async () => {
    const before = (await me('bia')).terms.acceptedAt
    await request(app).post('/auth/me/terms').set(auth('bia')).send({ version: TERMS_VERSION })
    expect((await me('bia')).terms.acceptedAt).toBe(before)
  })

  test('sem sessão: 401', async () => {
    const res = await request(app).post('/auth/me/terms').send({ version: TERMS_VERSION })
    expect(res.status).toBe(401)
  })
})
