import { db } from '../database/connection.js'
import { ADMIN_BILLING_QUERIES as q, ADMIN_QUERIES as aq } from '../database/queries.js'
import { transaction } from '../repositories/proGrantRepository.js'
import * as mercadoPago from './mercadoPago.js'
import * as subscriptionService from './subscriptionService.js'
import * as queue from '../jobs/queue.js'
import * as quota from './emailQuota.js'
import * as webhookService from './webhookService.js'
import { resolvePagination } from '../utils/pagination.js'
import { httpError } from '../utils/httpError.js'
import STATUS from '../utils/statusCodes.js'
import logger from '../utils/logger.js'

/**
 * Monetização na área administrativa. Tudo o que muda alguma coisa fica em
 * admin_actions, na mesma transação da mudança.
 *
 * Reembolso: o dinheiro volta pelo painel do Mercado Pago; aqui só se marca
 * (refunded_at, refunded_by) e o Pro daquela compra é revogado. O pagamento
 * continua em payments. Quando o Mercado Pago avisar do estorno, o webhook
 * atualiza o status sem mexer no que foi marcado aqui.
 */
export const GRANT_KINDS = Object.freeze({
  monthly: { days: 30 },
  annual: { days: 365 },
  founder_annual: { days: 365 },
  founder_lifetime: { lifetime: true }
})
export const MAX_GRANT_DAYS = 3650
const MAX_NOTE = 500
const PAYMENT_FILTERS = ['all', 'problem', 'refunded']
const WEBHOOK_FILTERS = ['error', 'pending', 'all']
const OFFER_CODES = ['monthly', 'annual', 'founder_annual', 'founder_lifetime', 'vanguarda']

const iso = date => (date ? new Date(date).toISOString() : null)

async function log(client, adminId, action, userId, details) {
  await client.query(aq.LOG, [adminId, action, userId, null, details])
  logger.info('Ação administrativa', { adminId, action, userId })
}

function readNote(note) {
  if (note === undefined || note === null) return null
  if (typeof note !== 'string' || note.trim().length > MAX_NOTE) {
    throw httpError('Nota inválida (até 500 caracteres).', STATUS.BAD_REQUEST, 'FIELD_INVALID', { field: 'note', max: MAX_NOTE })
  }
  return note.trim() || null
}

// ------------------------------------------------------------------ conta

/** GET /admin/users/:id/billing */
export async function userBilling(userId) {
  const [{ rows: [trial] }, { rows: entitlements }, { rows: payments }] = await Promise.all([
    db.query(q.USER_TRIAL, [userId]), db.query(q.USER_ENTITLEMENTS, [userId]), db.query(q.USER_PAYMENTS, [userId])
  ])
  if (!trial) throw httpError('Conta não encontrada.', STATUS.NOT_FOUND, 'USER_NOT_FOUND')
  return {
    trialUsedAt: iso(trial.pro_trial_used_at),
    entitlements: entitlements.map(row => ({
      id: Number(row.id),
      kind: row.kind,
      source: row.source,
      status: row.status,
      current: row.current,
      startsAt: iso(row.starts_at),
      endsAt: iso(row.ends_at),
      autoRenew: row.auto_renew,
      canceledAt: iso(row.canceled_at),
      note: row.note,
      grantedBy: row.granted_by,
      createdAt: iso(row.created_at)
    })),
    payments: payments.map(row => ({
      id: Number(row.id),
      offer: row.offer_code,
      method: row.method,
      amountCents: row.amount_cents,
      currency: row.currency,
      status: row.status,
      paidAt: iso(row.paid_at),
      refundedAt: iso(row.refunded_at),
      problem: row.problem,
      createdAt: iso(row.created_at)
    }))
  }
}

