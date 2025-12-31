import * as publisherService from '../services/publisherService.js'
import { authenticateToken } from '../middlewares/auth.js'
import express from 'express'
import STATUS from '../utils/statusCodes.js'

const router = express.Router()

router.use(authenticateToken)

router.get('/', async (req, res) => {
  try {
    const userId = req.user.id
    const publishers = await publisherService.getPublishersByUserId(userId)
    res.status(STATUS.OK).json(publishers)
  } catch (error) {
    console.error('Erro ao buscar editoras:', error)
    res.status(STATUS.INTERNAL_SERVER_ERROR).json({ error: error.message })
  }
})

export default router