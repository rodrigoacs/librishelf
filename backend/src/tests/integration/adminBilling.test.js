import request from 'supertest'
import app from '../../app.js'
import { db } from '../../database/connection.js'
import { confirmEmail } from '../helpers/confirmEmail.js'
import { tokenFrom } from '../helpers/authToken.js'
import { clearDatabase, closeDatabase } from '../../utils/db.js'
import { setFetch, API_URL } from '../../services/mercadoPago.js'

const PASSWORD = 'senha12345'
const tokens = {}
const ids = {}
let unlock = ''
const auth = name => ({ Authorization: `Bearer ${tokens[name]}` })
const asAdmin = () => ({ ...auth('chefe'), Cookie: unlock })
const DAY = 24 * 60 * 60 * 1000

const mp = { canceled: [] }
setFetch(async (url, options = {}) => {
  const path = url.replace(API_URL, '')
  const match = path.match(/^\/preapproval\/([\w-]+)$/)
  if (match && options.method === 'PUT') {
    mp.canceled.push(match[1])
    return new Response(JSON.stringify({ id: match[1], status: 'cancelled' }), { status: 200 })
  }
  return new Response('{}', { status: 404 })
})

async function signUp(name) {
  await request(app).post('/auth/register').send({ acceptTerms: true, username: name, password: PASSWORD, email: `${name}@example.com` })
  await confirmEmail(name)
  tokens[name] = tokenFrom(await request(app).post('/auth/login').send({ username: name, password: PASSWORD }))
  ids[name] = (await db.query('SELECT id FROM librishelf.users WHERE name = $1', [name])).rows[0].id
}

const me = name => request(app).get('/auth/me').set(auth(name))
const lastAction = async () => (await db.query('SELECT * FROM librishelf.admin_actions ORDER BY id DESC LIMIT 1')).rows[0]

async function paidEntitlement(name, kind, { externalId = null, autoRenew = false, amount = 4990, status = 'approved', problem = null } = {}) {
  const userId = ids[name]
  const ent = externalId === 'none' ? null : (await db.query(
    `INSERT INTO librishelf.entitlements (user_id, kind, source, starts_at, ends_at, auto_renew, external_id)
     VALUES ($1, $2, 'mercadopago', now(), now() + interval '30 days', $3, $4) RETURNING id`,
    [userId, kind, autoRenew, externalId]
  )).rows[0]
  const pay = (await db.query(
    `INSERT INTO librishelf.payments (user_id, offer_code, provider, external_id, method, amount_cents, status, entitlement_id, paid_at, problem)
     VALUES ($1, $2, 'mercadopago', $3, 'pix', $4, $5, $6, CASE WHEN $5 = 'approved' THEN now() END, $7) RETURNING id`,
    [userId, kind === 'founder_lifetime' ? 'founder_lifetime' : kind, `mp-${Math.random()}`, amount, status, ent?.id ?? null, problem]
  )).rows[0]
  return { entitlementId: ent ? Number(ent.id) : null, paymentId: Number(pay.id) }
}

beforeAll(async () => {
  process.env.MP_ACCESS_TOKEN = 'TEST-token'
  await clearDatabase()
  await signUp('chefe')
  await db.query("UPDATE librishelf.users SET role = 'admin' WHERE name = 'chefe'")
  for (const name of ['ana', 'bia', 'caio', 'davi']) await signUp(name)
  const res = await request(app).post('/admin/unlock').set(auth('chefe')).send({ password: PASSWORD })
  unlock = (res.headers['set-cookie'] || []).find(c => c.startsWith('admin_unlock=')).split(';')[0]
})

afterAll(async () => {
  delete process.env.MP_ACCESS_TOKEN
  await closeDatabase()
})

describe('acesso', () => {
  test('leitor comum: 403; admin sem liberar: ADMIN_LOCKED', async () => {
    expect((await request(app).get('/admin/offers').set(auth('ana'))).status).toBe(403)
    const res = await request(app).get('/admin/payments').set(auth('chefe'))
    expect(res.body.code).toBe('ADMIN_LOCKED')
  })
})

