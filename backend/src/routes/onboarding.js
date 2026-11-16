import express from 'express'
import { authenticateToken } from '../middlewares/auth.js'
import * as onboardingService from '../services/onboardingService.js'
import STATUS from '../utils/statusCodes.js'
import sendError from '../utils/sendError.js'

/**
 * Onboarding (pacote 42)
 *   GET   /onboarding   { status, step, start, books, firstBooks, isPublic, vanguarda }
 *   PATCH /onboarding   { status?, step?, start? } → o mesmo do GET
 */
const router = express.Router()

router.use(authenticateToken)

router.get('/', async (req, res) => {
  try {
    res.status(STATUS.OK).json(await onboardingService.get(req.user.id))
  } catch (error) {
    sendError(res, error, 'Erro ao carregar os primeiros passos')
  }
})

router.patch('/', async (req, res) => {
  try {
    res.status(STATUS.OK).json(await onboardingService.update(req.user.id, req.body ?? {}))
  } catch (error) {
    sendError(res, error, 'Erro ao salvar os primeiros passos')
  }
})

export default router
