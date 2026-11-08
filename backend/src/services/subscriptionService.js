import { db } from '../database/connection.js'
import { SUBSCRIPTION_QUERIES as s, CHECKOUT_QUERIES as q } from '../database/queries.js'
import { transaction } from '../repositories/proGrantRepository.js'
import * as mercadoPago from './mercadoPago.js'
import { PermanentJobError } from '../jobs/errors.js'
import { queuePaymentConfirmed } from './billingEmailService.js'
import { withdrawableUntil } from './withdrawalRules.js'
import { httpError } from '../utils/httpError.js'
import STATUS from '../utils/statusCodes.js'
import logger from '../utils/logger.js'

/**
 * Mensal: assinatura no cartão (preapproval sem plano, status pending →
 * init_point). O Pro sai a cada cobrança aprovada; cancelar não tira o Pro,
 * só a renovação.
 *
 * Folga: cada cobrança aprovada dá um mês + GRACE_DAYS, para a próxima
 * cobrança (que o Mercado Pago tenta de novo por até 10 dias) não derrubar o
 * Pro no meio do caminho. Ao cancelar, a folga sai e vale o mês pago.
 */
export const GRACE_DAYS = Number(process.env.SUBSCRIPTION_GRACE_DAYS ?? 3)
const DAY_MS = 24 * 60 * 60 * 1000

export function addMonth(date) {
  const next = new Date(date)
  const day = next.getUTCDate()
  next.setUTCMonth(next.getUTCMonth() + 1)
  // 31/jan + 1 mês = 28/fev, não 3/mar
  if (next.getUTCDate() < day) next.setUTCDate(0)
  return next
}

/** Corpo do POST /preapproval para o mensal */
export function preapprovalBody({ reference, email, priceCents, backUrl, startDate }) {
  return {
    reason: 'Librishelf Pro — mensal',
    external_reference: reference,
    payer_email: email,
    auto_recurring: {
      frequency: 1,
      frequency_type: 'months',
      transaction_amount: priceCents / 100,
      currency_id: 'BRL',
      ...(startDate ? { start_date: new Date(startDate).toISOString() } : {})
    },
    back_url: backUrl,
    status: 'pending'
  }
}

/**
 * Cobrança aprovada de uma assinatura, dentro da transação do pagamento.
 * O pagamento (row) já foi gravado; aqui o entitlement do preapproval nasce
 * ou ganha mais um mês. Só uma vez por pagamento (row.entitlement_id).
 */
export async function applyPayment(client, reservation, row) {
  if (row.entitlement_id) return { result: 'updated', paymentId: row.id }

  const preapprovalId = reservation.preference_id
  if (!preapprovalId) throw new Error(`Reserva ${reservation.id} do mensal sem preapproval`)

  const current = (await client.query(s.ENTITLEMENT_LOCK, [preapprovalId])).rows[0]
  const paid = (await client.query(q.ACTIVE_PAID, [reservation.user_id])).rows[0]
  const now = Date.now()

  // O mês novo começa no fim do mês pago atual (sem a folga), ou agora
  const currentPaidEnd = current?.ends_at && current.status === 'active'
    ? new Date(current.ends_at).getTime() - (current.auto_renew ? GRACE_DAYS * DAY_MS : 0)
    : 0
  const otherPaid = !current && paid.paid_until ? new Date(paid.paid_until).getTime() : 0
  const base = new Date(Math.max(now, currentPaidEnd, otherPaid))
  const endsAt = new Date(addMonth(base).getTime() + GRACE_DAYS * DAY_MS)

  let entitlementId
  if (current) {
    const updated = (await client.query(s.EXTEND_MONTHLY, [current.id, endsAt])).rows[0]
    if (!updated) {
      logger.error('Cobrança do mensal aprovada para assinatura revogada', { preapprovalId, paymentId: row.id, status: current.status })
      await client.query(q.SET_PAYMENT_PROBLEM, [row.id, `Cobrança aprovada com o Pro ${current.status}; conferir e reembolsar`])
      return { result: 'problem', paymentId: row.id }
    }
    entitlementId = current.id
  } else {
    entitlementId = (await client.query(s.INSERT_MONTHLY, [reservation.user_id, new Date(now), endsAt, preapprovalId])).rows[0].id
  }

  await client.query(q.SET_PAYMENT_ENTITLEMENT, [row.id, entitlementId])
  await client.query(q.CONFIRM_RESERVATION, [reservation.id])
  await queuePaymentConfirmed(row.id, client)
  logger.info('Mensal renovado', { userId: reservation.user_id, preapprovalId, endsAt })
  return { result: 'granted', paymentId: row.id, entitlementId }
}