/** POST /admin/users/:id/pro — { kind, days, note } (days ignorado no vitalício) */
export async function grant(adminId, userId, { kind, days, note } = {}) {
  const rule = GRANT_KINDS[kind]
  if (!rule) throw httpError('Tipo de Pro inválido.', STATUS.BAD_REQUEST, 'PRO_GRANT_KIND_INVALID')

  let period = null
  if (!rule.lifetime) {
    period = days === undefined || days === null || days === '' ? rule.days : Number(days)
    if (!Number.isInteger(period) || period < 1 || period > MAX_GRANT_DAYS) {
      throw httpError(`Prazo inválido: de 1 a ${MAX_GRANT_DAYS} dias.`, STATUS.BAD_REQUEST, 'PRO_GRANT_DAYS_INVALID', { min: 1, max: MAX_GRANT_DAYS })
    }
  }
  const text = readNote(note)

  const row = await transaction(async (client) => {
    if (!(await client.query(q.USER_LOCK, [userId])).rows[0]) {
      throw httpError('Conta não encontrada.', STATUS.NOT_FOUND, 'USER_NOT_FOUND')
    }
    const { rows: [created] } = await client.query(q.GRANT, [userId, kind, period, adminId, text])
    await log(client, adminId, 'pro.grant', userId, { entitlementId: Number(created.id), kind, days: period, note: text })
    return created
  })

  return { entitlement: { id: Number(row.id), kind: row.kind, startsAt: iso(row.starts_at), endsAt: iso(row.ends_at) } }
}

/** POST /admin/entitlements/:id/revoke — { note } */
export async function revoke(adminId, entitlementId, { note } = {}) {
  const text = readNote(note)
  return transaction(async (client) => {
    const entitlement = (await client.query(q.ENTITLEMENT_LOCK, [entitlementId])).rows[0]
    if (!entitlement) throw httpError('Pro não encontrado.', STATUS.NOT_FOUND, 'ENTITLEMENT_NOT_FOUND')
    if (entitlement.status !== 'active') throw httpError('Este Pro não está ativo.', STATUS.CONFLICT, 'ENTITLEMENT_NOT_ACTIVE')

    const subscriptionCanceled = await subscriptionService.stopRenewal(entitlement)
    await client.query(q.REVOKE, [entitlementId])
    await log(client, adminId, 'pro.revoke', entitlement.user_id, {
      entitlementId: Number(entitlementId), kind: entitlement.kind, source: entitlement.source, subscriptionCanceled, note: text
    })
    return { revoked: true, subscriptionCanceled }
  })
}

// -------------------------------------------------------------- pagamentos

/** GET /admin/payments?filter=all|problem|refunded */
export async function payments({ filter = 'all', page, limit } = {}) {
  if (!PAYMENT_FILTERS.includes(filter)) {
    throw httpError("Parâmetro 'filter' inválido.", STATUS.BAD_REQUEST, 'PARAM_INVALID', { param: 'filter' })
  }
  const pagination = resolvePagination(page, limit)
  const { rows } = await db.query(q.PAYMENTS, [filter, pagination.limit, pagination.offset])
  return {
    total: rows[0]?.total ?? 0,
    page: pagination.page,
    limit: pagination.limit,
    payments: rows.map(row => ({
      id: Number(row.id),
      userId: row.user_id,
      username: row.username,
      offer: row.offer_code,
      externalId: row.external_id,
      method: row.method,
      amountCents: row.amount_cents,
      currency: row.currency,
      status: row.status,
      problem: row.problem,
      paidAt: iso(row.paid_at),
      refundedAt: iso(row.refunded_at),
      refundedBy: row.refunded_by,
      entitlementId: row.entitlement_id ? Number(row.entitlement_id) : null,
      createdAt: iso(row.created_at)
    }))
  }
}

/**
 * POST /admin/payments/:id/refund — { note }. Marca o reembolso (feito no
 * painel do Mercado Pago) e revoga o Pro daquela compra. No mensal, o Pro é
 * a assinatura inteira: ela é cancelada no Mercado Pago e revogada aqui.
 */
