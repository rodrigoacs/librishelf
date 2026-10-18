import * as publisherService from '../services/publisherService.js'
import { authenticateToken } from '../middlewares/auth.js'
import express from 'express'
import STATUS from '../utils/statusCodes.js'
import { mergeNames } from '../services/namesService.js'
import sendError from '../utils/sendError.js'

const router = express.Router()

router.use(authenticateToken)

router.get('/', async (req, res) => {
  try {
    const userId = req.user.id
    const authorFilter = req.query.authors

    const publishers = await publisherService.getPublishersByUserId(userId, authorFilter)

    res.status(STATUS.OK).json(publishers)
  } catch (error) {
    sendError(res, error, 'Erro ao buscar editoras')
  }
})

// Renomear (um nome em "from") ou mesclar vários num só: { from: [...], to: '...' }
router.post('/merge', async (req, res) => {
  try {
    res.status(STATUS.OK).json(await mergeNames('publisher', req.user.id, req.body ?? {}))
  } catch (error) {
    sendError(res, error, 'Erro ao renomear/mesclar')
  }
})

export default router