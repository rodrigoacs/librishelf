import express from 'express'
import * as tagService from '../services/tagService.js'
import { authenticateToken } from '../middlewares/auth.js'
import STATUS from '../utils/statusCodes.js'
import sendError from '../utils/sendError.js'

const router = express.Router()

router.use(authenticateToken)

router.get('/', async (req, res) => {
  try {
    const userId = req.user.id
    const tags = await tagService.getTagsByUserId(userId)
    res.status(STATUS.OK).json(tags)
  } catch (error) {
    sendError(res, error, 'Erro ao buscar tags')
  }
})

export default router