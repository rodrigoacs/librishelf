import express from 'express'
import { authenticateToken } from '../middlewares/auth.js'
import { isbnLimiter, bookSearchLimiter, coverProxyLimiter } from '../middlewares/rateLimiter.js'
import * as openLibrary from '../services/openLibraryService.js'
import STATUS from '../utils/statusCodes.js'
import { errorBody } from '../utils/httpError.js'
import sendError from '../utils/sendError.js'
import { track } from '../utils/metrics.js'

const router = express.Router()

router.use(authenticateToken)

// Capa (proxy): o navegador não fala direto com o Open Library.
// ?size=M → miniatura (lista da busca por título); padrão L.
router.get('/cover/:coverId', coverProxyLimiter, async (req, res) => {
  try {
    const size = req.query.size === 'M' ? 'M' : 'L'
    const image = await openLibrary.fetchCover(req.params.coverId, size)
    if (!image) return res.status(STATUS.NOT_FOUND).json(errorBody('Capa não encontrada.', 'COVER_NOT_FOUND'))

    res.set('Cache-Control', 'private, max-age=86400')
    res.type('image/jpeg').send(image)
  } catch (error) {
    sendError(res, error, 'Erro ao buscar capa no Open Library')
  }
})

// Busca por título/autor: GET /isbn/search?q=dom+casmurro&lang=pt
router.get('/search', bookSearchLimiter, track('search.title'), async (req, res) => {
  try {
    const result = await openLibrary.searchBooks(req.query.q, req.query.lang)
    res.set('Cache-Control', 'private, max-age=3600')
    res.status(STATUS.OK).json(result)
  } catch (error) {
    sendError(res, error, 'Erro na busca por título')
  }
})

// ?via=scan quando o ISBN veio da câmera (só para contar o uso do leitor)
router.get('/:isbn', isbnLimiter, track(req => (req.query.via === 'scan' ? 'isbn.scan' : 'isbn.typed')), async (req, res) => {
  try {
    const book = await openLibrary.lookupIsbn(req.params.isbn)
    if (!book) return res.status(STATUS.NOT_FOUND).json(errorBody('Nenhum livro encontrado para este ISBN.', 'ISBN_NOT_FOUND'))

    res.status(STATUS.OK).json(book)
  } catch (error) {
    sendError(res, error, 'Erro na busca por ISBN')
  }
})

export default router
