import express from 'express'
import { tokenLimiter } from '../middlewares/rateLimiter.js'
import * as reviewService from '../services/reviewService.js'
import STATUS from '../utils/statusCodes.js'
import sendError from '../utils/sendError.js'

/**
 * Moderação de resenha pelo link do e-mail de denúncia (vai para
 * ADMIN_EMAIL). Sem login: o token assinado identifica a resenha e só vale
 * para ela. GET mostra; POST oculta ou mantém.
 */
const router = express.Router()

router.get('/review', tokenLimiter, async (req, res) => {
  try {
    res.status(STATUS.OK).json(await reviewService.forModeration(String(req.query.token ?? '')))
  } catch (error) {
    sendError(res, error, 'Erro ao abrir moderação')
  }
})

router.post('/review/hide', tokenLimiter, async (req, res) => {
  try {
    res.status(STATUS.OK).json(await reviewService.moderate(String(req.query.token ?? ''), true))
  } catch (error) {
    sendError(res, error, 'Erro ao ocultar resenha')
  }
})

router.post('/review/show', tokenLimiter, async (req, res) => {
  try {
    res.status(STATUS.OK).json(await reviewService.moderate(String(req.query.token ?? ''), false))
  } catch (error) {
    sendError(res, error, 'Erro ao reexibir resenha')
  }
})

export default router
