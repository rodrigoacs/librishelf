import express from 'express'
import { authenticateToken } from '../middlewares/auth.js'
import { validateNumericId } from '../middlewares/validateId.js'
import * as communityService from '../services/communityService.js'
import STATUS from '../utils/statusCodes.js'
import sendError from '../utils/sendError.js'

const router = express.Router()

router.use(authenticateToken)

router.get('/books/:id', validateNumericId(), async (req, res) => {
  try {
    res.status(STATUS.OK).json(await communityService.bookCommunity(req.params.id, req.user.id))
  } catch (error) {
    sendError(res, error, 'Erro ao buscar leitores do livro')
  }
})

export default router
