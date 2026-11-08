import { db } from '../../database/connection.js'
import { WEBHOOK_QUERIES as q } from '../../database/queries.js'
import { processPayment } from '../../services/paymentService.js'
import { processPreapproval, processAuthorizedPayment } from '../../services/subscriptionService.js'
import logger from '../../utils/logger.js'
import { recordWebhookFailure } from '../../services/errorReportService.js'

/**
 * Processa um webhook gravado, sempre consultando a API do Mercado Pago.
 * Tópico que o Librishelf não usa: marcado como processado, com a nota.
 */
const PROCESSORS = {
  mercadopago: {
    payment: event => processPayment(event.resource_id),
    subscription_preapproval: event => processPreapproval(event.resource_id),
    subscription_authorized_payment: event => processAuthorizedPayment(event.resource_id, { processPayment })
  }
}

export async function processWebhookEvent(eventId) {
  const event = (await db.query(q.START, [eventId])).rows[0]
  if (!event) return { skipped: 'evento não existe' }
  if (event.processed_at) return { skipped: 'já processado' }

  const processor = PROCESSORS[event.provider]?.[event.topic]
  if (!processor) {
    await db.query(q.IGNORE, [eventId, `Tópico ignorado: ${event.topic}`])
    return { skipped: 'tópico ignorado', topic: event.topic }
  }
  if (!event.resource_id) {
    await db.query(q.IGNORE, [eventId, 'Notificação sem recurso'])
    return { skipped: 'sem recurso' }
  }

  try {
    const result = await processor(event)
    await db.query(q.FINISH, [eventId])
    return result
  } catch (err) {
    await db.query(q.SET_ERROR, [eventId, String(err.message).slice(0, 2000)])
    logger.warn('Falha ao processar webhook', { eventId, topic: event.topic, message: err.message })
    await recordWebhookFailure(event, err)
    throw err
  }
}