/** Webhook subscription_preapproval: assinatura autorizada, pausada ou cancelada */
export async function processPreapproval(preapprovalId) {
  let preapproval
  try {
    preapproval = await mercadoPago.getPreapproval(preapprovalId)
  } catch (err) {
    if (err.status === 404) throw new PermanentJobError(`Preapproval ${preapprovalId} não existe no Mercado Pago`)
    throw err
  }

  const id = String(preapproval.id ?? preapprovalId)
  return transaction(async (client) => {
    let reservation = (await client.query(s.RESERVATION_BY_PREAPPROVAL, [id])).rows[0]
    if (!reservation && preapproval.external_reference) {
      reservation = (await client.query(q.RESERVATION_LOCK, [preapproval.external_reference])).rows[0]
      if (reservation?.offer_code !== 'monthly') reservation = null
      if (reservation) await client.query(s.SET_PREAPPROVAL, [reservation.id, id])
    }
    if (!reservation) return { result: 'ignored', reason: 'assinatura desconhecida' }

    if (['cancelled', 'paused'].includes(preapproval.status)) {
      const canceled = (await client.query(s.CANCEL_MONTHLY, [id, GRACE_DAYS])).rows[0]
      logger.info('Assinatura mensal encerrada no Mercado Pago', { preapprovalId: id, status: preapproval.status, userId: reservation.user_id })
      return { result: 'canceled', status: preapproval.status, entitlementId: canceled?.id ?? null }
    }
    return { result: 'updated', status: preapproval.status }
  })
}

/** Webhook subscription_authorized_payment: uma cobrança do mês */
export async function processAuthorizedPayment(authorizedPaymentId, { processPayment }) {
  let invoice
  try {
    invoice = await mercadoPago.getAuthorizedPayment(authorizedPaymentId)
  } catch (err) {
    if (err.status === 404) throw new PermanentJobError(`Cobrança ${authorizedPaymentId} não existe no Mercado Pago`)
    throw err
  }

  const paymentId = invoice.payment?.id
  // Agendada, ainda sem tentativa de pagamento: chega outro aviso depois
  if (!paymentId) return { result: 'ignored', reason: 'cobrança sem pagamento ainda', status: invoice.status }
  return processPayment(String(paymentId), { preapprovalId: invoice.preapproval_id ? String(invoice.preapproval_id) : null })
}

/** Botão "Cancelar assinatura" em Conta. → { endsAt } */
export async function cancel(userId) {
  const active = (await db.query(s.ACTIVE_MONTHLY, [userId])).rows[0]
  if (!active) throw httpError('Você não tem assinatura mensal ativa.', STATUS.NOT_FOUND, 'SUBSCRIPTION_NOT_FOUND')

  try {
    await mercadoPago.cancelPreapproval(active.external_id)
  } catch (err) {
    if (err.status === 503) throw err
    logger.error('Falha ao cancelar a assinatura no Mercado Pago', { userId, preapprovalId: active.external_id, message: err.message })
    throw httpError('Não foi possível cancelar agora. Tente de novo em instantes.', 502, 'PAYMENT_PROVIDER_ERROR')
  }

  const row = (await db.query(s.CANCEL_MONTHLY, [active.external_id, GRACE_DAYS])).rows[0]
  logger.info('Assinatura mensal cancelada pela pessoa', { userId, preapprovalId: active.external_id })
  return { endsAt: row?.ends_at ? new Date(row.ends_at).toISOString() : null }
}

