import { db } from '../database/connection.js'
import { BILLING_EMAIL_QUERIES as q } from '../database/queries.js'
import { enqueue } from '../jobs/queue.js'
import { PermanentJobError, RetryLaterError } from '../jobs/errors.js'
import { sendMail } from './mailService.js'
import * as quota from './emailQuota.js'
import { renewalReminderEmail, trialEndingEmail, trialEndedEmail, paymentConfirmedEmail, paymentDeclinedEmail } from './emailTemplates.js'
import logger from '../utils/logger.js'
import { loanReminderEmail } from './emailTemplates.js'
import { loanReminderMessage } from './collectionService.js'
import { backupReadyMessage } from './backupService.js'
import { backupReadyEmail } from './emailTemplates.js'

/**
 * E-mails de cobrança, sempre pela fila (job email.send).
 *
 * O job guarda só ids; o e-mail é montado na hora de enviar, a partir do
 * banco. Se ele deixou de valer (renovou, pagou de outro jeito, foi
 * reembolsado, assinou durante o teste), o job termina sem enviar.
 *
 * Nunca o mesmo e-mail duas vezes: cada um tem uma dedupe_key fixa (por
 * entitlement ou por pagamento). Os jobs terminados ficam 30 dias na fila
 * (jobs.cleanup); todas as janelas abaixo são menores que isso, então a
 * varredura nunca acha de novo algo cuja chave já saiu da tabela.
 */
export const EMAIL_JOB = 'email.send'
export const RENEWAL_NOTICE_DAYS = 7
export const TRIAL_WARNING_DAYS = 3
// Teste que acabou há mais do que isso não recebe o aviso pela varredura
// (worker parado por muito tempo, primeiro deploy deste pacote)
export const TRIAL_ENDED_WINDOW_HOURS = 48
// Recusa num checkout avulso: espera um pouco; se a pessoa pagar de outro
// jeito na mesma compra (outro cartão, Pix), o aviso não sai
export const DECLINED_DELAY_MINUTES = 30
const MAX_ATTEMPTS = 6
const DAY_MS = 24 * 60 * 60 * 1000
const RENEWABLE = new Set(['annual', 'founder_annual'])

function siteUrl() {
  return (process.env.APP_URL || 'https://librishelf.com').replace(/\/+$/, '')
}

const later = minutes => new Date(Date.now() + minutes * 60 * 1000)
const options = (dedupeKey, runAt = null) => ({ dedupeKey, runAt, maxAttempts: MAX_ATTEMPTS })

// ------------------------------------------------------------------ ganchos

/** Pagamento que liberou ou estendeu o Pro. `client`: a mesma transação. */
export function queuePaymentConfirmed(paymentId, client) {
  return enqueue(EMAIL_JOB, { kind: 'payment_confirmed', paymentId }, options(`email:payment-confirmed:${paymentId}`), client)
}

/**
 * Pagamento recusado. Um aviso por compra avulsa; no mensal, um por mês (o
 * Mercado Pago tenta a cobrança de novo nos dias seguintes).
 */
export function queuePaymentDeclined({ paymentId, reservationId, monthly }, client) {
  const key = monthly
    ? `email:payment-declined:subscription:${reservationId}:${new Date().toISOString().slice(0, 7)}`
    : `email:payment-declined:checkout:${reservationId}`
  return enqueue(EMAIL_JOB, { kind: 'payment_declined', paymentId }, options(key, later(DECLINED_DELAY_MINUTES)), client)
}

/** Teste ativado: um aviso antes do fim e outro no fim (mesmas chaves da varredura). */
export async function queueTrialNotices({ entitlementId, endsAt }, client) {
  const end = new Date(endsAt).getTime()
  await enqueue(EMAIL_JOB, { kind: 'trial_ending', entitlementId },
    options(`email:trial-ending:${entitlementId}`, new Date(end - TRIAL_WARNING_DAYS * DAY_MS)), client)
  await enqueue(EMAIL_JOB, { kind: 'trial_ended', entitlementId },
    options(`email:trial-ended:${entitlementId}`, new Date(end)), client)
}

/** Job periódico (billing.reminders): procura vencimentos e enfileira os avisos. */
export async function scanDue() {
  const found = { renewal: 0, trialEnding: 0, trialEnded: 0 }
  const plan = [
    ['renewal', 'renewal_reminder', 'renewal', q.RENEWAL_DUE, RENEWAL_NOTICE_DAYS],
    ['trialEnding', 'trial_ending', 'trial-ending', q.TRIAL_ENDING_DUE, TRIAL_WARNING_DAYS],
    ['trialEnded', 'trial_ended', 'trial-ended', q.TRIAL_ENDED_DUE, TRIAL_ENDED_WINDOW_HOURS]
  ]
  for (const [counter, kind, slug, sql, param] of plan) {
    const { rows } = await db.query(sql, [param])
    for (const { id } of rows) {
      const entitlementId = Number(id)
      if (await enqueue(EMAIL_JOB, { kind, entitlementId }, options(`email:${slug}:${entitlementId}`))) found[counter]++
    }
  }
  if (found.renewal + found.trialEnding + found.trialEnded) logger.info('Avisos de cobrança enfileirados', found)
  return found
}

// ---------------------------------------------------------------- montagem

const skip = reason => ({ skip: reason })
const reachable = row => Boolean(row?.email && row.email_verified_at)
const isFuture = date => Boolean(date) && new Date(date).getTime() > Date.now()

