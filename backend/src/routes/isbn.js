import express from 'express'
import { authenticateToken } from '../middlewares/auth.js'
import { isbnLimiter } from '../middlewares/rateLimiter.js'
import * as openLibrary from '../services/openLibraryService.js'
import STATUS from '../utils/statusCodes.js'
import { errorBody } from '../utils/httpError.js'
import sendError from '../utils/sendError.js'

const router = express.Router()

router.use(authenticateToken, isbnLimiter)

// Capa (proxy): o navegador não fala direto com o Open Library.
router.get('/cover/:coverId', async (req, res) => {
  try {
    const image = await openLibrary.fetchCover(req.params.coverId)
    if (!image) return res.status(STATUS.NOT_FOUND).json(errorBody('Capa não encontrada.', 'COVER_NOT_FOUND'))

    res.set('Cache-Control', 'private, max-age=3600')
    res.type('image/jpeg').send(image)
  } catch (error) {
    sendError(res, error, 'Erro ao buscar capa no Open Library')
  }
})

router.get('/:isbn', async (req, res) => {
  try {
    const book = await openLibrary.lookupIsbn(req.params.isbn)
    if (!book) return res.status(STATUS.NOT_FOUND).json(errorBody('Nenhum livro encontrado para este ISBN.', 'ISBN_NOT_FOUND'))

    res.status(STATUS.OK).json(book)
  } catch (error) {
    sendError(res, error, 'Erro na busca por ISBN')
  }
})

export default router