/**
 * Exclusão da conta: a assinatura mensal para no Mercado Pago antes, senão as
 * cobranças seguiriam sem conta para receber o Pro. Um checkout do mensal
 * ainda aberto também é cancelado (esse, sem segurar a exclusão).
 * O Mercado Pago não respondeu para a assinatura ativa: a conta não é excluída.
 */
export async function stopForAccountDeletion(userId) {
  const active = (await db.query(s.ACTIVE_MONTHLY, [userId])).rows[0]
  const open = (await db.query(q.OPEN_RESERVATION, [userId, 'monthly'])).rows[0]
  const preapprovals = new Set([active?.external_id, open?.preference_id].filter(Boolean))
  if (!preapprovals.size) return
  if (!mercadoPago.isConfigured()) {
    logger.warn('Conta excluída sem cancelar o mensal no Mercado Pago: MP_ACCESS_TOKEN não definido', { userId })
    return
  }

  for (const preapprovalId of preapprovals) {
    try {
      await mercadoPago.cancelPreapproval(preapprovalId)
    } catch (err) {
      if (err.status === 404) continue
      if (preapprovalId !== active?.external_id) {
        logger.warn('Checkout aberto do mensal não cancelado na exclusão da conta', { userId, preapprovalId, message: err.message })
        continue
      }
      logger.error('Falha ao cancelar o mensal na exclusão da conta', { userId, preapprovalId, message: err.message })
      throw httpError('Não foi possível cancelar sua assinatura mensal agora, então a conta não foi excluída. Tente de novo em instantes.', 502, 'SUBSCRIPTION_CANCEL_FAILED')
    }
  }
  logger.info('Mensal cancelado no Mercado Pago antes da exclusão da conta', { userId, preapprovals: preapprovals.size })
}

/**
 * Assinatura mensal ativa no Mercado Pago: cancela lá antes de tirar o Pro
 * aqui, senão a cobrança do mês seguinte continuaria. Usado pelo Admin
 * (revogar, reembolsar) e pela desistência. → true se cancelou agora.
 */
export async function stopRenewal(entitlement) {
  if (entitlement.kind !== 'monthly' || entitlement.source !== 'mercadopago' || !entitlement.auto_renew || !entitlement.external_id) return false
  if (!mercadoPago.isConfigured()) {
    logger.warn('Mensal revogado sem cancelar no Mercado Pago: MP_ACCESS_TOKEN não definido', { entitlementId: entitlement.id })
    return false
  }
  try {
    await mercadoPago.cancelPreapproval(entitlement.external_id)
    return true
  } catch (err) {
    if (err.status === 404) return false
    logger.error('Falha ao cancelar a assinatura no Mercado Pago', { entitlementId: entitlement.id, message: err.message })
    throw httpError('O Mercado Pago não respondeu. Tente de novo em instantes.', 502, 'PAYMENT_PROVIDER_ERROR')
  }
}

export async function hasActive(userId, client = db) {
  return Boolean((await client.query(s.ACTIVE_MONTHLY, [userId])).rows[0])
}

/** Conta → histórico de cobranças */
export async function history(userId) {
  const { rows } = await db.query(s.HISTORY, [userId])
  const iso = date => (date ? new Date(date).toISOString() : null)
  return rows.map(row => ({
    id: Number(row.id),
    offer: row.offer_code,
    method: row.method,
    amountCents: row.amount_cents,
    currency: row.currency,
    status: row.status,
    paidAt: iso(row.paid_at),
    refundedAt: iso(row.refunded_at),
    createdAt: iso(row.created_at),
    // Até quando dá para desistir desta compra (pacote 36b), ou null
    withdrawableUntil: iso(withdrawableUntil(row))
  }))
}