export async function refund(adminId, paymentId, { note } = {}) {
  const text = readNote(note)
  return transaction(async (client) => {
    const payment = (await client.query(q.PAYMENT_LOCK, [paymentId])).rows[0]
    if (!payment) throw httpError('Pagamento não encontrado.', STATUS.NOT_FOUND, 'PAYMENT_NOT_FOUND')
    if (payment.refunded_at) throw httpError('Este pagamento já foi marcado como reembolsado.', STATUS.CONFLICT, 'PAYMENT_ALREADY_REFUNDED')
    if (!['approved', 'refunded', 'charged_back'].includes(payment.status)) {
      throw httpError('Este pagamento não foi aprovado: não há o que reembolsar.', STATUS.CONFLICT, 'PAYMENT_NOT_REFUNDABLE')
    }

    let entitlementRevoked = false
    let subscriptionCanceled = false
    if (payment.entitlement_id) {
      const entitlement = (await client.query(q.ENTITLEMENT_LOCK, [payment.entitlement_id])).rows[0]
      if (entitlement) {
        subscriptionCanceled = await subscriptionService.stopRenewal(entitlement)
        entitlementRevoked = Boolean((await client.query(q.REFUND_ENTITLEMENT, [entitlement.id])).rows[0])
      }
    }
    const { rows: [marked] } = await client.query(q.MARK_REFUNDED, [paymentId, adminId])
    await log(client, adminId, 'payment.refund', payment.user_id, {
      paymentId: Number(paymentId), externalId: payment.external_id, offer: payment.offer_code,
      amountCents: payment.amount_cents, entitlementId: payment.entitlement_id ? Number(payment.entitlement_id) : null,
      entitlementRevoked, subscriptionCanceled, note: text
    })
    return { refundedAt: iso(marked.refunded_at), entitlementRevoked, subscriptionCanceled }
  })
}

// ----------------------------------------------------------------- ofertas

function offerOut(row) {
  const now = Date.now()
  const inWindow = (!row.starts_at || new Date(row.starts_at).getTime() <= now) && (!row.ends_at || new Date(row.ends_at).getTime() > now)
  const slotsLeft = row.slots_total === null ? null : Math.max(row.slots_total - row.slots_used, 0)
  return {
    code: row.code,
    priceCents: row.price_cents,
    duration: row.duration,
    autoRenew: row.auto_renew,
    active: row.active,
    startsAt: iso(row.starts_at),
    endsAt: iso(row.ends_at),
    slotsTotal: row.slots_total,
    slotsUsed: row.slots_used,
    slotsLeft,
    // Vagas presas em checkouts ainda abertos (contam em slotsUsed)
    heldSlots: row.held_slots,
    open: row.active && inWindow && (slotsLeft === null || slotsLeft > 0),
    updatedAt: iso(row.updated_at)
  }
}

/** GET /admin/offers → { offers, activePro: { kind: n }, revenue30 } */
export async function offers() {
  const [{ rows }, { rows: active }, { rows: [revenue] }] = await Promise.all([
    db.query(q.OFFERS), db.query(q.ACTIVE_PRO), db.query(q.REVENUE_30)
  ])
  return {
    offers: rows.map(offerOut),
    activePro: Object.fromEntries(active.map(row => [row.kind, row.total])),
    revenue30: { receivedCents: revenue.received, refundedCents: revenue.refunded, payments: revenue.payments }
  }
}

function readDate(value, field) {
  if (value === null || value === '') return null
  const date = new Date(value)
  if (typeof value !== 'string' || Number.isNaN(date.getTime())) {
    throw httpError('Data inválida.', STATUS.BAD_REQUEST, 'FIELD_INVALID', { field })
  }
  return date
}

/**
 * PATCH /admin/offers/:code — { active, startsAt, endsAt, slotsTotal }.
 * Campo ausente = fica como está; null em startsAt/endsAt = sem limite.
 * O preço não muda por aqui (mudança de preço tem aviso de 30 dias).
 */
