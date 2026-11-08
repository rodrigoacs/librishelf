import express from 'express'
import request from 'supertest'
import app from '../../app.js'
import { db } from '../../database/connection.js'
import { authenticateToken } from '../../middlewares/auth.js'
import { requirePro, requireProForWrites } from '../../middlewares/requirePro.js'
import { confirmEmail } from '../helpers/confirmEmail.js'
import { tokenFrom } from '../helpers/authToken.js'
import { clearDatabase, closeDatabase } from '../../utils/db.js'
import { PRO_FEATURES } from '../../config/features.js'

const PASSWORD = 'senha12345'
const tokens = {}
const ids = {}
const auth = name => ({ Authorization: `Bearer ${tokens[name]}` })

async function signUp(name) {
  await request(app).post('/auth/register').send({ acceptTerms: true, username: name, password: PASSWORD, email: `${name}@example.com` })
  await confirmEmail(name)
  tokens[name] = tokenFrom(await request(app).post('/auth/login').send({ username: name, password: PASSWORD }))
  ids[name] = (await db.query('SELECT id FROM librishelf.users WHERE name = $1', [name])).rows[0].id
}

function grant(name, kind, { endsAt, startsAt = "now() - interval '1 day'", status = 'active', source = 'grant' } = {}) {
  return db.query(
    `INSERT INTO librishelf.entitlements (user_id, kind, source, status, starts_at, ends_at)
     VALUES ($1, $2, $3, $4, ${startsAt}, ${endsAt ?? 'NULL'})`,
    [ids[name], kind, source, status]
  )
}

// Rotas de mentira: os recursos Pro de verdade chegam nos próximos pacotes
const probe = express()
probe.use(express.json())
const ok = (req, res) => res.json({ ok: true })
probe.get('/collector', authenticateToken, requireProForWrites('collector'), ok)
probe.post('/collector', authenticateToken, requireProForWrites('collector'), ok)
probe.delete('/collector', authenticateToken, requireProForWrites('collector'), ok)
probe.get('/stats', authenticateToken, requirePro('stats_advanced'), ok)
probe.post('/export', authenticateToken, requirePro('export'), ok)

beforeAll(async () => {
  await clearDatabase()
  for (const name of ['livre', 'teste', 'vencido', 'vitalicio', 'revogado', 'futuro', 'limite']) await signUp(name)
})

afterAll(closeDatabase)

describe('requirePro', () => {
  test('sem login: 401', async () => {
    expect((await request(probe).post('/collector')).status).toBe(401)
  })

  test('sem Pro: lê os dados Pro, mas não escreve (PRO_REQUIRED)', async () => {
    expect((await request(probe).get('/collector').set(auth('livre'))).status).toBe(200)

    for (const method of ['post', 'delete']) {
      const res = await request(probe)[method]('/collector').set(auth('livre'))
      expect(res.status).toBe(403)
      expect(res.body).toMatchObject({ code: 'PRO_REQUIRED', params: { feature: 'collector' } })
    }
  })

  test('requirePro recusa até a leitura; recurso grátis passa sempre', async () => {
    expect((await request(probe).get('/stats').set(auth('livre'))).body.code).toBe('PRO_REQUIRED')
    expect((await request(probe).post('/export').set(auth('livre'))).status).toBe(200)
  })

  test('teste em andamento libera a escrita', async () => {
    await grant('teste', 'trial', { source: 'trial', endsAt: "now() + interval '14 days'" })
    expect((await request(probe).post('/collector').set(auth('teste'))).status).toBe(200)
    expect((await request(probe).get('/stats').set(auth('teste'))).status).toBe(200)
  })

  test('vitalício (ends_at nulo) libera', async () => {
    await grant('vitalicio', 'vanguarda')
    expect((await request(probe).post('/collector').set(auth('vitalicio'))).status).toBe(200)
  })

  test('venceu: só leitura na hora, mesmo antes do job trocar o status', async () => {
    // status ainda 'active', mas ends_at já passou
    await grant('vencido', 'annual', { source: 'mercadopago', startsAt: "now() - interval '1 year'", endsAt: "now() - interval '1 second'" })
    expect((await request(probe).post('/collector').set(auth('vencido'))).body.code).toBe('PRO_REQUIRED')
    expect((await request(probe).get('/collector').set(auth('vencido'))).status).toBe(200)
  })

  test('expira no instante de ends_at', async () => {
    const { rows } = await db.query(
      `INSERT INTO librishelf.entitlements (user_id, kind, source, starts_at, ends_at)
       VALUES ($1, 'annual', 'mercadopago', now() - interval '1 year', now() + interval '1 hour') RETURNING id`,
      [ids.limite]
    )
    expect((await request(probe).post('/collector').set(auth('limite'))).status).toBe(200)

    // O relógio "anda": fim exatamente agora já não vale (ends_at > now())
    await db.query('UPDATE librishelf.entitlements SET ends_at = now() WHERE id = $1', [rows[0].id])
    expect((await request(probe).post('/collector').set(auth('limite'))).body.code).toBe('PRO_REQUIRED')
  })

  test('revogado e reembolsado não valem, mesmo dentro do prazo', async () => {
    await grant('revogado', 'annual', { status: 'canceled', endsAt: "now() + interval '6 months'" })
    await grant('revogado', 'founder_lifetime', { status: 'refunded', source: 'mercadopago' })
    expect((await request(probe).post('/collector').set(auth('revogado'))).body.code).toBe('PRO_REQUIRED')
  })

  test('período que ainda não começou não vale', async () => {
    await grant('futuro', 'founder_annual', { startsAt: "now() + interval '1 day'", endsAt: "now() + interval '1 year'" })
    expect((await request(probe).post('/collector').set(auth('futuro'))).body.code).toBe('PRO_REQUIRED')
  })

  test('nome de recurso errado quebra na hora de montar a rota', () => {
    expect(() => requirePro('nao_existe')).toThrow(/Recurso desconhecido/)
    expect(() => requireProForWrites('nao_existe')).toThrow(/Recurso desconhecido/)
  })
})

