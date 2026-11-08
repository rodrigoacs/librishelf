import request from 'supertest'
import app from '../../app.js'
import { db } from '../../database/connection.js'
import { tokenFrom } from '../helpers/authToken.js'
import { confirmEmail } from '../helpers/confirmEmail.js'
import { clearDatabase, closeDatabase } from '../../utils/db.js'
import { setFetch, API_URL } from '../../services/mercadoPago.js'
import { sign, buildManifest } from '../../utils/mercadoPagoSignature.js'
import { drain } from '../../jobs/worker.js'

const PASSWORD = 'senha12345'
const SECRET = 'segredo-do-webhook-de-teste'
const tokens = {}
const ids = {}
const auth = name => ({ Authorization: `Bearer ${tokens[name]}` })
const YEAR_MS = 365 * 24 * 60 * 60 * 1000

// ---------------------------------------------------------- Mercado Pago falso
const mp = { preferences: [], payments: new Map(), refunds: [], failPreference: false, failRefund: false, seq: 1000 }

setFetch(async (url, options = {}) => {
  const path = url.replace(API_URL, '')
  const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
  expect(options.headers.Authorization).toBe('Bearer TEST-token')

  if (path === '/checkout/preferences' && options.method === 'POST') {
    if (mp.failPreference) return json(500, { message: 'internal_error' })
    const body = JSON.parse(options.body)
    const id = `pref-${mp.preferences.length + 1}`
    mp.preferences.push(body)
    return json(201, { id, init_point: `https://mp.test/checkout?pref=${id}`, sandbox_init_point: `https://sandbox.mp.test/checkout?pref=${id}` })
  }
  const refund = path.match(/^\/v1\/payments\/(\d+)\/refunds$/)
  if (refund && options.method === 'POST') {
    const payment = mp.payments.get(refund[1])
    if (!payment) return json(404, { message: 'Payment not found' })
    if (mp.failRefund) return json(500, { message: 'internal_error' })
    mp.refunds.push({ id: refund[1], key: options.headers['X-Idempotency-Key'], body: JSON.parse(options.body) })
    payment.status = 'refunded'
    return json(201, { id: 9000 + mp.refunds.length, payment_id: Number(refund[1]), status: 'approved' })
  }
  const match = path.match(/^\/v1\/payments\/(\d+)$/)
  if (match) {
    const payment = mp.payments.get(match[1])
    return payment ? json(200, payment) : json(404, { message: 'Payment not found' })
  }
  return json(404, { message: 'rota desconhecida no mock' })
})

/** Pagamento como a API devolve, com dados de cartão que não podem ir ao banco */
function mpPayment(reference, { status = 'approved', amount = 49.9, method = 'pix', currency = 'BRL' } = {}) {
  const id = String(++mp.seq)
  mp.payments.set(id, {
    id: Number(id),
    status,
    status_detail: status === 'approved' ? 'accredited' : 'pending_waiting_transfer',
    external_reference: reference,
    transaction_amount: amount,
    currency_id: currency,
    payment_method_id: method === 'pix' ? 'pix' : 'visa',
    payment_type_id: method === 'pix' ? 'bank_transfer' : 'credit_card',
    date_created: new Date().toISOString(),
    date_approved: status === 'approved' ? new Date().toISOString() : null,
    card: { first_six_digits: '450995', last_four_digits: '3704', cardholder: { name: 'APRO' } },
    payer: { email: 'comprador@example.com', identification: { type: 'CPF', number: '19119119100' } }
  })
  return id
}

function webhook(paymentId, { eventId = `evt-${paymentId}-${Math.random()}`, topic = 'payment', secret = SECRET, requestId = 'req-1' } = {}) {
  const ts = String(Date.now())
  const signature = sign(buildManifest({ dataId: paymentId, requestId, ts }), secret)
  return request(app)
    .post(`/webhooks/mercadopago?data.id=${paymentId}&type=${topic}`)
    .set('x-signature', `ts=${ts},v1=${signature}`)
    .set('x-request-id', requestId)
    .send({ id: eventId, type: topic, action: `${topic}.updated`, data: { id: paymentId }, live_mode: false })
}

