import { expireEntitlements } from './handlers/entitlements.js'
import { releaseReservations } from './handlers/reservations.js'
import { cleanupJobs, cleanupTokens } from './handlers/maintenance.js'
import { sendEmail, billingReminders, sweepFollowEmails } from './handlers/emails.js'
import { runImport, runCovers, cleanup as cleanupImports } from '../services/importService.js'
import { processWebhookEvent } from './handlers/webhooks.js'
import { reconcile } from './handlers/reconcile.js'
import * as backupService from '../services/backupService.js'
import * as errorReportService from '../services/errorReportService.js'

/**
 * Tipo de job → função(payload, job). Lançar erro = tentar de novo depois
 * (com espera crescente) até max_attempts. Lançar PermanentJobError = desistir
 * na hora (dado inválido, recurso que não existe mais).
 *
 * Os próximos pacotes registram aqui: e-mails, importação, capas, backup.
 */
export { PermanentJobError, RetryLaterError } from './errors.js'

export const HANDLERS = {
  'entitlements.expire': () => expireEntitlements(),
  'reservations.release': () => releaseReservations(),
  'jobs.cleanup': () => cleanupJobs(),
  'webhook.process': payload => processWebhookEvent(payload.eventId),
  'mercadopago.reconcile': () => reconcile(),
  'email.send': payload => sendEmail(payload),
  'billing.reminders': () => billingReminders(),
  'follow-emails.sweep': () => sweepFollowEmails(),
  'tokens.cleanup': () => cleanupTokens(),
  'import.run': payload => runImport(payload.importId),
  'import.covers': payload => runCovers(payload.importId, payload.round ?? 0),
  'imports.cleanup': () => cleanupImports(),
  'backups.sweep': () => backupService.sweep(),
  'backup.create': payload => backupService.create(payload),
  'errors.digest': () => errorReportService.digest(),
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
  { type: 'mercadopago.reconcile', everyMinutes: 24 * 60 },
  { type: 'billing.reminders', everyMinutes: 60 },
  { type: 'follow-emails.sweep', everyMinutes: 5 },
  { type: 'tokens.cleanup', everyMinutes: 24 * 60 },
  { type: 'imports.cleanup', everyMinutes: 24 * 60 },
  { type: 'backups.sweep', everyMinutes: 60 },
  { type: 'errors.digest', everyMinutes: 15 }
]
