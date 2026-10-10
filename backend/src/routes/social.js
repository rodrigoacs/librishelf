import express from 'express'
import { authenticateToken } from '../middlewares/auth.js'
import { socialLimiter } from '../middlewares/rateLimiter.js'
import * as socialService from '../services/socialService.js'
import STATUS from '../utils/statusCodes.js'
import sendError from '../utils/sendError.js'

const router = express.Router()

router.use(authenticateToken)

router.get('/feed', async (req, res) => {
  try {
    res.status(STATUS.OK).json(await socialService.feed(req.user.id, req.query.page))
  } catch (error) {
    sendError(res, error, 'Erro ao carregar o feed')
  }
})

router.get('/connections', async (req, res) => {
  try {
    res.status(STATUS.OK).json(await socialService.connections(req.user.id))
  } catch (error) {
    sendError(res, error, 'Erro ao carregar conexões')
  }
})

router.get('/requests/count', async (req, res) => {
  try {
    res.status(STATUS.OK).json(await socialService.pendingCount(req.user.id))
  } catch (error) {
    sendError(res, error, 'Erro ao contar pedidos')
  }
})

router.post('/follow/:username', socialLimiter, async (req, res) => {
  try {
    res.status(STATUS.OK).json(await socialService.requestFollow(req.user.id, req.params.username))
  } catch (error) {
    sendError(res, error, 'Erro ao pedir para seguir')
  }
})

router.delete('/follow/:username', socialLimiter, async (req, res) => {
  try {
    res.status(STATUS.OK).json(await socialService.unfollow(req.user.id, req.params.username))
  } catch (error) {
    sendError(res, error, 'Erro ao deixar de seguir')
  }
})

router.post('/requests/:username/accept', socialLimiter, async (req, res) => {
  try {
    res.status(STATUS.OK).json(await socialService.acceptRequest(req.user.id, req.params.username))
  } catch (error) {
    sendError(res, error, 'Erro ao aceitar pedido')
  }
})

router.delete('/requests/:username', socialLimiter, async (req, res) => {
  try {
    await socialService.rejectRequest(req.user.id, req.params.username)
    res.status(STATUS.NO_CONTENT).send()
  } catch (error) {
    sendError(res, error, 'Erro ao recusar pedido')
  }
})

router.delete('/followers/:username', socialLimiter, async (req, res) => {
  try {
    await socialService.removeFollower(req.user.id, req.params.username)
    res.status(STATUS.NO_CONTENT).send()
  } catch (error) {
    sendError(res, error, 'Erro ao remover seguidor')
  }
})

export default router
