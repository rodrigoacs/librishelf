import request from 'supertest'
import app from '../../app.js'
import { db } from '../../database/connection.js'
import { tokenFrom } from '../helpers/authToken.js'
import { confirmEmail } from '../helpers/confirmEmail.js'
import { clearDatabase, closeDatabase } from '../../utils/db.js'
import { setFetch, API_URL } from '../../services/mercadoPago.js'
import { sign, buildManifest } from '../../utils/mercadoPagoSignature.js'
import { addMonth, GRACE_DAYS } from '../../services/subscriptionService.js'
import * as queue from '../../jobs/queue.js'
import { drain } from '../../jobs/worker.js'

const PASSWORD = 'senha12345'
const SECRET = 'segredo-do-webhook-de-teste'
const DAY_MS = 24 * 60 * 60 * 1000
const tokens = {}
const ids = {}
const auth = name => ({ Authorization: `Bearer ${tokens[name]}` })

// ---------------------------------------------------------- Mercado Pago falso
const mp = { preapprovals: new Map(), invoices: new Map(), payments: new Map(), bodies: [], canceled: [], failCancel: false, seq: 5000 }
const next = () => String(++mp.seq)

setFetch(async (url, options = {}) => {
  const path = url.replace(API_URL, '')
  const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
  const method = options.method || 'GET'

  if (path === '/preapproval' && method === 'POST') {
    const body = JSON.parse(options.body)
    const id = `pre${next()}`
    mp.bodies.push(body)
    mp.preapprovals.set(id, { id, status: 'pending', external_reference: body.external_reference, init_point: `https://mp.test/subscriptions/checkout?preapproval_id=${id}` })
    return json(201, mp.preapprovals.get(id))
  }
  if (path === '/checkout/preferences' && method === 'POST') {
    return json(201, { id: `pref${next()}`, init_point: 'https://mp.test/checkout' })
  }
  let match = path.match(/^\/preapproval\/([\w-]+)$/)
  if (match) {
    const pre = mp.preapprovals.get(match[1])
    if (!pre) return json(404, { message: 'not found' })
    if (method === 'PUT') {
      if (mp.failCancel) return json(500, { message: 'internal_error' })
      Object.assign(pre, JSON.parse(options.body))
      mp.canceled.push(pre.id)
    }
    return json(200, pre)
  }
  match = path.match(/^\/authorized_payments\/(\d+)$/)
  if (match) {
    const invoice = mp.invoices.get(match[1])
    return invoice ? json(200, invoice) : json(404, { message: 'not found' })
  }
  if (path.startsWith('/authorized_payments/search')) {
    const preapprovalId = new URL(url).searchParams.get('preapproval_id')
    return json(200, { results: [...mp.invoices.values()].filter(i => i.preapproval_id === preapprovalId) })
  }
  if (path.startsWith('/v1/payments/search')) {
    const reference = new URL(url).searchParams.get('external_reference')
    return json(200, { results: [...mp.payments.values()].filter(p => p.external_reference === reference) })
  }
  match = path.match(/^\/v1\/payments\/(\d+)$/)
  if (match) {
    const payment = mp.payments.get(match[1])
    return payment ? json(200, payment) : json(404, { message: 'not found' })
  }
  return json(404, { message: 'rota desconhecida no mock' })
})

/** Cobrança do mês: authorized_payment + payment (sem external_reference, como pode vir) */
function charge(preapprovalId, { status = 'approved', amount = 6.9, withReference = false } = {}) {
  const paymentId = next()
  mp.payments.set(paymentId, {
    id: Number(paymentId), status, status_detail: status === 'approved' ? 'accredited' : 'cc_rejected_other_reason',
    external_reference: withReference ? mp.preapprovals.get(preapprovalId).external_reference : null,
    transaction_amount: amount, currency_id: 'BRL', payment_method_id: 'master', payment_type_id: 'credit_card',
    date_created: new Date().toISOString(), date_approved: status === 'approved' ? new Date().toISOString() : null,
    card: { last_four_digits: '1234' }
  })
  const invoiceId = next()
  mp.invoices.set(invoiceId, { id: Number(invoiceId), preapproval_id: preapprovalId, type: 'scheduled', status: 'processed', payment: { id: Number(paymentId), status } })
  return { paymentId, invoiceId }
}