describe('/auth/me', () => {
  const me = async name => (await request(app).get('/auth/me').set(auth(name))).body.user

  test('conta grátis: sem Pro, recursos Pro bloqueados, teste disponível, sem selos', async () => {
    const user = await me('livre')
    expect(user.plan).toMatchObject({ pro: false, current: null, endedAt: null, trial: { available: true, usedAt: null } })
    expect(user.plan.features).toMatchObject({ export: true, import: true, loans: true })
    for (const feature of PRO_FEATURES) expect(user.plan.features[feature]).toBe(false)
    expect(user.badges).toEqual([])
  })

  test('teste em andamento: Pro com validade e teste já usado', async () => {
    const { plan } = await me('teste')
    expect(plan.pro).toBe(true)
    expect(plan.current).toMatchObject({ kind: 'trial', source: 'trial', lifetime: false, autoRenew: false })
    expect(new Date(plan.current.endsAt).getTime()).toBeGreaterThan(Date.now())
    expect(plan.trial.available).toBe(false)
    for (const feature of PRO_FEATURES) expect(plan.features[feature]).toBe(true)
  })

  test('Vanguarda: vitalício e selo', async () => {
    await db.query("INSERT INTO librishelf.user_badges (user_id, badge) VALUES ($1, 'vanguarda')", [ids.vitalicio])
    const user = await me('vitalicio')
    expect(user.plan.current).toMatchObject({ kind: 'vanguarda', lifetime: true, endsAt: null })
    expect(user.badges).toEqual(['vanguarda'])
  })

  test('vitalício vem antes de um anual que também está ativo', async () => {
    await grant('vitalicio', 'annual', { source: 'mercadopago', endsAt: "now() + interval '300 days'" })
    expect((await me('vitalicio')).plan.current.kind).toBe('vanguarda')
  })

  test('Pro vencido: endedAt diz quando acabou', async () => {
    const { plan } = await me('vencido')
    expect(plan.pro).toBe(false)
    expect(plan.current).toBeNull()
    expect(new Date(plan.endedAt).getTime()).toBeLessThanOrEqual(Date.now())
  })

  test('teste marcado como usado em users não fica disponível de novo', async () => {
    await db.query('UPDATE librishelf.users SET pro_trial_used_at = now() WHERE id = $1', [ids.livre])
    expect((await me('livre')).plan.trial.available).toBe(false)
  })
})
