import express from 'express'
import { authenticateToken } from '../middlewares/auth.js'
import { socialLimiter, reportLimiter } from '../middlewares/rateLimiter.js'
import { validateNumericId } from '../middlewares/validateId.js'
import * as reviewService from '../services/reviewService.js'
import STATUS from '../utils/statusCodes.js'
import sendError from '../utils/sendError.js'

/** Curtir e denunciar resenhas de outros leitores (precisa estar logado). */
const router = express.Router()

router.use(authenticateToken)

router.post('/:id/like', socialLimiter, validateNumericId(), async (req, res) => {
  try {
    res.status(STATUS.OK).json(await reviewService.like(Number(req.params.id), req.user.id, true))
  } catch (error) {
    sendError(res, error, 'Erro ao curtir resenha')
  }
})

router.delete('/:id/like', socialLimiter, validateNumericId(), async (req, res) => {
  try {
    res.status(STATUS.OK).json(await reviewService.like(Number(req.params.id), req.user.id, false))
  } catch (error) {
    sendError(res, error, 'Erro ao descurtir resenha')
  }
})

// { reason: 'spoiler' | 'offensive' | 'spam' | 'other', note? }
router.post('/:id/report', reportLimiter, validateNumericId(), async (req, res) => {
  try {
    res.status(STATUS.OK).json(await reviewService.report(Number(req.params.id), req.user.id, req.body ?? {}))
  } catch (error) {
    sendError(res, error, 'Erro ao denunciar resenha')
  }
})

export default router
