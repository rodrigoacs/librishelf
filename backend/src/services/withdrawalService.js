import { WITHDRAWAL_QUERIES as w, ADMIN_BILLING_QUERIES as q } from '../database/queries.js'
import { transaction } from '../repositories/proGrantRepository.js'
import * as mercadoPago from './mercadoPago.js'
import * as subscriptionService from './subscriptionService.js'
import * as entitlementService from './entitlementService.js'
import { queueWithdrawalConfirmed } from './billingEmailService.js'
import { withdrawableUntil } from './withdrawalRules.js'
import { httpError } from '../utils/httpError.js'
import STATUS from '../utils/statusCodes.js'
import logger from '../utils/logger.js'

/**
 * Desistência da compra pelo comprador, em Conta (pacote 36b). O Decreto
 * 7.962/2013 (art. 5º) pede que dê para desistir pela mesma ferramenta da
 * compra, com confirmação imediata e o pedido de estorno feito na hora.
 *
 * Ordem, dentro da transação que trava o pagamento:
 *   1. mensal: cancela a assinatura (sem isso, o mês seguinte seria cobrado);
 *   2. pede ao Mercado Pago o estorno do valor inteiro;
 *   3. tira o Pro daquela compra e marca o reembolso (refunded_by = o próprio
 *      comprador, o que distingue no Admin a desistência do reembolso manual);
 *   4. agenda o e-mail de confirmação.
 * Falha no Mercado Pago em 1 ou 2: nada muda aqui. Se o banco falhar depois do
 * estorno, o webhook do pagamento estornado tira o Pro do mesmo jeito.
 */
export async function withdraw(userId, paymentId) {
  const result = await transaction(async (client) => {
    const payment = (await client.query(w.PAYMENT_LOCK, [paymentId, userId])).rows[0]
    if (!payment) throw httpError('Compra não encontrada.', STATUS.NOT_FOUND, 'PAYMENT_NOT_FOUND')
    if (!withdrawableUntil(payment)) {
      throw httpError('O prazo de 7 dias para desistir desta compra acabou ou ela já foi reembolsada.', STATUS.CONFLICT, 'WITHDRAWAL_NOT_AVAILABLE')
    }

    const entitlement = payment.entitlement_id
      ? (await client.query(q.ENTITLEMENT_LOCK, [payment.entitlement_id])).rows[0]
      : null
    const subscriptionCanceled = entitlement ? await subscriptionService.stopRenewal(entitlement) : false

    try {
      await mercadoPago.refundPayment(payment.external_id, `withdrawal-${payment.id}`)
    } catch (err) {
      logger.error('Falha ao pedir o estorno da desistência', { paymentId: Number(payment.id), status: err.status, message: err.message })
      throw httpError('O Mercado Pago não respondeu agora, então a desistência não foi registrada. Tente de novo em instantes ou escreva para contato@librishelf.com.', 502, 'PAYMENT_PROVIDER_ERROR')
    }

    const entitlementRevoked = entitlement
      ? Boolean((await client.query(q.REFUND_ENTITLEMENT, [entitlement.id])).rows[0])
      : false
    const { rows: [marked] } = await client.query(q.MARK_REFUNDED, [payment.id, userId])
    await queueWithdrawalConfirmed(payment.id, client)

    logger.info('Desistência da compra', {
      userId, paymentId: Number(payment.id), offer: payment.offer_code, amountCents: payment.amount_cents, entitlementRevoked, subscriptionCanceled
    })
    return { refundedAt: marked.refunded_at.toISOString(), entitlementRevoked, subscriptionCanceled }
  })
  return { ...result, plan: await entitlementService.planOf(userId) }
}
