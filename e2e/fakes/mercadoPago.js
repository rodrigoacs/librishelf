import crypto from 'node:crypto'

/**
 * Mercado Pago falso: só as rotas que o backend usa (services/mercadoPago.js)
 * e uma página de checkout no lugar do Checkout Pro. O backend só fala com
 * ele com NODE_ENV=e2e e MP_API_URL apontando para cá.
 *
 * Fluxo do Checkout Pro simulado:
 *   POST /checkout/preferences    → init_point = {PUBLIC_URL}/checkout/{id}
 *   GET  /checkout/{id}           página com "Pagar com cartão", "Pagar com Pix" e "Recusar"
 *   POST /checkout/{id}/pay       cria o pagamento, manda o webhook assinado
 *                                 e volta para a back_url, como o Mercado Pago faz
 *   GET  /v1/payments/{id}, /v1/payments/search, POST /v1/payments/{id}/refunds
 *
 * Assinatura (mensal): criar, consultar e cancelar o preapproval. A página
 * de assinatura não é simulada.
 */
const preferences = new Map()
const payments = new Map()
const refunds = new Map() // chave de idempotência → estorno
const preapprovals = new Map()
// Ids únicos entre execuções, como os do Mercado Pago: o banco do e2e guarda
// os pagamentos de rodadas anteriores, e um id repetido seria outra compra
let sequence = Date.now() * 1000

const config = {
  publicUrl: 'http://localhost:4010',
  webhookSecret: '',
  webhookUrl: '' // sobrepõe a notification_url (no compose, o backend tem outro nome)
}

export function configure(options) {
  Object.assign(config, options)
}

export function reset() {
  preferences.clear()
  payments.clear()
  refunds.clear()
  preapprovals.clear()
}

export function allPayments() {
  return [...payments.values()]
}

const nextId = () => ++sequence
const now = () => new Date().toISOString()

/** → true se a rota era do Mercado Pago (respondida aqui) */
export async function handle(req, res, url, readBody) {
  const path = url.pathname

  // Páginas do navegador (sem token)
  let match = path.match(/^\/checkout\/(pref-\d+)$/)
  if (match && req.method === 'GET') return checkoutPage(res, match[1])
  match = path.match(/^\/checkout\/(pref-\d+)\/pay$/)
  if (match && req.method === 'POST') return pay(res, match[1], new URLSearchParams(await readBody()))
  match = path.match(/^\/subscription\/(pre-\d+)$/)
  if (match) return send(res, 501, 'text/plain; charset=utf-8', 'Assinatura não simulada nos testes de ponta a ponta.')

  // API (com token)
  const api = path === '/checkout/preferences' || /^\/(v1\/payments|preapproval|authorized_payments)(\/|$)/.test(path)
  if (!api) return false
  if (!/^Bearer \S+/.test(req.headers.authorization || '')) return json(res, 401, { message: 'unauthorized', status: 401 })

  if (path === '/checkout/preferences' && req.method === 'POST') {
    const body = JSON.parse(await readBody() || '{}')
    const id = `pref-${nextId()}`
    const preference = { ...body, id, date_created: now() }
    preference.init_point = `${config.publicUrl}/checkout/${id}`
    preference.sandbox_init_point = preference.init_point
    preferences.set(id, preference)
    return json(res, 201, preference)
  }

  if (path === '/v1/payments/search' && req.method === 'GET') {
    const reference = url.searchParams.get('external_reference')
    const results = allPayments().filter(payment => payment.external_reference === reference).reverse()
    return json(res, 200, { results, paging: { total: results.length, limit: 30, offset: 0 } })
  }

  match = path.match(/^\/v1\/payments\/(\d+)$/)
  if (match && req.method === 'GET') {
    const payment = payments.get(match[1])
    return payment ? json(res, 200, payment) : json(res, 404, { message: 'Payment not found', status: 404 })
  }

  match = path.match(/^\/v1\/payments\/(\d+)\/refunds$/)
  if (match && req.method === 'POST') return refund(res, match[1], req.headers['x-idempotency-key'], await readBody())

  if (path === '/preapproval' && req.method === 'POST') {
    const body = JSON.parse(await readBody() || '{}')
    const id = `pre-${nextId()}`
    const preapproval = { ...body, id, status: 'pending', date_created: now(), init_point: `${config.publicUrl}/subscription/${id}` }
    preapprovals.set(id, preapproval)
    return json(res, 201, preapproval)
  }

  match = path.match(/^\/preapproval\/(pre-\d+)$/)
  if (match) {
    const preapproval = preapprovals.get(match[1])
    if (!preapproval) return json(res, 404, { message: 'Preapproval not found', status: 404 })
    if (req.method === 'PUT') Object.assign(preapproval, JSON.parse(await readBody() || '{}'), { last_modified: now() })
    return json(res, 200, preapproval)
  }

  if (path === '/authorized_payments/search') return json(res, 200, { results: [], paging: { total: 0 } })
  return json(res, 404, { message: 'not_found', status: 404 })
}

