import * as publisherService from '../services/publisherService.js'
import { authenticateToken } from '../middlewares/auth.js'
import express from 'express'
import STATUS from '../utils/statusCodes.js'
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

export default router