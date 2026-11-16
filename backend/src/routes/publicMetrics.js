import express from 'express'
import { optionalAuth } from '../middlewares/auth.js'
import { publicLimiter } from '../middlewares/rateLimiter.js'
import * as publicMetricsService from '../services/publicMetricsService.js'
import STATUS from '../utils/statusCodes.js'
import sendError from '../utils/sendError.js'

/**
 * POST /public-metrics/u/:username { event } → 204
 * Sem login (quem visita a página pública normalmente não tem conta). Com
 * sessão, só serve para não contar a visita do próprio dono. Nada de quem
 * mandou é guardado (publicMetricsService.js).
 */
const router = express.Router()

router.post('/u/:username', publicLimiter, optionalAuth, async (req, res) => {
  try {
    await publicMetricsService.record(req.params.username, req.body?.event, req.user?.id ?? null)
    res.status(STATUS.NO_CONTENT).end()
  } catch (error) {
    sendError(res, error, 'Erro ao contar a visita')
  }
})

export default router
