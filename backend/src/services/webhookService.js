import crypto from 'node:crypto'
import { db } from '../database/connection.js'
import { WEBHOOK_QUERIES as q } from '../database/queries.js'
import { transaction } from '../repositories/proGrantRepository.js'
import { enqueue } from '../jobs/queue.js'
import { verifySignature } from '../utils/mercadoPagoSignature.js'
import { httpError } from '../utils/httpError.js'
import STATUS from '../utils/statusCodes.js'
import logger from '../utils/logger.js'

/**
 * Webhook do Mercado Pago (https://www.mercadopago.com.br/developers/pt/docs/your-integrations/notifications/webhooks):
 *
 * 1. Confere o x-signature (401 se não bater).
 * 2. Grava em webhook_events, idempotente por (provider, event_id), e
 *    enfileira o processamento na mesma transação.
 * 3. Responde 200 logo (o Mercado Pago espera até 22 s e reenvia a cada 15 min).
 * O worker processa consultando a API; repetir a notificação não muda nada.
 */
export const PROVIDER = 'mercadopago'

/** Lê tópico, recurso e id da notificação (formato atual e o antigo, por query) */
export function readNotification(req) {
  const body = req.body && typeof req.body === 'object' ? req.body : {}
  const topic = String(body.type || req.query.type || req.query.topic || '').slice(0, 100)
  const dataId = req.query['data.id'] ?? body.data?.id ?? req.query.id ?? null
  const resourceId = dataId === null || dataId === undefined ? null : String(dataId).slice(0, 200)
  // Sem id da notificação: uma chave estável a partir do conteúdo
  const eventId = body.id !== undefined && body.id !== null
    ? String(body.id)
    : crypto.createHash('sha256').update(`${topic}:${resourceId}:${body.action || ''}:${body.date_created || ''}`).digest('hex')
  return { topic, resourceId, eventId: eventId.slice(0, 200), action: body.action || null, body }
}

export function isAuthentic(req) {
  return verifySignature({
    header: req.get('x-signature'),
    requestId: req.get('x-request-id'),
    // O manifest usa o data.id da query string, como pede a documentação
    dataId: req.query['data.id'],
    secret: process.env.MP_WEBHOOK_SECRET?.trim()
  })
}

/**
 * Notificação IPN (?id=&topic=), que o MP manda junto da Webhook quando há
 * notification_url. Não tem assinatura e a Webhook do mesmo recurso já chega:
 * https://www.mercadopago.com.br/developers/pt/docs/your-integrations/notifications/ipn
 */
export function isIpn(req) {
  return Boolean(req.query.topic) && req.query['data.id'] === undefined && !req.get('x-signature')
}

/** → { duplicate } ou { ignored } */
export async function receive(req) {
  // 200 sem gravar nada: com 4xx o MP reenviaria a IPN e o log encheria de ruído
  if (isIpn(req)) return { ignored: true }
  if (!process.env.MP_WEBHOOK_SECRET?.trim()) {
    logger.error('Webhook do Mercado Pago recebido sem MP_WEBHOOK_SECRET configurado; recusado')
    throw httpError('Assinatura inválida.', STATUS.UNAUTHORIZED, 'INVALID_SIGNATURE')
  }
  if (!isAuthentic(req)) {
    // Formato da notificação (sem valores), para separar Webhook (data.id/type) de IPN (id/topic)
    logger.warn('Webhook do Mercado Pago com assinatura inválida', {
      requestId: req.get('x-request-id'),
      hasSignature: Boolean(req.get('x-signature')),
      query: Object.keys(req.query).join(','),
      topic: req.query.type || req.query.topic || req.body?.type || req.body?.topic
    })
    throw httpError('Assinatura inválida.', STATUS.UNAUTHORIZED, 'INVALID_SIGNATURE')
  }

  const notification = readNotification(req)
  if (!notification.topic) throw httpError('Notificação sem tópico.', STATUS.BAD_REQUEST, 'WEBHOOK_INVALID')

  return transaction(async (client) => {
    const { rows } = await client.query(q.INSERT, [PROVIDER, notification.eventId, notification.topic, notification.resourceId, JSON.stringify(notification.body)])
    if (!rows[0]) return { duplicate: true }
    await enqueue('webhook.process', { eventId: rows[0].id }, { dedupeKey: `webhook:${rows[0].id}`, maxAttempts: 8 }, client)
    return { duplicate: false, id: rows[0].id }
  })
}

/** Para a administração reprocessar (pacote do admin) */
export async function requeue(eventId) {
  const { rowCount } = await db.query(q.RESET, [eventId])
  if (!rowCount) return false
  await enqueue('webhook.process', { eventId }, {})
  return true
}
