import express from 'express'
import { authenticateToken } from '../middlewares/auth.js'
import { validateNumericId } from '../middlewares/validateId.js'
import { socialLimiter } from '../middlewares/rateLimiter.js'
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

// Encontrar leitores: ?q=nome (vazio = sugestões). A tela busca enquanto a
// pessoa digita; o limite é o mesmo de seguir/curtir.
router.get('/readers', socialLimiter, async (req, res) => {
  try {
    res.status(STATUS.OK).json(await communityService.findReaders(req.user.id, req.query.q))
  } catch (error) {
    sendError(res, error, 'Erro ao buscar leitores')
  }
})

router.get('/recommendations', async (req, res) => {
  try {
    res.status(STATUS.OK).json(await communityService.recommendations(req.user.id))
  } catch (error) {
    sendError(res, error, 'Erro ao buscar recomendações')
  }
})

// Copiar um livro da comunidade para "Quero ler".
router.post('/books/:id/want', validateNumericId(), async (req, res) => {
  try {
    res.status(STATUS.CREATED).json(await communityService.addToWantList(req.params.id, req.user.id))
  } catch (error) {
    sendError(res, error, 'Erro ao adicionar livro')
  }
})

export default router
