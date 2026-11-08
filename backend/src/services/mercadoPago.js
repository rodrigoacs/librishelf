import { httpError } from '../utils/httpError.js'
import logger from '../utils/logger.js'

/**
 * Cliente da API REST do Mercado Pago com fetch (sem SDK).
 *
 * Endpoints usados (documentação oficial):
 *   POST /checkout/preferences   Checkout Pro — preferência com cartão e Pix
 *     https://www.mercadopago.com.br/developers/pt/docs/checkout-pro/checkout-customization/preferences
 *     https://www.mercadopago.com.br/developers/pt/docs/checkout-pro/configure-back-urls
 *   GET  /v1/payments/{id}       estado real do pagamento (o webhook só avisa)
 *     https://www.mercadopago.com/developers/en/reference/payments/_payments_id/get
 *     status: https://www.mercadopago.com.br/developers/en/docs/checkout-api-payments/response-handling/query-results
 *   GET  /v1/payments/search?external_reference=…   reconciliação
 *   POST /preapproval            assinatura mensal sem plano, status pending → init_point
 *     https://www.mercadopago.com.br/developers/en/docs/subscriptions/integration-configuration/subscription-no-associated-plan/pending-payments
 *   GET/PUT /preapproval/{id}    estado e cancelamento (status: cancelled)
 *   GET  /authorized_payments/{id}   cobrança mensal (preapproval_id + payment)
 *     https://www.mercadopago.com/developers/en/reference/subscriptions/_authorized_payments_id/get
 *     https://www.mercadopago.com.br/developers/en/docs/subscriptions/integration-configuration/subscription-no-associated-plan/authorized-payments
 *   GET  /authorized_payments/search?preapproval_id=…   reconciliação
 */
export const API_URL = 'https://api.mercadopago.com'
const TIMEOUT_MS = 10_000

// Testes trocam o fetch por um Mercado Pago falso
let fetchImpl = (...args) => fetch(...args)
export function setFetch(fn) { fetchImpl = fn || ((...args) => fetch(...args)) }

export class MercadoPagoError extends Error {
  constructor(message, status, body) {
    super(message)
    this.name = 'MercadoPagoError'
    this.status = status
    this.body = body
  }
}

export function isConfigured() {
  return Boolean(process.env.MP_ACCESS_TOKEN?.trim())
}

async function request(path, { method = 'GET', body, idempotencyKey } = {}) {
  if (!isConfigured()) {
    throw httpError('Pagamentos indisponíveis no momento.', 503, 'PAYMENTS_UNAVAILABLE')
  }

  const headers = {
    Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN.trim()}`,
    Accept: 'application/json'
  }
  if (body) headers['Content-Type'] = 'application/json'
  if (idempotencyKey) headers['X-Idempotency-Key'] = idempotencyKey

  let res
  try {
    res = await fetchImpl(`${API_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS)
    })
  } catch (err) {
    throw new MercadoPagoError(`Mercado Pago fora do alcance: ${err.message}`, 0)
  }

  const text = await res.text()
  let data = null
  try { data = text ? JSON.parse(text) : null } catch { data = { raw: text.slice(0, 500) } }

  if (!res.ok) {
    // Nunca loga o token; a mensagem do Mercado Pago ajuda a depurar
    logger.warn('Mercado Pago respondeu com erro', { method, path: path.split('?')[0], status: res.status, message: data?.message })
    throw new MercadoPagoError(data?.message || `HTTP ${res.status}`, res.status, data)
  }
  return data
}

export function createPreference(body, idempotencyKey) {
  return request('/checkout/preferences', { method: 'POST', body, idempotencyKey })
}

export function getPayment(id) {
  return request(`/v1/payments/${encodeURIComponent(id)}`)
}

/**
 * Estorno do valor inteiro (sem amount). A chave de idempotência evita dois
 * estornos se o pedido for repetido. O pagamento passa a refunded e o
 * webhook avisa.
 */
export function refundPayment(id, idempotencyKey) {
  return request(`/v1/payments/${encodeURIComponent(id)}/refunds`, { method: 'POST', body: {}, idempotencyKey })
}

export function searchPayments(externalReference) {
  const query = new URLSearchParams({ external_reference: externalReference, sort: 'date_created', criteria: 'desc' })
  return request(`/v1/payments/search?${query}`)
}

export function createPreapproval(body, idempotencyKey) {
  return request('/preapproval', { method: 'POST', body, idempotencyKey })
}

export function getPreapproval(id) {
  return request(`/preapproval/${encodeURIComponent(id)}`)
}

export function cancelPreapproval(id) {
  return request(`/preapproval/${encodeURIComponent(id)}`, { method: 'PUT', body: { status: 'cancelled' } })
}

export function getAuthorizedPayment(id) {
  return request(`/authorized_payments/${encodeURIComponent(id)}`)
}

export function searchAuthorizedPayments(preapprovalId) {
  return request(`/authorized_payments/search?${new URLSearchParams({ preapproval_id: preapprovalId })}`)
}

/** Link do checkout: init_point, ou sandbox_init_point com MP_SANDBOX=true */
export function checkoutUrlOf(preference) {
  return process.env.MP_SANDBOX === 'true'
    ? preference.sandbox_init_point || preference.init_point
    : preference.init_point
}
