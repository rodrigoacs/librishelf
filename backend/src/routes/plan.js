import express from 'express'
import { authenticateToken } from '../middlewares/auth.js'
import { sensitiveLimiter, publicLimiter } from '../middlewares/rateLimiter.js'
import * as trialService from '../services/trialService.js'
import * as entitlementService from '../services/entitlementService.js'
import * as checkoutService from '../services/checkoutService.js'
import * as subscriptionService from '../services/subscriptionService.js'
import * as withdrawalService from '../services/withdrawalService.js'
import { processPayment } from '../services/paymentService.js'
import STATUS from '../utils/statusCodes.js'
import sendError from '../utils/sendError.js'
import { httpError } from '../utils/httpError.js'
import { track } from '../utils/metrics.js'
import logger from '../utils/logger.js'

// Plano Pro: ofertas (público), teste grátis e checkout da própria conta.
// O estado do plano continua vindo de /auth/me.
const router = express.Router()

const REFERENCE = /^[0-9a-f-]{36}$/i

// Página de preços: preços, vagas restantes e o que dá para comprar agora
router.get('/offers', publicLimiter, async (req, res) => {
  try {
    res.status(STATUS.OK).json({ offers: await checkoutService.offers() })
  } catch (error) {
    sendError(res, error, 'Erro ao listar ofertas')
  }
})

router.use(authenticateToken)

// Ativa o teste grátis de 14 dias (um por conta). → { endsAt, plan }
router.post('/trial', sensitiveLimiter, track('pro.trial'), async (req, res) => {
  try {
    const { endsAt } = await trialService.activate(req.user.id)
    res.status(STATUS.CREATED).json({ endsAt, plan: await entitlementService.planOf(req.user.id) })
  } catch (error) {
    sendError(res, error, 'Erro ao ativar o teste grátis')
  }
})

// Abre o checkout no Mercado Pago (mensal = assinatura). { offer } → { url, reference, expiresAt }
router.post('/checkout', sensitiveLimiter, track('pro.checkout'), async (req, res) => {
  try {
    res.status(STATUS.CREATED).json(await checkoutService.start(req.user.id, req.body?.offer))
  } catch (error) {
    sendError(res, error, 'Erro ao abrir o checkout')
  }
})

function checkReference(reference) {
  if (!REFERENCE.test(reference)) throw httpError('Compra não encontrada.', STATUS.NOT_FOUND, 'CHECKOUT_NOT_FOUND')
}

// Página de retorno: estado da compra pelo que o servidor sabe
router.get('/checkout/:reference', async (req, res) => {
  try {
    checkReference(req.params.reference)
    res.status(STATUS.OK).json(await checkoutService.status(req.user.id, req.params.reference))
  } catch (error) {
    sendError(res, error, 'Erro ao consultar a compra')
  }
})

// Volta do Mercado Pago com ?payment_id=…: confere já na API, sem esperar o
// webhook. O id só serve de dica; o que vale é a resposta da API.
router.post('/checkout/:reference/sync', sensitiveLimiter, async (req, res) => {
  try {
    const { reference } = req.params
    checkReference(reference)
    await checkoutService.status(req.user.id, reference) // 404 se não é desta conta

    const paymentId = String(req.body?.paymentId ?? '')
    if (/^\d{1,20}$/.test(paymentId)) {
      await processPayment(paymentId, { expectedReference: reference })
        // Falhou agora: o webhook e a reconciliação resolvem depois
        .catch(err => logger.warn('Conferência do pagamento na volta falhou', { paymentId, message: err.message }))
    }
    res.status(STATUS.OK).json({
      ...(await checkoutService.status(req.user.id, reference)),
      plan: await entitlementService.planOf(req.user.id)
    })
  } catch (error) {
    sendError(res, error, 'Erro ao conferir a compra')
  }
})

// Cancela a renovação do mensal; o Pro vale até o fim do período pago. → { endsAt, plan }
router.post('/subscription/cancel', sensitiveLimiter, track('pro.cancel'), async (req, res) => {
  try {
    const { endsAt } = await subscriptionService.cancel(req.user.id)
    res.status(STATUS.OK).json({ endsAt, plan: await entitlementService.planOf(req.user.id) })
  } catch (error) {
    sendError(res, error, 'Erro ao cancelar a assinatura')
  }
})

// Desistência da compra em até 7 dias (pacote 36b) → { refundedAt, plan, ... }
router.post('/payments/:id/withdraw', sensitiveLimiter, track('pro.withdraw'), async (req, res) => {
  try {
    const paymentId = Number(req.params.id)
    if (!Number.isInteger(paymentId) || paymentId < 1) {
      throw httpError('Compra não encontrada.', STATUS.NOT_FOUND, 'PAYMENT_NOT_FOUND')
    }
    res.status(STATUS.OK).json(await withdrawalService.withdraw(req.user.id, paymentId))
  } catch (error) {
    sendError(res, error, 'Erro ao registrar a desistência')
  }
})

// Conta → histórico de cobranças
router.get('/payments', async (req, res) => {
  try {
    res.status(STATUS.OK).json({ payments: await subscriptionService.history(req.user.id) })
  } catch (error) {
    sendError(res, error, 'Erro ao listar cobranças')
  }
})

export default router
