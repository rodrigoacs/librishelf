import { CHECKOUT_QUERIES as q } from '../database/queries.js'
import { transaction } from '../repositories/proGrantRepository.js'
import * as mercadoPago from './mercadoPago.js'
import { PermanentJobError } from '../jobs/errors.js'
import { SUBSCRIPTION_QUERIES as s } from '../database/queries.js'
import * as subscriptionService from './subscriptionService.js'
import logger from '../utils/logger.js'

/**
 * Processa um pagamento do Mercado Pago a partir da API (GET /v1/payments/{id}),
 * nunca do corpo do webhook nem da URL de volta. Idempotente: o mesmo
 * pagamento processado duas, dez vezes dá no mesmo pagamento e no mesmo
 * entitlement (únicos por provider + external_id).
 *
 * → { result: 'granted' | 'updated' | 'refunded' | 'ignored' | 'problem', … }
 */
const STATUSES = new Set(['pending', 'approved', 'authorized', 'in_process', 'in_mediation', 'rejected', 'cancelled', 'refunded', 'charged_back'])
const CARD_TYPES = new Set(['credit_card', 'debit_card', 'prepaid_card'])
const YEAR_MS = 365 * 24 * 60 * 60 * 1000

export function methodOf(payment) {
  if (payment.payment_method_id === 'pix') return 'pix'
  if (CARD_TYPES.has(payment.payment_type_id)) return 'card'
  return null
}

const cents = amount => Math.round(Number(amount) * 100)

/** Só o necessário: nada de cartão, documento, nome ou endereço de quem pagou */
export function sanitize(payment) {
  const keep = ['id', 'status', 'status_detail', 'external_reference', 'transaction_amount', 'transaction_amount_refunded',
    'currency_id', 'payment_method_id', 'payment_type_id', 'installments', 'date_created', 'date_approved',
    'date_last_updated', 'money_release_date', 'live_mode']
  return Object.fromEntries(keep.filter(key => payment[key] !== undefined).map(key => [key, payment[key]]))
}

export async function processPayment(paymentId, { expectedReference = null, preapprovalId = null } = {}) {
  let payment
  try {
    payment = await mercadoPago.getPayment(paymentId)
  } catch (err) {
    if (err.status === 404) throw new PermanentJobError(`Pagamento ${paymentId} não existe no Mercado Pago`)
    throw err
  }

  const reference = payment.external_reference || null
  if (!reference && !preapprovalId) return { result: 'ignored', reason: 'sem external_reference' }
  // Volta do navegador: o pagamento informado precisa ser desta compra
  if (expectedReference && reference !== expectedReference) return { result: 'ignored', reason: 'outra compra' }
  if (!STATUSES.has(payment.status)) throw new PermanentJobError(`Status desconhecido: ${payment.status}`)

  return transaction(async (client) => {
    let reservation = reference ? (await client.query(q.RESERVATION_LOCK, [reference])).rows[0] : null
    // Cobrança do mensal sem external_reference: acha pela assinatura
    if (!reservation && preapprovalId) reservation = (await client.query(s.RESERVATION_BY_PREAPPROVAL, [preapprovalId])).rows[0]
    // Não é de uma compra do Librishelf (ou a conta foi excluída)
    if (!reservation) return { result: 'ignored', reason: 'reserva não encontrada' }

    const externalId = String(payment.id)
    const values = {
      method: methodOf(payment),
      amount: cents(payment.transaction_amount),
      paidAt: payment.status === 'approved' ? (payment.date_approved || new Date().toISOString()) : null,
      raw: JSON.stringify(sanitize(payment))
    }

    const existing = (await client.query(q.PAYMENT_LOCK, [externalId])).rows[0]
    const row = existing
      ? (await client.query(q.UPDATE_PAYMENT, [existing.id, payment.status, values.method, values.amount, values.paidAt, values.raw])).rows[0]
      : (await client.query(q.INSERT_PAYMENT, [reservation.user_id, reservation.offer_code, externalId, values.method, values.amount,
          payment.currency_id || 'BRL', payment.status, reservation.id, values.paidAt, values.raw])).rows[0]

    // Estornado ou contestado: o Pro desta compra sai
    if (['refunded', 'charged_back'].includes(payment.status)) {
      if (row.entitlement_id) await client.query(q.REFUND_ENTITLEMENT, [row.entitlement_id])
      logger.info('Pagamento estornado', { paymentId: externalId, status: payment.status, entitlementId: row.entitlement_id })
      return { result: 'refunded', paymentId: row.id }
    }

    if (payment.status !== 'approved') return { result: 'updated', status: payment.status, paymentId: row.id }
    if (row.entitlement_id) return { result: 'updated', status: payment.status, paymentId: row.id }

    const expected = reservation.amount_cents
    const wrongAmount = (payment.currency_id && payment.currency_id !== 'BRL') || (expected !== null && values.amount !== expected)

    // Mensal: cada cobrança aprovada é mais um mês da mesma assinatura
    if (reservation.offer_code === 'monthly') {
      if (wrongAmount) return problem(client, row.id, `Valor ${values.amount} ${payment.currency_id} diferente do esperado (${expected} BRL)`)
      return subscriptionService.applyPayment(client, reservation, row)
    }

    // Conferências antes de liberar o Pro
    if (reservation.status === 'confirmed') {
      return problem(client, row.id, 'Segundo pagamento aprovado para a mesma compra; reembolsar')
    }
    if (wrongAmount) {
      return problem(client, row.id, `Valor ${values.amount} ${payment.currency_id} diferente do esperado (${expected} BRL)`)
    }

    // Pagou depois de o checkout vencer: a vaga pode ter ido para outra pessoa
    if (reservation.status === 'released' && reservation.slots_total !== null) {
      const offer = (await client.query(q.OFFER_SLOT_LOCK, [reservation.offer_code])).rows[0]
      if (offer.slots_used >= offer.slots_total) {
        return problem(client, row.id, 'Pagou depois de o checkout vencer e as vagas já tinham acabado; reembolsar')
      }
      await client.query(q.SLOT_TAKE, [reservation.offer_code])
    }

    const paid = (await client.query(q.ACTIVE_PAID, [reservation.user_id])).rows[0]
    const lifetime = reservation.duration === 'lifetime'
    const startsAt = lifetime || !paid.paid_until || new Date(paid.paid_until) < new Date()
      ? new Date()
      : new Date(paid.paid_until)
    const endsAt = lifetime ? null : new Date(startsAt.getTime() + YEAR_MS)

    const entitlement = (await client.query(q.INSERT_ENTITLEMENT, [reservation.user_id, reservation.offer_code, startsAt, endsAt, externalId])).rows[0]
    if (!entitlement) return { result: 'updated', status: payment.status, paymentId: row.id }

    await client.query(q.SET_PAYMENT_ENTITLEMENT, [row.id, entitlement.id])
    await client.query(q.CONFIRM_RESERVATION, [reservation.id])
    logger.info('Pro liberado por pagamento', { userId: reservation.user_id, offer: reservation.offer_code, paymentId: externalId, method: values.method })
    return { result: 'granted', paymentId: row.id, entitlementId: entitlement.id }
  })
}

async function problem(client, paymentId, reason) {
  await client.query(q.SET_PAYMENT_PROBLEM, [paymentId, reason.slice(0, 300)])
  logger.error('Pagamento aprovado sem liberar o Pro', { paymentId, reason })
  return { result: 'problem', paymentId, reason }
}