const runJobs = () => drain('teste', { types: ['webhook.process'] })

async function signUp(name, { verified = true } = {}) {
  await request(app).post('/auth/register').send({ acceptTerms: true, username: name, password: PASSWORD, email: `${name}@example.com` })
  if (verified) await confirmEmail(name)
  tokens[name] = tokenFrom(await request(app).post('/auth/login').send({ username: name, password: PASSWORD }))
  ids[name] = (await db.query('SELECT id FROM librishelf.users WHERE name = $1', [name])).rows[0].id
}

const checkout = (name, offer) => request(app).post('/plan/checkout').set(auth(name)).send({ offer })
const me = async name => (await request(app).get('/auth/me').set(auth(name))).body.user
const entitlementsOf = async name => (await db.query('SELECT * FROM librishelf.entitlements WHERE user_id = $1 ORDER BY id', [ids[name]])).rows
const count = async (table, where = 'true', params = []) => (await db.query(`SELECT count(*)::int AS n FROM librishelf.${table} WHERE ${where}`, params)).rows[0].n
const openFounders = () => db.query("UPDATE librishelf.offers SET active = true, starts_at = now() - interval '1 day', ends_at = now() + interval '90 days' WHERE code IN ('founder_annual', 'founder_lifetime')")

beforeAll(async () => {
  process.env.MP_ACCESS_TOKEN = 'TEST-token'
  process.env.MP_WEBHOOK_SECRET = SECRET
  await clearDatabase()
  for (const name of ['ana', 'bia', 'caio', 'davi', 'eva', 'fred', 'gabi', 'hugo', 'joao', 'kati', 'leo', 'mia', 'nina', 'otto']) await signUp(name)
  await signUp('ivo', { verified: false })
})

afterAll(async () => {
  setFetch(null)
  delete process.env.MP_ACCESS_TOKEN
  delete process.env.MP_WEBHOOK_SECRET
  await closeDatabase()
})

describe('ofertas', () => {
  test('lista pública com preço e vagas', async () => {
    const res = await request(app).get('/plan/offers')
    expect(res.status).toBe(200)
    const byCode = Object.fromEntries(res.body.offers.map(o => [o.code, o]))
    expect(byCode.annual).toMatchObject({ priceCents: 4990, available: true, slotsLeft: null })
    expect(byCode.founder_lifetime).toMatchObject({ priceCents: 14990, slotsTotal: 100, slotsLeft: 100, available: false })
    expect(byCode.vanguarda).toBeUndefined()
  })
})