describe('conceder e revogar Pro', () => {
  test('concede anual por 90 dias com nota; vira Pro e fica no registro', async () => {
    const res = await request(app).post(`/admin/users/${ids.ana}/pro`).set(asAdmin()).send({ kind: 'annual', days: 90, note: 'Parceria' })
    expect(res.status).toBe(200)
    const ends = new Date(res.body.entitlement.endsAt).getTime()
    expect(Math.abs(ends - (Date.now() + 90 * DAY))).toBeLessThan(60_000)
    expect((await me('ana')).body.user.plan.pro).toBe(true)

    const action = await lastAction()
    expect(action.action).toBe('pro.grant')
    expect(action.target_user_id).toBe(ids.ana)
    expect(action.details).toMatchObject({ kind: 'annual', days: 90, note: 'Parceria' })

    const billing = await request(app).get(`/admin/users/${ids.ana}/billing`).set(asAdmin())
    expect(billing.body.entitlements[0]).toMatchObject({ kind: 'annual', source: 'grant', current: true, grantedBy: 'chefe', note: 'Parceria' })
  })

  test('vitalício: sem fim', async () => {
    const res = await request(app).post(`/admin/users/${ids.bia}/pro`).set(asAdmin()).send({ kind: 'founder_lifetime' })
    expect(res.body.entitlement.endsAt).toBeNull()
  })

  test('validação: tipo, prazo, nota e conta', async () => {
    const post = (id, body) => request(app).post(`/admin/users/${id}/pro`).set(asAdmin()).send(body)
    expect((await post(ids.caio, { kind: 'trial' })).body.code).toBe('PRO_GRANT_KIND_INVALID')
    expect((await post(ids.caio, { kind: 'vanguarda' })).body.code).toBe('PRO_GRANT_KIND_INVALID')
    expect((await post(ids.caio, { kind: 'annual', days: 0 })).body.code).toBe('PRO_GRANT_DAYS_INVALID')
    expect((await post(ids.caio, { kind: 'annual', days: 1.5 })).body.code).toBe('PRO_GRANT_DAYS_INVALID')
    expect((await post(ids.caio, { kind: 'annual', note: 'x'.repeat(501) })).body.code).toBe('FIELD_INVALID')
    expect((await post(999999, { kind: 'annual' })).status).toBe(404)
  })

  test('revoga: perde o Pro na hora, registro fica', async () => {
    const billing = await request(app).get(`/admin/users/${ids.ana}/billing`).set(asAdmin())
    const id = billing.body.entitlements[0].id
    const res = await request(app).post(`/admin/entitlements/${id}/revoke`).set(asAdmin()).send({ note: 'fim da parceria' })
    expect(res.status).toBe(200)
    expect((await me('ana')).body.user.plan.pro).toBe(false)
    expect((await lastAction()).action).toBe('pro.revoke')
    const again = await request(app).post(`/admin/entitlements/${id}/revoke`).set(asAdmin()).send({})
    expect(again.body.code).toBe('ENTITLEMENT_NOT_ACTIVE')
    expect((await request(app).post('/admin/entitlements/999999/revoke').set(asAdmin()).send({})).body.code).toBe('ENTITLEMENT_NOT_FOUND')
  })

  test('revogar mensal com renovação: cancela a assinatura no Mercado Pago', async () => {
    const { entitlementId } = await paidEntitlement('caio', 'monthly', { externalId: 'pre-caio', autoRenew: true, amount: 690 })
    const res = await request(app).post(`/admin/entitlements/${entitlementId}/revoke`).set(asAdmin()).send({})
    expect(res.body).toMatchObject({ revoked: true, subscriptionCanceled: true })
    expect(mp.canceled).toContain('pre-caio')
  })
})

describe('pagamentos e reembolso', () => {
  test('reembolso: revoga o Pro, grava refunded_at/refunded_by e mantém o registro', async () => {
    const { entitlementId, paymentId } = await paidEntitlement('davi', 'annual')
    expect((await me('davi')).body.user.plan.pro).toBe(true)

    const res = await request(app).post(`/admin/payments/${paymentId}/refund`).set(asAdmin()).send({ note: 'arrependimento' })
    expect(res.status).toBe(200)
    expect(res.body.entitlementRevoked).toBe(true)
    expect((await me('davi')).body.user.plan.pro).toBe(false)

    const payment = (await db.query('SELECT * FROM librishelf.payments WHERE id = $1', [paymentId])).rows[0]
    expect(payment.refunded_at).not.toBeNull()
    expect(payment.refunded_by).toBe(ids.chefe)
    expect(payment.status).toBe('approved')
    const ent = (await db.query('SELECT status FROM librishelf.entitlements WHERE id = $1', [entitlementId])).rows[0]
    expect(ent.status).toBe('refunded')

    const action = await lastAction()
    expect(action.action).toBe('payment.refund')
    expect(action.details).toMatchObject({ paymentId, entitlementRevoked: true, note: 'arrependimento' })

    const again = await request(app).post(`/admin/payments/${paymentId}/refund`).set(asAdmin()).send({})
    expect(again.body.code).toBe('PAYMENT_ALREADY_REFUNDED')

    // Aparece no histórico da pessoa
    const history = await request(app).get('/plan/payments').set(auth('davi'))
    expect(history.body.payments[0].refundedAt).not.toBeNull()
  })

  test('recusado não tem o que reembolsar', async () => {
    const { paymentId } = await paidEntitlement('davi', 'annual', { externalId: 'none', status: 'rejected' })
    expect((await request(app).post(`/admin/payments/${paymentId}/refund`).set(asAdmin()).send({})).body.code).toBe('PAYMENT_NOT_REFUNDABLE')
  })

  test('filtro de problemas: só os aprovados sem Pro ainda não reembolsados', async () => {
    const { paymentId } = await paidEntitlement('bia', 'founder_annual', { externalId: 'none', problem: 'Vagas esgotadas; reembolsar' })
    let res = await request(app).get('/admin/payments?filter=problem').set(asAdmin())
    expect(res.body.payments.map(p => p.id)).toEqual([paymentId])
    expect(res.body.payments[0]).toMatchObject({ username: 'bia', problem: 'Vagas esgotadas; reembolsar' })

    await request(app).post(`/admin/payments/${paymentId}/refund`).set(asAdmin()).send({})
    res = await request(app).get('/admin/payments?filter=problem').set(asAdmin())
    expect(res.body.payments).toHaveLength(0)
    res = await request(app).get('/admin/payments?filter=refunded').set(asAdmin())
    expect(res.body.total).toBe(2)
    expect((await request(app).get('/admin/payments?filter=x').set(asAdmin())).body.code).toBe('PARAM_INVALID')
  })
})