function webhook(topic, resourceId, eventId = `evt-${topic}-${resourceId}-${Math.random()}`) {
  const ts = String(Date.now())
  const signature = sign(buildManifest({ dataId: resourceId, requestId: 'req', ts }), SECRET)
  return request(app)
    .post(`/webhooks/mercadopago?data.id=${resourceId}&type=${topic}`)
    .set('x-signature', `ts=${ts},v1=${signature}`)
    .set('x-request-id', 'req')
    .send({ id: eventId, type: topic, action: `${topic}.updated`, data: { id: resourceId } })
}

const runJobs = () => drain('teste', { types: ['webhook.process', 'mercadopago.reconcile'] })

async function signUp(name) {
  await request(app).post('/auth/register').send({ acceptTerms: true, username: name, password: PASSWORD, email: `${name}@example.com` })
  await confirmEmail(name)
  tokens[name] = tokenFrom(await request(app).post('/auth/login').send({ username: name, password: PASSWORD }))
  ids[name] = (await db.query('SELECT id FROM librishelf.users WHERE name = $1', [name])).rows[0].id
}

const me = async name => (await request(app).get('/auth/me').set(auth(name))).body.user
const monthly = async name => (await db.query("SELECT * FROM librishelf.entitlements WHERE user_id = $1 AND kind = 'monthly'", [ids[name]])).rows

/** Assina o mensal e autoriza no Mercado Pago. → id do preapproval */
async function subscribe(name) {
  const res = await request(app).post('/plan/checkout').set(auth(name)).send({ offer: 'monthly' })
  expect(res.status).toBe(201)
  const preapprovalId = new URL(res.body.url).searchParams.get('preapproval_id')
  mp.preapprovals.get(preapprovalId).status = 'authorized'
  await webhook('subscription_preapproval', preapprovalId)
  await runJobs()
  return { preapprovalId, reference: res.body.reference }
}

beforeAll(async () => {
  process.env.MP_ACCESS_TOKEN = 'TEST-token'
  process.env.MP_WEBHOOK_SECRET = SECRET
  await clearDatabase()
  for (const name of ['ana', 'bia', 'caio', 'davi', 'eva', 'fred']) await signUp(name)
})

afterAll(async () => {
  setFetch(null)
  delete process.env.MP_ACCESS_TOKEN
  delete process.env.MP_WEBHOOK_SECRET
  await closeDatabase()
})

