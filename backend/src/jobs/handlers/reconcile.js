import { db } from '../../database/connection.js'
import { SUBSCRIPTION_QUERIES as s } from '../../database/queries.js'
import * as mercadoPago from '../../services/mercadoPago.js'
import { processPayment } from '../../services/paymentService.js'
import { processPreapproval, processAuthorizedPayment } from '../../services/subscriptionService.js'
import { enqueue } from '../queue.js'
import logger from '../../utils/logger.js'

/**
 * Reconciliação diária com o Mercado Pago, caso algum webhook se perca:
 *   1. pagamentos ainda em aberto → consulta cada um;
 *   2. checkouts avulsos recentes sem pagamento aprovado → busca pagamentos
 *      pela external_reference;
 *   3. assinaturas → estado do preapproval e cobranças do mês;
 *   4. webhooks sem processar há mais de 10 min → de volta à fila.
 * Um item com erro não para os outros; o resumo vai para o log.
 */
const results = () => ({ checked: 0, failed: 0 })

async function each(list, work, summary) {
  for (const item of list) {
    summary.checked++
    try {
      await work(item)
    } catch (err) {
      summary.failed++
      logger.warn('Reconciliação: item com erro', { item, message: err.message })
    }
  }
}

export async function reconcile() {
  const summary = { payments: results(), reservations: results(), subscriptions: results(), webhooks: results() }
  if (!mercadoPago.isConfigured()) return { skipped: 'MP_ACCESS_TOKEN não definido' }

  const open = (await db.query(s.RECONCILE_OPEN_PAYMENTS)).rows
  await each(open.map(row => row.external_id), id => processPayment(id), summary.payments)

  const reservations = (await db.query(s.RECONCILE_RESERVATIONS)).rows
  await each(reservations.map(row => row.reference), async (reference) => {
    const found = await mercadoPago.searchPayments(reference)
    for (const payment of found?.results || []) await processPayment(String(payment.id))
  }, summary.reservations)

  const preapprovals = (await db.query(s.RECONCILE_PREAPPROVALS)).rows
  await each(preapprovals.map(row => row.preapproval_id), async (id) => {
    await processPreapproval(id)
    const invoices = await mercadoPago.searchAuthorizedPayments(id)
    for (const invoice of invoices?.results || []) {
      if (invoice.payment?.id) await processAuthorizedPayment(String(invoice.id), { processPayment })
    }
  }, summary.subscriptions)

  const day = new Date().toISOString().slice(0, 10)
  const stuck = (await db.query(s.RECONCILE_WEBHOOKS)).rows
  await each(stuck.map(row => row.id), id => enqueue('webhook.process', { eventId: id }, { dedupeKey: `webhook:${id}:reconcile:${day}` }), summary.webhooks)

  logger.info('Reconciliação com o Mercado Pago concluída', summary)
  return summary
}
