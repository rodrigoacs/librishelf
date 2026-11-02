import express from 'express'
import * as webhookService from '../services/webhookService.js'
import STATUS from '../utils/statusCodes.js'
import sendError from '../utils/sendError.js'

// Notificações dos provedores de pagamento. Sem sessão: a autenticidade vem
// da assinatura (x-signature). Público em {APP_URL}/api/webhooks/mercadopago.
const router = express.Router()

router.post('/mercadopago', async (req, res) => {
  try {
    await webhookService.receive(req)
    // Repetida ou nova, a resposta é a mesma: recebido
    res.status(STATUS.OK).json({ received: true })
  } catch (error) {
    sendError(res, error, 'Erro ao receber webhook do Mercado Pago')
  }
})

export default router