describe('mensal', () => {
  test('cria a assinatura no cartão: mensal, R$ 6,90, status pending', async () => {
    const res = await request(app).post('/plan/checkout').set(auth('ana')).send({ offer: 'monthly' })
    expect(res.status).toBe(201)
    expect(res.body.url).toMatch(/subscriptions\/checkout/)
    expect(mp.bodies.at(-1)).toMatchObject({
      external_reference: res.body.reference,
      payer_email: 'ana@example.com',
      status: 'pending',
      auto_recurring: { frequency: 1, frequency_type: 'months', transaction_amount: 6.9, currency_id: 'BRL' }
    })
    expect(mp.bodies.at(-1).back_url).toContain(`/plan/return?result=subscription&ref=${res.body.reference}`)
  })

  test('autorizar sozinho ainda não dá Pro; a cobrança aprovada dá um mês + folga', async () => {
    const { preapprovalId } = await subscribe('bia')
    expect((await me('bia')).plan.pro).toBe(false)

    const { invoiceId } = charge(preapprovalId)
    await webhook('subscription_authorized_payment', invoiceId)
    await runJobs()

    const { plan } = await me('bia')
    expect(plan.current).toMatchObject({ kind: 'monthly', autoRenew: true, lifetime: false })
    const expected = addMonth(new Date()).getTime() + GRACE_DAYS * DAY_MS
    expect(Math.abs(new Date(plan.current.endsAt) - expected)).toBeLessThan(60_000)
  })

  test('mesma cobrança por dois tópicos (payment e authorized_payment) não estende duas vezes', async () => {
    const { preapprovalId, reference } = await subscribe('caio')
    const { paymentId, invoiceId } = charge(preapprovalId, { withReference: true })
    await webhook('payment', paymentId)
    await webhook('subscription_authorized_payment', invoiceId)
    await webhook('subscription_authorized_payment', invoiceId, 'evt-fixo')
    await webhook('subscription_authorized_payment', invoiceId, 'evt-fixo')
    await runJobs()

    const rows = await monthly('caio')
    expect(rows.length).toBe(1)
    const expected = addMonth(new Date()).getTime() + GRACE_DAYS * DAY_MS
    expect(Math.abs(new Date(rows[0].ends_at) - expected)).toBeLessThan(60_000)
    expect((await db.query('SELECT count(*)::int AS n FROM librishelf.payments WHERE external_id = $1', [paymentId])).rows[0].n).toBe(1)
    expect((await request(app).get(`/plan/checkout/${reference}`).set(auth('caio'))).body).toMatchObject({ state: 'active', subscription: true })
  })

  test('segundo mês soma a partir do fim do primeiro, sem acumular a folga', async () => {
    const [before] = await monthly('bia')
    const preapprovalId = before.external_id
    await webhook('subscription_authorized_payment', charge(preapprovalId).invoiceId)
    await runJobs()

    const [after] = await monthly('bia')
    const firstPaidEnd = new Date(before.ends_at).getTime() - GRACE_DAYS * DAY_MS
    expect(new Date(after.ends_at).getTime()).toBe(addMonth(new Date(firstPaidEnd)).getTime() + GRACE_DAYS * DAY_MS)
  })

  test('cobrança recusada não muda nada', async () => {
    const [before] = await monthly('bia')
    await webhook('subscription_authorized_payment', charge(before.external_id, { status: 'rejected' }).invoiceId)
    await runJobs()
    const [after] = await monthly('bia')
    expect(after.ends_at).toEqual(before.ends_at)
  })

  test('com assinatura ativa não abre outra', async () => {
    const res = await request(app).post('/plan/checkout').set(auth('bia')).send({ offer: 'monthly' })
    expect(res.status).toBe(409)
    expect(res.body.code).toBe('SUBSCRIPTION_ACTIVE')
  })

  test('cancelar em Conta: cancela no Mercado Pago, Pro até o fim do período pago', async () => {
    const [before] = await monthly('bia')
    const res = await request(app).post('/plan/subscription/cancel').set(auth('bia'))
    expect(res.status).toBe(200)
    expect(mp.canceled).toContain(before.external_id)
    expect(mp.preapprovals.get(before.external_id).status).toBe('cancelled')

    expect(res.body.plan).toMatchObject({ pro: true, current: { kind: 'monthly', autoRenew: false } })
    expect(res.body.plan.current.canceledAt).not.toBeNull()
    expect(new Date(res.body.endsAt).getTime()).toBe(new Date(before.ends_at).getTime() - GRACE_DAYS * DAY_MS)

    // O webhook do cancelamento chega depois: não tira a folga de novo
    await webhook('subscription_preapproval', before.external_id)
    await runJobs()
    expect(new Date((await monthly('bia'))[0].ends_at).toISOString()).toBe(res.body.endsAt)

    expect((await request(app).post('/plan/subscription/cancel').set(auth('bia'))).body.code).toBe('SUBSCRIPTION_NOT_FOUND')
  })

  test('Mercado Pago cancela sozinho (3 cobranças recusadas): renovação desligada', async () => {
    const [row] = await monthly('caio')
    mp.preapprovals.get(row.external_id).status = 'cancelled'
    await webhook('subscription_preapproval', row.external_id)
    await runJobs()
    const [after] = await monthly('caio')
    expect(after.auto_renew).toBe(false)
    expect(new Date(after.ends_at).getTime()).toBe(new Date(row.ends_at).getTime() - GRACE_DAYS * DAY_MS)
  })

  test('cobrança atrasada depois do Pro vencer: volta a valer', async () => {
    const { preapprovalId } = await subscribe('davi')
    await webhook('subscription_authorized_payment', charge(preapprovalId).invoiceId)
    await runJobs()
    await db.query("UPDATE librishelf.entitlements SET status = 'expired', ends_at = now() - interval '1 day', starts_at = now() - interval '40 days' WHERE user_id = $1", [ids.davi])
    expect((await me('davi')).plan.pro).toBe(false)

    await webhook('subscription_authorized_payment', charge(preapprovalId).invoiceId)
    await runJobs()
    const [row] = await monthly('davi')
    expect(row.status).toBe('active')
    expect((await me('davi')).plan.pro).toBe(true)
  })

  test('histórico de cobranças em Conta', async () => {
    const res = await request(app).get('/plan/payments').set(auth('bia'))
    expect(res.status).toBe(200)
    expect(res.body.payments.map(p => p.status).sort()).toEqual(['approved', 'approved', 'rejected'])
    expect(res.body.payments[0]).toMatchObject({ offer: 'monthly', method: 'card', amountCents: 690 })
  })
})