describe('checkout', () => {
  test('abre a preferência com cartão e Pix, à vista, e link de volta', async () => {
    const res = await checkout('ana', 'annual')
    expect(res.status).toBe(201)
    expect(res.body.url).toMatch(/^https:\/\/mp\.test\/checkout/)

    const body = mp.preferences.at(-1)
    expect(body.external_reference).toBe(res.body.reference)
    expect(body.items).toEqual([expect.objectContaining({ id: 'annual', quantity: 1, currency_id: 'BRL', unit_price: 49.9 })])
    expect(body.payment_methods.excluded_payment_types).toEqual([{ id: 'ticket' }, { id: 'atm' }])
    expect(body.notification_url).toMatch(/\/api\/webhooks\/mercadopago$/)
    expect(body.back_urls.success).toContain(`/plan/return?result=success&ref=${res.body.reference}`)
    expect(body.expires).toBe(true)
    expect(body.payer.email).toBe('ana@example.com')
  })

  test('oferta inválida, e-mail não confirmado e fundador fechado', async () => {
    expect((await checkout('ana', 'vanguarda')).body.code).toBe('OFFER_INVALID')
    expect((await checkout('ivo', 'annual')).body.code).toBe('EMAIL_NOT_VERIFIED_CHECKOUT')
    expect((await checkout('ana', 'founder_lifetime')).body.code).toBe('OFFER_UNAVAILABLE')
  })

  test('Mercado Pago fora do ar: 502 e a vaga volta', async () => {
    await openFounders()
    mp.failPreference = true
    const res = await checkout('bia', 'founder_lifetime')
    mp.failPreference = false
    expect(res.status).toBe(502)
    expect(res.body.code).toBe('PAYMENT_PROVIDER_ERROR')
    expect((await db.query("SELECT slots_used FROM librishelf.offers WHERE code = 'founder_lifetime'")).rows[0].slots_used).toBe(0)
  })

  test('clicar de novo troca a reserva sem gastar outra vaga', async () => {
    await checkout('bia', 'founder_lifetime')
    await checkout('bia', 'founder_lifetime')
    expect((await db.query("SELECT slots_used FROM librishelf.offers WHERE code = 'founder_lifetime'")).rows[0].slots_used).toBe(1)
    expect(await count('offer_reservations', "user_id = $1 AND status = 'pending'", [ids.bia])).toBe(1)
  })

  test('vaga 101 do fundador é recusada, mesmo com pedidos simultâneos', async () => {
    await db.query("UPDATE librishelf.offers SET slots_used = 99 WHERE code = 'founder_lifetime'")
    await db.query("UPDATE librishelf.offer_reservations SET status = 'released' WHERE offer_code = 'founder_lifetime'")
    const results = await Promise.all(['caio', 'davi', 'eva'].map(name => checkout(name, 'founder_lifetime')))
    expect(results.map(r => r.status).sort()).toEqual([201, 409, 409])
    expect(results.filter(r => r.status === 409).every(r => r.body.code === 'OFFER_SOLD_OUT')).toBe(true)
    expect((await db.query("SELECT slots_used FROM librishelf.offers WHERE code = 'founder_lifetime'")).rows[0].slots_used).toBe(100)
  })
})

