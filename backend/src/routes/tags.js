import express from 'express'
import * as tagService from '../services/tagService.js'
import { authenticateToken } from '../middlewares/auth.js'
import STATUS from '../utils/statusCodes.js'

const router = express.Router()

router.use(authenticateToken)

router.get('/', async (req, res) => {
  try {
    const userId = req.user.id
    const tags = await tagService.getTagsByUserId(userId)
    res.status(STATUS.OK).json(tags)
  } catch (error) {
    console.error('Erro ao buscar tags:', error)
    res.status(STATUS.INTERNAL_SERVER_ERROR).json({ error: error.message })
  }
})

export default router