describe('reconciliação', () => {
  test('acha cobrança e pagamento que nunca tiveram webhook', async () => {
    // Mensal autorizado e cobrado sem nenhum aviso
    const res = await request(app).post('/plan/checkout').set(auth('eva')).send({ offer: 'monthly' })
    const preapprovalId = new URL(res.body.url).searchParams.get('preapproval_id')
    mp.preapprovals.get(preapprovalId).status = 'authorized'
    charge(preapprovalId)

    // Anual pago por Pix sem aviso
    const annual = await request(app).post('/plan/checkout').set(auth('fred')).send({ offer: 'annual' })
    const paymentId = next()
    mp.payments.set(paymentId, {
      id: Number(paymentId), status: 'approved', external_reference: annual.body.reference, transaction_amount: 49.9,
      currency_id: 'BRL', payment_method_id: 'pix', payment_type_id: 'bank_transfer', date_approved: new Date().toISOString()
    })

    await queue.enqueue('mercadopago.reconcile')
    await runJobs()

    expect((await me('eva')).plan.current).toMatchObject({ kind: 'monthly' })
    expect((await me('fred')).plan.current).toMatchObject({ kind: 'annual' })
  })

  test('webhook parado há mais de 10 minutos volta para a fila', async () => {
    const { rows: [event] } = await db.query(
      `INSERT INTO librishelf.webhook_events (provider, event_id, topic, resource_id, payload, received_at)
       VALUES ('mercadopago', 'evt-perdido', 'merchant_order', '1', '{}', now() - interval '1 hour') RETURNING id`
    )
    await queue.enqueue('mercadopago.reconcile', {}, { dedupeKey: 'reconcile-teste-2' })
    await runJobs()
    const { rows } = await db.query('SELECT processed_at, error FROM librishelf.webhook_events WHERE id = $1', [event.id])
    expect(rows[0].processed_at).not.toBeNull()
    expect(rows[0].error).toMatch(/ignorado/)
  })
})

describe('excluir a conta', () => {
  const deleteAccount = name => request(app).delete('/auth/me').set(auth(name)).send({ password: PASSWORD })
  const exists = async name => (await db.query('SELECT 1 FROM librishelf.users WHERE id = $1', [ids[name]])).rowCount === 1

  test('com o mensal ativo: cancela no Mercado Pago antes de excluir', async () => {
    await signUp('gabi')
    const { preapprovalId } = await subscribe('gabi')
    const { invoiceId } = charge(preapprovalId)
    await webhook('subscription_authorized_payment', invoiceId)
    await runJobs()

    const res = await deleteAccount('gabi')
    expect(res.status).toBe(204)
    expect(mp.canceled).toContain(preapprovalId)
    expect(mp.preapprovals.get(preapprovalId).status).toBe('cancelled')
    expect(await exists('gabi')).toBe(false)
  })

  test('Mercado Pago fora do ar: a conta não é excluída', async () => {
    await signUp('hugo')
    const { preapprovalId } = await subscribe('hugo')
    const { invoiceId } = charge(preapprovalId)
    await webhook('subscription_authorized_payment', invoiceId)
    await runJobs()

    mp.failCancel = true
    try {
      const res = await deleteAccount('hugo')
      expect(res.status).toBe(502)
      expect(res.body.code).toBe('SUBSCRIPTION_CANCEL_FAILED')
      expect(await exists('hugo')).toBe(true)
    } finally {
      mp.failCancel = false
    }

    expect((await deleteAccount('hugo')).status).toBe(204)
    expect(mp.canceled).toContain(preapprovalId)
  })

  test('checkout do mensal aberto e não pago também é cancelado', async () => {
    await signUp('ivo')
    const res = await request(app).post('/plan/checkout').set(auth('ivo')).send({ offer: 'monthly' })
    const preapprovalId = new URL(res.body.url).searchParams.get('preapproval_id')

    expect((await deleteAccount('ivo')).status).toBe(204)
    expect(mp.canceled).toContain(preapprovalId)
  })
})