describe('webhook', () => {
  test('sem assinatura ou com assinatura errada: 401 e nada gravado', async () => {
    const before = await count('webhook_events')
    const unsigned = await request(app).post('/webhooks/mercadopago?data.id=1&type=payment').send({ id: 'x', type: 'payment', data: { id: '1' } })
    expect(unsigned.status).toBe(401)
    expect(unsigned.body.code).toBe('INVALID_SIGNATURE')
    expect((await webhook('1', { secret: 'outra-chave' })).status).toBe(401)
    expect(await count('webhook_events')).toBe(before)
  })

  test('pagamento aprovado vira Pro anual; nada de cartão no banco', async () => {
    const { body } = await checkout('fred', 'annual')
    const paymentId = mpPayment(body.reference, { method: 'pix' })

    expect((await webhook(paymentId)).status).toBe(200)
    // Gravado, mas o Pro só sai quando o worker consulta a API
    expect((await me('fred')).plan.pro).toBe(false)
    await runJobs()

    const user = await me('fred')
    expect(user.plan).toMatchObject({ pro: true, current: { kind: 'annual', source: 'mercadopago', lifetime: false } })
    expect(Math.abs(new Date(user.plan.current.endsAt) - (Date.now() + YEAR_MS))).toBeLessThan(60_000)

    const { rows: [payment] } = await db.query('SELECT * FROM librishelf.payments WHERE external_id = $1', [paymentId])
    expect(payment).toMatchObject({ status: 'approved', method: 'pix', amount_cents: 4990, offer_code: 'annual', problem: null })
    expect(JSON.stringify(payment.raw)).not.toMatch(/450995|3704|19119119100|APRO|identification|card/)
    expect((await db.query('SELECT status FROM librishelf.offer_reservations WHERE reference = $1', [body.reference])).rows[0].status).toBe('confirmed')
  })

  test('o mesmo webhook duas vezes não duplica pagamento nem entitlement', async () => {
    const { body } = await checkout('gabi', 'annual')
    const paymentId = mpPayment(body.reference, { method: 'card' })

    expect((await webhook(paymentId, { eventId: 'evt-repetido' })).status).toBe(200)
    expect((await webhook(paymentId, { eventId: 'evt-repetido' })).status).toBe(200)
    // Outra notificação do mesmo pagamento (payment.updated) também não duplica
    expect((await webhook(paymentId, { eventId: 'evt-outro' })).status).toBe(200)
    await runJobs()

    expect(await count('webhook_events', "event_id IN ('evt-repetido', 'evt-outro')")).toBe(2)
    expect(await count('payments', 'external_id = $1', [paymentId])).toBe(1)
    expect((await entitlementsOf('gabi')).length).toBe(1)
    expect((await entitlementsOf('gabi'))[0].kind).toBe('annual')
  })

  test('pendente e depois aprovado: um pagamento, atualizado', async () => {
    const { body } = await checkout('hugo', 'annual')
    const paymentId = mpPayment(body.reference, { status: 'pending' })
    await webhook(paymentId)
    await runJobs()
    expect((await request(app).get(`/plan/checkout/${body.reference}`).set(auth('hugo'))).body.state).toBe('pending')

    mp.payments.get(paymentId).status = 'approved'
    mp.payments.get(paymentId).date_approved = new Date().toISOString()
    await webhook(paymentId)
    await runJobs()
    expect((await request(app).get(`/plan/checkout/${body.reference}`).set(auth('hugo'))).body.state).toBe('active')
    expect(await count('payments', 'external_id = $1', [paymentId])).toBe(1)
  })

  test('renovar o anual antes de vencer soma o ano depois do atual', async () => {
    const before = (await entitlementsOf('fred'))[0]
    const { body } = await checkout('fred', 'annual')
    await webhook(mpPayment(body.reference))
    await runJobs()

    const [first, second] = await entitlementsOf('fred')
    expect(first.id).toBe(before.id)
    expect(new Date(second.starts_at).getTime()).toBe(new Date(first.ends_at).getTime())
    expect(new Date(second.ends_at) - new Date(second.starts_at)).toBe(YEAR_MS)
  })

  test('fundador vitalício: Pro sem fim; depois disso não compra mais nada', async () => {
    const { rows: [reservation] } = await db.query(
      "SELECT r.reference FROM librishelf.offer_reservations r JOIN librishelf.users u ON u.id = r.user_id WHERE r.offer_code = 'founder_lifetime' AND r.status = 'pending' LIMIT 1"
    )
    const owner = (await db.query('SELECT u.name FROM librishelf.offer_reservations r JOIN librishelf.users u ON u.id = r.user_id WHERE r.reference = $1', [reservation.reference])).rows[0].name
    await webhook(mpPayment(reservation.reference, { amount: 149.9, method: 'card' }))
    await runJobs()

    expect((await me(owner)).plan.current).toMatchObject({ kind: 'founder_lifetime', lifetime: true, endsAt: null })
    expect((await checkout(owner, 'annual')).body.code).toBe('ALREADY_LIFETIME')
  })

  test('valor diferente do esperado: pagamento guardado com problema, sem Pro', async () => {
    const { body } = await checkout('ana', 'annual')
    const paymentId = mpPayment(body.reference, { amount: 1 })
    await webhook(paymentId)
    await runJobs()
    expect((await me('ana')).plan.pro).toBe(false)
    const { rows } = await db.query('SELECT problem, entitlement_id FROM librishelf.payments WHERE external_id = $1', [paymentId])
    expect(rows[0].entitlement_id).toBeNull()
    expect(rows[0].problem).toMatch(/diferente do esperado/)
  })

  test('pagou depois do checkout vencer e as vagas acabaram: problema para reembolso', async () => {
    // Reserva vencida e devolvida pelo job; a vaga foi para outra pessoa
    const { rows: [late] } = await db.query(
      `INSERT INTO librishelf.offer_reservations (user_id, offer_code, status, reference, expires_at, holds_slot, amount_cents)
       VALUES ($1, 'founder_lifetime', 'released', gen_random_uuid()::text, now() - interval '1 hour', false, 14990) RETURNING reference`,
      [ids.ana]
    )
    const paymentId = mpPayment(late.reference, { amount: 149.9 })
    await webhook(paymentId)
    await runJobs()
    const { rows } = await db.query('SELECT problem FROM librishelf.payments WHERE external_id = $1', [paymentId])
    expect(rows[0].problem).toMatch(/vagas já tinham acabado/)
    expect((await me('ana')).plan.pro).toBe(false)
  })

  test('estorno no Mercado Pago tira o Pro daquela compra', async () => {
    const { body } = await checkout('joao', 'annual')
    const paymentId = mpPayment(body.reference)
    await webhook(paymentId)
    await runJobs()
    expect((await me('joao')).plan.pro).toBe(true)

    mp.payments.get(paymentId).status = 'refunded'
    await webhook(paymentId)
    await runJobs()
    expect((await me('joao')).plan.pro).toBe(false)
    const { rows } = await db.query('SELECT status, refunded_at FROM librishelf.payments WHERE external_id = $1', [paymentId])
    expect(rows[0].status).toBe('refunded')
    expect(rows[0].refunded_at).not.toBeNull()
  })

  test('tópico que o Librishelf não usa é marcado como ignorado', async () => {
    expect((await webhook('2001', { topic: 'merchant_order', eventId: 'evt-ignorado' })).status).toBe(200)
    await runJobs()
    const { rows } = await db.query("SELECT processed_at, error FROM librishelf.webhook_events WHERE event_id = 'evt-ignorado'")
    expect(rows[0].processed_at).not.toBeNull()
    expect(rows[0].error).toMatch(/ignorado/)
  })
})

