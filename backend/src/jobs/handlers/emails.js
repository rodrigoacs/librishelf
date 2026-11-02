import { sendQueued, scanDue } from '../../services/billingEmailService.js'
import { deliverDue } from '../../services/followEmailService.js'

/** email.send: um e-mail da fila (cobrança, teste grátis). */
export const sendEmail = payload => sendQueued(payload)

/** billing.reminders (de hora em hora): vencimentos do anual e do teste. */
export const billingReminders = () => scanDue()

/**
 * follow-emails.sweep (a cada 5 min): avisos de seguidores que esperavam o
 * intervalo mínimo. Antes era um setInterval no server.js. Não duplica: cada
 * envio "reserva" a vez da pessoa com um UPDATE atômico em users, então duas
 * varreduras ao mesmo tempo (ou um servidor antigo ainda de pé durante o
 * deploy) não mandam o mesmo aviso duas vezes.
 */
export async function sweepFollowEmails() {
  return { sent: await deliverDue() }
}