export async function updateOffer(adminId, code, body = {}) {
  if (!OFFER_CODES.includes(code)) throw httpError('Oferta inválida.', STATUS.NOT_FOUND, 'OFFER_INVALID')
  if (body.active !== undefined && typeof body.active !== 'boolean') {
    throw httpError('Valor inválido.', STATUS.BAD_REQUEST, 'FIELD_INVALID', { field: 'active' })
  }

  return transaction(async (client) => {
    const before = (await client.query(q.OFFER_LOCK, [code])).rows[0]
    if (!before) throw httpError('Oferta inválida.', STATUS.NOT_FOUND, 'OFFER_INVALID')

    const next = {
      active: body.active ?? before.active,
      startsAt: body.startsAt !== undefined ? readDate(body.startsAt, 'startsAt') : before.starts_at,
      endsAt: body.endsAt !== undefined ? readDate(body.endsAt, 'endsAt') : before.ends_at,
      slotsTotal: before.slots_total
    }
    if (next.startsAt && next.endsAt && new Date(next.endsAt) <= new Date(next.startsAt)) {
      throw httpError('O fim da janela precisa ser depois do início.', STATUS.BAD_REQUEST, 'OFFER_WINDOW_INVALID')
    }
    if (body.slotsTotal !== undefined) {
      const slots = body.slotsTotal === null ? null : Number(body.slotsTotal)
      if (slots !== null && (!Number.isInteger(slots) || slots < before.slots_used || slots > 1_000_000)) {
        throw httpError('Vagas inválidas: não pode ser menos do que as já usadas.', STATUS.BAD_REQUEST, 'OFFER_SLOTS_INVALID', { used: before.slots_used })
      }
      next.slotsTotal = slots
    }

    await client.query(q.OFFER_UPDATE, [code, next.active, next.startsAt, next.endsAt, next.slotsTotal])
    await log(client, adminId, 'offer.update', null, {
      code,
      before: { active: before.active, startsAt: iso(before.starts_at), endsAt: iso(before.ends_at), slotsTotal: before.slots_total },
      after: { active: next.active, startsAt: iso(next.startsAt), endsAt: iso(next.endsAt), slotsTotal: next.slotsTotal }
    })
    const { rows } = await client.query(q.OFFERS)
    return { offer: offerOut(rows.find(row => row.code === code)) }
  })
}

// --------------------------------------------------------- webhooks e fila

/** GET /admin/webhooks?filter=error|pending|all */
export async function webhooks({ filter = 'error', page, limit } = {}) {
  if (!WEBHOOK_FILTERS.includes(filter)) {
    throw httpError("Parâmetro 'filter' inválido.", STATUS.BAD_REQUEST, 'PARAM_INVALID', { param: 'filter' })
  }
  const pagination = resolvePagination(page, limit)
  const { rows } = await db.query(q.WEBHOOKS, [filter, pagination.limit, pagination.offset])
  return {
    total: rows[0]?.total ?? 0,
    page: pagination.page,
    limit: pagination.limit,
    webhooks: rows.map(row => ({
      id: Number(row.id),
      provider: row.provider,
      topic: row.topic,
      resourceId: row.resource_id,
      receivedAt: iso(row.received_at),
      processedAt: iso(row.processed_at),
      attempts: row.attempts,
      error: row.error
    }))
  }
}

/** POST /admin/webhooks/:id/reprocess */
export async function reprocessWebhook(adminId, eventId) {
  const event = (await db.query(q.WEBHOOK, [eventId])).rows[0]
  if (!event || !(await webhookService.requeue(eventId))) {
    throw httpError('Notificação não encontrada.', STATUS.NOT_FOUND, 'WEBHOOK_NOT_FOUND')
  }
  await log(db, adminId, 'webhook.reprocess', null, { eventId: Number(eventId), topic: event.topic, resourceId: event.resource_id })
  return { queued: true }
}

/** GET /admin/jobs → fila por tipo, falhas recentes e o limite de e-mail */
export async function jobs() {
  const [types, { rows: failed }, email] = await Promise.all([queue.stats(), db.query(q.FAILED_JOBS), quota.usage()])
  return {
    types: types.map(row => ({ type: row.type, pending: row.pending, failed: row.failed, lastDoneAt: iso(row.last_done_at) })),
    failed: failed.map(row => ({
      id: Number(row.id), type: row.type, attempts: row.attempts, maxAttempts: row.max_attempts,
      lastError: row.last_error, failedAt: iso(row.failed_at), createdAt: iso(row.created_at)
    })),
    email
  }
}