describe('volta do Mercado Pago', () => {
  test('sync confere na API e libera sem esperar o webhook', async () => {
    const { body } = await checkout('kati', 'annual')
    const paymentId = mpPayment(body.reference)
    const res = await request(app).post(`/plan/checkout/${body.reference}/sync`).set(auth('kati')).send({ paymentId })
    expect(res.status).toBe(200)
    expect(res.body.state).toBe('active')
    expect(res.body.plan.pro).toBe(true)
  })

  test('pagamento de outra compra não serve; compra de outra pessoa é 404', async () => {
    const mine = await checkout('leo', 'annual')
    const other = await checkout('mia', 'annual')
    const paymentOfMia = mpPayment(other.body.reference)

    const res = await request(app).post(`/plan/checkout/${mine.body.reference}/sync`).set(auth('leo')).send({ paymentId: paymentOfMia })
    expect(res.body.state).toBe('waiting')
    expect((await me('leo')).plan.pro).toBe(false)

    expect((await request(app).get(`/plan/checkout/${other.body.reference}`).set(auth('leo'))).status).toBe(404)
  })
})

describe('fundador anual', () => {
  test('renovação depois da janela, sem gastar vaga', async () => {
    const { body } = await checkout('gabi', 'founder_annual')
    await webhook(mpPayment(body.reference, { amount: 39.9 }))
    await runJobs()
    expect((await me('gabi')).plan.pro).toBe(true)

    await db.query("UPDATE librishelf.offers SET ends_at = now() - interval '1 second', starts_at = now() - interval '91 days' WHERE code = 'founder_annual'")
    const used = (await db.query("SELECT slots_used FROM librishelf.offers WHERE code = 'founder_annual'")).rows[0].slots_used

    const renewal = await checkout('gabi', 'founder_annual')
    expect(renewal.status).toBe(201)
    expect((await checkout('hugo', 'founder_annual')).body.code).toBe('OFFER_UNAVAILABLE')
    expect((await db.query("SELECT slots_used FROM librishelf.offers WHERE code = 'founder_annual'")).rows[0].slots_used).toBe(used)
  })
})