describe('ofertas', () => {
  test('lista com vagas usadas e restantes', async () => {
    const res = await request(app).get('/admin/offers').set(asAdmin())
    expect(res.body.offers.map(o => o.code)).toEqual(['monthly', 'annual', 'founder_annual', 'founder_lifetime', 'vanguarda'])
    const founder = res.body.offers.find(o => o.code === 'founder_lifetime')
    expect(founder).toMatchObject({ slotsTotal: 100, slotsUsed: 0, slotsLeft: 100, active: false, open: false })
    expect(res.body.activePro).toMatchObject({ founder_lifetime: 1 })
  })

  test('abre a janela de fundador; a oferta pública passa a valer', async () => {
    const startsAt = new Date(Date.now() - 1000).toISOString()
    const endsAt = new Date(Date.now() + 90 * DAY).toISOString()
    const res = await request(app).patch('/admin/offers/founder_annual').set(asAdmin()).send({ active: true, startsAt, endsAt })
    expect(res.status).toBe(200)
    expect(res.body.offer).toMatchObject({ active: true, open: true, endsAt })

    const pub = await request(app).get('/plan/offers')
    expect(pub.body.offers.find(o => o.code === 'founder_annual').available).toBe(true)

    const action = await lastAction()
    expect(action.action).toBe('offer.update')
    expect(action.details.before.active).toBe(false)
    expect(action.details.after.active).toBe(true)
  })

  test('validação: janela invertida, vagas abaixo das usadas, oferta desconhecida', async () => {
    await db.query("UPDATE librishelf.offers SET slots_used = 5 WHERE code = 'founder_lifetime'")
    const patch = (code, body) => request(app).patch(`/admin/offers/${code}`).set(asAdmin()).send(body)
    expect((await patch('founder_lifetime', { startsAt: '2027-01-02T00:00:00Z', endsAt: '2027-01-01T00:00:00Z' })).body.code).toBe('OFFER_WINDOW_INVALID')
    const slots = await patch('founder_lifetime', { slotsTotal: 4 })
    expect(slots.body.code).toBe('OFFER_SLOTS_INVALID')
    expect(slots.body.params).toMatchObject({ used: 5 })
    expect((await patch('founder_lifetime', { slotsTotal: 150 })).body.offer.slotsLeft).toBe(145)
    expect((await patch('nada', { active: true })).status).toBe(404)
    expect((await patch('annual', { active: 'sim' })).body.code).toBe('FIELD_INVALID')
  })
})

describe('webhooks e fila', () => {
  test('lista os com erro e reprocessa', async () => {
    const { rows: [event] } = await db.query(
      `INSERT INTO librishelf.webhook_events (provider, event_id, topic, resource_id, payload, attempts, error)
       VALUES ('mercadopago', 'evt-1', 'payment', '123', '{}', 8, 'HTTP 500') RETURNING id`
    )
    await db.query(
      `INSERT INTO librishelf.webhook_events (provider, event_id, topic, resource_id, payload, processed_at, error)
       VALUES ('mercadopago', 'evt-2', 'plan', '9', '{}', now(), 'Tópico ignorado: plan')`
    )
    const list = await request(app).get('/admin/webhooks?filter=error').set(asAdmin())
    expect(list.body.webhooks.map(w => w.id)).toEqual([Number(event.id)])

    const res = await request(app).post(`/admin/webhooks/${event.id}/reprocess`).set(asAdmin())
    expect(res.body.queued).toBe(true)
    const jobs = (await db.query("SELECT payload FROM librishelf.jobs WHERE type = 'webhook.process'")).rows
    expect(jobs.some(job => Number(job.payload.eventId) === Number(event.id))).toBe(true)
    expect((await lastAction()).action).toBe('webhook.reprocess')
    expect((await request(app).post('/admin/webhooks/999999/reprocess').set(asAdmin())).body.code).toBe('WEBHOOK_NOT_FOUND')
  })

  test('fila: por tipo, falhas recentes e o limite de e-mail', async () => {
    await db.query("INSERT INTO librishelf.jobs (type, failed_at, last_error, attempts) VALUES ('email.send', now(), 'SMTP fora', 6)")
    const res = await request(app).get('/admin/jobs').set(asAdmin())
    expect(res.status).toBe(200)
    expect(res.body.types.find(row => row.type === 'email.send')).toMatchObject({ failed: 1 })
    expect(res.body.failed[0]).toMatchObject({ type: 'email.send', lastError: 'SMTP fora' })
    expect(res.body.email).toMatchObject({ daily: 100, queue: 80 })
  })
})
