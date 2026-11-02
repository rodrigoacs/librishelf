import { expireEntitlements } from './handlers/entitlements.js'
import { releaseReservations } from './handlers/reservations.js'
import { cleanupJobs } from './handlers/maintenance.js'
import { processWebhookEvent } from './handlers/webhooks.js'
import { reconcile } from './handlers/reconcile.js'

/**
 * Tipo de job → função(payload, job). Lançar erro = tentar de novo depois
 * (com espera crescente) até max_attempts. Lançar PermanentJobError = desistir
 * na hora (dado inválido, recurso que não existe mais).
 *
 * Os próximos pacotes registram aqui: e-mails, importação, capas, backup.
 */
export { PermanentJobError } from './errors.js'

export const HANDLERS = {
  'entitlements.expire': () => expireEntitlements(),
  'reservations.release': () => releaseReservations(),
  'jobs.cleanup': () => cleanupJobs(),
  'webhook.process': payload => processWebhookEvent(payload.eventId),
  'mercadopago.reconcile': () => reconcile()
}

/**
 * Jobs periódicos. O worker agenda cada um com dedupe_key do intervalo
 * ("entitlements.expire:2026-11-02T14:15"), então vários workers ou um
 * reinício no meio do intervalo não duplicam nada.
 */
export const RECURRING = [
  { type: 'entitlements.expire', everyMinutes: 15 },
  { type: 'reservations.release', everyMinutes: 5 },
  { type: 'jobs.cleanup', everyMinutes: 24 * 60 },
  { type: 'mercadopago.reconcile', everyMinutes: 24 * 60 }
]