describe('desistência da compra (7 dias)', () => {
  const payments = async name => (await request(app).get('/plan/payments').set(auth(name))).body.payments
  const withdraw = (name, id) => request(app).post(`/plan/payments/${id}/withdraw`).set(auth(name))

  async function buyAnnual(name) {
    const res = await checkout(name, 'annual')
    expect(res.status).toBe(201)
    const paymentId = mpPayment(res.body.reference, { amount: 49.9, method: 'pix' })
    await webhook(paymentId)
    await runJobs()
    const [payment] = await payments(name)
    return { mpId: paymentId, payment }
  }

  test('o histórico diz até quando dá para desistir', async () => {
    const { payment } = await buyAnnual('nina')
    const until = new Date(payment.withdrawableUntil).getTime()
    const expected = new Date(payment.paidAt).getTime() + 7 * 24 * 60 * 60 * 1000
    expect(until).toBe(expected)
    expect((await me('nina')).plan.pro).toBe(true)
  })

  test('desistir: estorno integral pedido, Pro encerrado, e-mail agendado', async () => {
    const [payment] = await payments('nina')
    const mpId = (await db.query('SELECT external_id FROM librishelf.payments WHERE id = $1', [payment.id])).rows[0].external_id
    const res = await withdraw('nina', payment.id)
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ entitlementRevoked: true, subscriptionCanceled: false })
    expect(res.body.plan.pro).toBe(false)

    expect(mp.refunds).toEqual([{ id: mpId, key: `withdrawal-${payment.id}`, body: {} }])
    const [after] = await payments('nina')
    expect(after.refundedAt).not.toBeNull()
    expect(after.withdrawableUntil).toBeNull()
    const { rows: [row] } = await db.query('SELECT refunded_by FROM librishelf.payments WHERE id = $1', [payment.id])
    expect(row.refunded_by).toBe(ids.nina)
    expect(await count('jobs', "type = 'email.send' AND payload->>'kind' = 'withdrawal_confirmed'")).toBe(1)

    // Uma vez só
    expect((await withdraw('nina', payment.id)).body.code).toBe('WITHDRAWAL_NOT_AVAILABLE')
    expect(mp.refunds).toHaveLength(1)
  })

  test('o webhook do estorno não devolve o Pro', async () => {
    const mpId = mp.refunds[0].id
    await webhook(mpId)
    await runJobs()
    expect((await me('nina')).plan.pro).toBe(false)
  })

  test('depois de 7 dias, de outra conta ou com o Mercado Pago fora: recusado sem mudar nada', async () => {
    const { payment } = await buyAnnual('otto')

    expect((await withdraw('nina', payment.id)).status).toBe(404)
    expect((await withdraw('otto', 'abc')).status).toBe(404)

    mp.failRefund = true
    try {
      const res = await withdraw('otto', payment.id)
      expect(res.status).toBe(502)
      expect(res.body.code).toBe('PAYMENT_PROVIDER_ERROR')
    } finally {
      mp.failRefund = false
    }
    expect((await me('otto')).plan.pro).toBe(true)
    expect((await payments('otto'))[0].refundedAt).toBeNull()

    await db.query("UPDATE librishelf.payments SET paid_at = now() - interval '7 days 1 minute' WHERE id = $1", [payment.id])
    expect((await payments('otto'))[0].withdrawableUntil).toBeNull()
    const res = await withdraw('otto', payment.id)
    expect(res.status).toBe(409)
    expect(res.body.code).toBe('WITHDRAWAL_NOT_AVAILABLE')
    expect((await me('otto')).plan.pro).toBe(true)
  })
})
