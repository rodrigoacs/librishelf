import express from 'express'
import * as authorService from '../services/authorService.js'
import { authenticateToken } from '../middlewares/auth.js'
import STATUS from '../utils/statusCodes.js'

const router = express.Router()

router.use(authenticateToken)

router.get('/', async (req, res) => {
  try {
    const userId = req.user.id

    const authors = await authorService.getAuthorsByUserId(userId)

    res.status(STATUS.OK).json(authors)
  } catch (error) {
    console.error('Erro ao buscar autores:', error)
    res.status(STATUS.INTERNAL_SERVER_ERROR).json({ error: error.message })
  }
})

export default router