function checkoutPage(res, preferenceId) {
  const preference = preferences.get(preferenceId)
  if (!preference) return send(res, 404, 'text/plain; charset=utf-8', 'Preferência não encontrada.')
  const item = preference.items?.[0] ?? {}
  const amount = Number(item.unit_price ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  const option = (method, label) => `<form method="post" action="/checkout/${preferenceId}/pay"><input type="hidden" name="method" value="${method}"><button type="submit">${label}</button></form>`

  return send(res, 200, 'text/html; charset=utf-8', `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Mercado Pago (simulado)</title>
<style>
  body { font: 16px system-ui, sans-serif; margin: 0; padding: 24px 16px; background: #f5f5f5; color: #222 }
  main { max-width: 420px; margin: 0 auto; background: #fff; border-radius: 8px; padding: 24px }
  h1 { font-size: 1.2rem; margin: 0 0 4px } p { margin: 0 0 20px; color: #555 }
  button { width: 100%; padding: 14px; margin-bottom: 12px; font-size: 1rem; border: 0; border-radius: 6px; background: #009ee3; color: #fff }
  form:last-child button { background: #ccc; color: #222 }
</style></head>
<body><main>
  <h1>${escapeHtml(item.title ?? 'Compra')}</h1>
  <p>${escapeHtml(amount)} · ambiente simulado dos testes</p>
  ${option('card', 'Pagar com cartão')}
  ${option('pix', 'Pagar com Pix')}
  ${option('reject', 'Recusar pagamento')}
</main></body></html>`)
}

async function pay(res, preferenceId, form) {
  const preference = preferences.get(preferenceId)
  if (!preference) return send(res, 404, 'text/plain; charset=utf-8', 'Preferência não encontrada.')

  const method = form.get('method')
  const approved = method === 'card' || method === 'pix'
  const id = String(nextId())
  const payment = {
    id: Number(id),
    status: approved ? 'approved' : 'rejected',
    status_detail: approved ? 'accredited' : 'cc_rejected_other_reason',
    external_reference: preference.external_reference,
    transaction_amount: Number(preference.items?.[0]?.unit_price ?? 0),
    transaction_amount_refunded: 0,
    currency_id: preference.items?.[0]?.currency_id ?? 'BRL',
    payment_method_id: method === 'pix' ? 'pix' : 'visa',
    payment_type_id: method === 'pix' ? 'bank_transfer' : 'credit_card',
    installments: 1,
    date_created: now(),
    date_approved: approved ? now() : null,
    date_last_updated: now(),
    live_mode: false,
    notification_url: preference.notification_url
  }
  payments.set(id, payment)
  await notify(payment, 'payment.created')

  // Volta como o Checkout Pro: back_url + dados do pagamento na query
  const back = new URL(preference.back_urls?.[approved ? 'success' : 'failure'] ?? config.publicUrl)
  back.searchParams.set('payment_id', id)
  back.searchParams.set('collection_id', id)
  back.searchParams.set('status', payment.status)
  back.searchParams.set('collection_status', payment.status)
  back.searchParams.set('external_reference', payment.external_reference ?? '')
  back.searchParams.set('payment_type', payment.payment_type_id)
  back.searchParams.set('preference_id', preferenceId)
  res.writeHead(303, { Location: back.toString() })
  res.end()
  return true
}

async function refund(res, paymentId, idempotencyKey, rawBody) {
  const payment = payments.get(paymentId)
  if (!payment) return json(res, 404, { message: 'Payment not found', status: 404 })
  if (idempotencyKey && refunds.has(idempotencyKey)) return json(res, 201, refunds.get(idempotencyKey))
  if (payment.status !== 'approved') return json(res, 400, { message: 'Payment not refundable', status: 400 })

  // Corpo {} (sem amount) = estorno do valor inteiro
  const body = JSON.parse(rawBody || '{}')
  const amount = body.amount ?? payment.transaction_amount
  const result = { id: nextId(), payment_id: payment.id, amount, status: 'approved', date_created: now() }
  if (idempotencyKey) refunds.set(idempotencyKey, result)

  payment.transaction_amount_refunded = amount
  if (amount >= payment.transaction_amount) {
    payment.status = 'refunded'
    payment.status_detail = 'refunded'
  }
  payment.date_last_updated = now()
  await notify(payment, 'payment.updated')
  return json(res, 201, result)
}

/**
 * Webhook com x-signature como o do Mercado Pago:
 *   manifest id:{data.id};request-id:{x-request-id};ts:{ts}; → HMAC-SHA256
 */
async function notify(payment, action) {
  const target = config.webhookUrl || payment.notification_url
  if (!target || !config.webhookSecret) return

  const dataId = String(payment.id)
  const requestId = crypto.randomUUID()
  const ts = String(Date.now())
  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`
  const v1 = crypto.createHmac('sha256', config.webhookSecret).update(manifest).digest('hex')

  const url = new URL(target)
  url.searchParams.set('data.id', dataId)
  url.searchParams.set('type', 'payment')
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-request-id': requestId, 'x-signature': `ts=${ts},v1=${v1}` },
      body: JSON.stringify({ id: nextId(), type: 'payment', action, api_version: 'v1', live_mode: false, date_created: now(), data: { id: dataId } }),
      signal: AbortSignal.timeout(5000)
    })
    console.log(`[fakes] webhook ${action} ${dataId} → ${res.status}`)
  } catch (err) {
    // Sem webhook, a volta do navegador (/plan/checkout/:ref/sync) ainda confere
    console.log(`[fakes] webhook ${action} ${dataId} falhou: ${err.message}`)
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])
}

export function json(res, status, body) {
  return send(res, status, 'application/json; charset=utf-8', JSON.stringify(body))
}

export function send(res, status, type, body) {
  res.writeHead(status, { 'Content-Type': type })
  res.end(body)
  return true
}
