import request from 'supertest'
import app from '../../app.js'
import { db } from '../../database/connection.js'
import { tokenFrom } from '../helpers/authToken.js'
import { confirmEmail } from '../helpers/confirmEmail.js'
import { clearDatabase, closeDatabase } from '../../utils/db.js'

const PASSWORD = 'senha12345'
const tokens = {}
const ids = {}
const auth = name => ({ Authorization: `Bearer ${tokens[name]}` })
const DAY = 24 * 60 * 60 * 1000

async function signUp(name, { verified = true } = {}) {
  await request(app).post('/auth/register').send({ acceptTerms: true, username: name, password: PASSWORD, email: `${name}@example.com` })
  if (verified) await confirmEmail(name)
  tokens[name] = tokenFrom(await request(app).post('/auth/login').send({ username: name, password: PASSWORD }))
  ids[name] = (await db.query('SELECT id FROM librishelf.users WHERE name = $1', [name])).rows[0].id
}

const activate = name => request(app).post('/plan/trial').set(auth(name))

beforeAll(async () => {
  await clearDatabase()
  for (const name of ['ana', 'bia', 'caio', 'davi']) await signUp(name)
  await signUp('eva', { verified: false })
})

afterAll(closeDatabase)

describe('teste grátis', () => {
  test('sem login: 401', async () => {
    expect((await request(app).post('/plan/trial')).status).toBe(401)
  })

  test('ativa 14 dias de Pro, sem renovação', async () => {
    const res = await activate('ana')
    expect(res.status).toBe(201)

    const ends = new Date(res.body.endsAt).getTime()
    expect(Math.abs(ends - (Date.now() + 14 * DAY))).toBeLessThan(60_000)
    expect(res.body.plan).toMatchObject({ pro: true, current: { kind: 'trial', source: 'trial', autoRenew: false }, trial: { available: false } })

    const { rows } = await db.query('SELECT pro_trial_used_at FROM librishelf.users WHERE id = $1', [ids.ana])
    expect(rows[0].pro_trial_used_at).not.toBeNull()
  })

  test('só uma vez por conta: TRIAL_USED', async () => {
    const res = await activate('ana')
    expect(res.status).toBe(409)
    expect(res.body.code).toBe('TRIAL_USED')
  })

  test('nem depois de o teste acabar', async () => {
    await db.query("UPDATE librishelf.entitlements SET ends_at = now() - interval '1 second', starts_at = now() - interval '15 days' WHERE user_id = $1", [ids.ana])
    const me = (await request(app).get('/auth/me').set(auth('ana'))).body.user
    expect(me.plan.pro).toBe(false)
    expect(me.plan.trial.available).toBe(false)
    expect((await activate('ana')).body.code).toBe('TRIAL_USED')
  })

  test('pedidos simultâneos: um só teste', async () => {
    const results = await Promise.all([activate('bia'), activate('bia'), activate('bia')])
    expect(results.map(r => r.status).sort()).toEqual([201, 409, 409])
    const { rows } = await db.query("SELECT count(*)::int AS n FROM librishelf.entitlements WHERE user_id = $1 AND kind = 'trial'", [ids.bia])
    expect(rows[0].n).toBe(1)
  })

  test('quem já tem Pro não gasta o teste', async () => {
    await db.query("INSERT INTO librishelf.entitlements (user_id, kind, source) VALUES ($1, 'vanguarda', 'grant')", [ids.caio])
    const res = await activate('caio')
    expect(res.status).toBe(409)
    expect(res.body.code).toBe('TRIAL_ALREADY_PRO')
    expect((await request(app).get('/auth/me').set(auth('caio'))).body.user.plan.trial.available).toBe(true)
  })

  test('e-mail não confirmado: EMAIL_NOT_VERIFIED_TRIAL', async () => {
    const res = await activate('eva')
    expect(res.status).toBe(403)
    expect(res.body.code).toBe('EMAIL_NOT_VERIFIED_TRIAL')
  })

  test('teste marcado em users (entitlement apagado) continua contando', async () => {
    await db.query('UPDATE librishelf.users SET pro_trial_used_at = now() WHERE id = $1', [ids.davi])
    expect((await activate('davi')).body.code).toBe('TRIAL_USED')
  })
})