async function entitlementRow(id) {
  return (await db.query(q.ENTITLEMENT, [id])).rows[0]
}

async function paymentRow(id) {
  return (await db.query(q.PAYMENT, [id])).rows[0]
}

const base = row => ({ userId: row.user_id, to: row.email, name: row.name, locale: row.email_locale })

const BUILDERS = {
  // Pacote 30: backup automático pronto (só o link; o arquivo fica na conta)
  async backup_ready(payload) {
    const message = await backupReadyMessage(payload)
    return message.skip ? message : { ...message, build: backupReadyEmail }
  },

  // Pacote 28: lembrete de empréstimo (Pro), para a própria pessoa
  async loan_reminder(payload) {
    const message = await loanReminderMessage(payload)
    return message.skip ? message : { ...message, build: loanReminderEmail }
  },

  async renewal_reminder({ entitlementId }) {
    const row = await entitlementRow(entitlementId)
    if (!row) return skip('Pro não existe mais')
    if (!reachable(row)) return skip('e-mail não confirmado')
    if (row.status !== 'active' || !isFuture(row.ends_at)) return skip('Pro não está ativo')
    if (!RENEWABLE.has(row.kind) || row.auto_renew) return skip('plano renova sozinho')
    if (row.covered) return skip('já renovado')
    return { ...base(row), build: renewalReminderEmail, params: {
      link: `${siteUrl()}/pricing?offer=${row.kind}`, plan: row.kind, endsAt: row.ends_at, amountCents: row.offer_cents
    } }
  },

  async trial_ending({ entitlementId }) {
    const row = await entitlementRow(entitlementId)
    if (!row || row.kind !== 'trial') return skip('teste não existe mais')
    if (!reachable(row)) return skip('e-mail não confirmado')
    if (row.status !== 'active' || !isFuture(row.ends_at)) return skip('teste já acabou')
    if (row.covered) return skip('já assinou')
    return { ...base(row), build: trialEndingEmail, params: { link: `${siteUrl()}/pricing`, endsAt: row.ends_at } }
  },

  async trial_ended({ entitlementId }) {
    const row = await entitlementRow(entitlementId)
    if (!row || row.kind !== 'trial') return skip('teste não existe mais')
    if (!reachable(row)) return skip('e-mail não confirmado')
    if (!['active', 'expired'].includes(row.status)) return skip('teste revogado')
    if (isFuture(row.ends_at)) return skip('teste ainda não acabou')
    if (row.pro_now) return skip('tem Pro agora')
    return { ...base(row), build: trialEndedEmail, params: { link: `${siteUrl()}/pricing` } }
  },

  async payment_confirmed({ paymentId }) {
    const row = await paymentRow(paymentId)
    if (!row) return skip('pagamento não existe mais')
    if (!reachable(row)) return skip('e-mail não confirmado')
    if (row.status !== 'approved') return skip('pagamento não está aprovado')
    if (!row.entitlement_status || row.entitlement_status === 'refunded') return skip('sem Pro liberado')
    return { ...base(row), build: paymentConfirmedEmail, params: {
      link: `${siteUrl()}/settings`, plan: row.offer_code, amountCents: row.amount_cents, currency: row.currency,
      method: row.method, endsAt: row.ends_at
    } }
  },

  async payment_declined({ paymentId }) {
    const row = await paymentRow(paymentId)
    if (!row) return skip('pagamento não existe mais')
    if (!reachable(row)) return skip('e-mail não confirmado')
    if (row.status !== 'rejected') return skip('pagamento não está recusado')
    if (row.approved_after) return skip('pagou depois')
    const monthly = row.offer_code === 'monthly'
    if (!monthly && row.reservation_status === 'confirmed') return skip('compra já paga')
    // Cobrança de um mês seguinte: o Pro do mês pago continua
    const renewal = monthly && isFuture(row.pro_until)
    return { ...base(row), build: paymentDeclinedEmail, params: {
      link: renewal ? `${siteUrl()}/settings` : `${siteUrl()}/pricing?offer=${row.offer_code}`,
      plan: row.offer_code, amountCents: row.amount_cents, currency: row.currency, monthly, renewal,
      activeUntil: renewal ? row.pro_until : null
    } }
  }
}

export const EMAIL_KINDS = Object.freeze(Object.keys(BUILDERS))

/**
 * Handler do job email.send: { kind, entitlementId | paymentId }.
 * → { sent: kind } | { skipped: kind, reason }
 */
export async function sendQueued(payload = {}) {
  const builder = BUILDERS[payload.kind]
  if (!builder) throw new PermanentJobError(`E-mail desconhecido: ${payload.kind}`)

  const message = await builder(payload)
  if (message.skip) return { skipped: payload.kind, reason: message.skip }

  const slot = await quota.reserve(payload.kind, message.userId)
  if (!slot) throw new RetryLaterError('Limite de envio da caixa atingido', await quota.secondsUntilSlot())

  const mail = message.build({ name: message.name, locale: message.locale, ...message.params })
  try {
    await sendMail({ to: message.to, subject: mail.subject, text: mail.text, html: mail.html, counted: true })
  } catch (err) {
    await quota.release(slot)
    throw err
  }
  logger.info('E-mail de cobrança enviado', { kind: payload.kind, userId: message.userId })
  return { sent: payload.kind }
}
