import express from 'express'
import fs from 'fs/promises'
import path from 'path'
import multer from 'multer'
import * as libraryService from '../services/libraryService.js'
import * as dataService from '../services/dataService.js'
import { authenticateToken, optionalAuth } from '../middlewares/auth.js'
import * as communityService from '../services/communityService.js'
import { fetchCover } from '../services/openLibraryService.js'
import { validateNumericId } from '../middlewares/validateId.js'
import STATUS from '../utils/statusCodes.js'
import { errorBody } from '../utils/httpError.js'
import UPLOAD_DIR from '../config/uploadDir.js'
import { saveBookCover, isValidImage } from '../utils/imageProcessor.js'
import { uploadLimiter, publicLimiter } from '../middlewares/rateLimiter.js'
import sendError from '../utils/sendError.js'
import logger from '../utils/logger.js'

const MAX_UPLOAD_MB = 10

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1024 * 1024 * MAX_UPLOAD_MB, files: 1 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Apenas arquivos de imagem são permitidos.'))
    }
    cb(null, true)
  }
})

const MAX_CSV_MB = 5

// Importação: um CSV (Goodreads ou Librishelf), em memória.
const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1024 * 1024 * MAX_CSV_MB, files: 1 },
  fileFilter: (req, file, cb) => {
    const isCsv = /\.csv$/i.test(file.originalname) || /csv|excel|text\/plain/.test(file.mimetype)
    if (!isCsv) return cb(new Error('Envie um arquivo .csv.'))
    cb(null, true)
  }
})

function handleUpload(uploadMiddleware) {
  return (req, res, next) => {
    uploadMiddleware(req, res, (err) => {
      if (err) {
        const isImport = req.path.endsWith('/import')
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(STATUS.BAD_REQUEST).json(isImport
            ? errorBody(`O arquivo pode ter no máximo ${MAX_CSV_MB} MB.`, 'FILE_TOO_LARGE', { max: MAX_CSV_MB })
            : errorBody(`A imagem pode ter no máximo ${MAX_UPLOAD_MB} MB.`, 'IMAGE_TOO_LARGE', { max: MAX_UPLOAD_MB }))
        }
        return res.status(STATUS.BAD_REQUEST).json(errorBody(err.message, isImport ? 'CSV_REQUIRED' : 'IMAGE_ONLY'))
      }
      next()
    })
  }
}

const RANDOM_COVERS_LIMIT = 50
// Nem todo livro tem capa; busca mais candidatos do que exibe.
const RANDOM_COVERS_CANDIDATES = 150

const router = express.Router()

// Mosaico das telas de login/cadastro: só capas de bibliotecas públicas.
router.get('/covers/random', publicLimiter, async (req, res) => {
  try {
    const bookIds = await libraryService.getRandomPublicBookIds(RANDOM_COVERS_CANDIDATES)

    const existing = await Promise.all(bookIds.map(async (id) => {
      const file = `${id}.avif`
      try {
        await fs.access(path.join(UPLOAD_DIR, file))
        return file
      } catch {
        return null
      }
    }))

    res.json(existing.filter(Boolean).slice(0, RANDOM_COVERS_LIMIT))
  } catch (error) {
    logger.error('Erro ao buscar capas aleatórias', { message: error.message })
    res.json([])
  }
})

router.get('/public/u/:username', publicLimiter, async (req, res) => {
  try {
    const { username } = req.params
    const libraryData = await libraryService.getPublicLibraryByUsername(username, req.query)
    res.status(STATUS.OK).json(libraryData)
  } catch (error) {
    sendError(res, error, 'Erro ao buscar biblioteca pública')
  }
})

// Estatísticas do perfil público; quem está logado vê também "em comum" e seguir.
router.get('/public/u/:username/profile', publicLimiter, optionalAuth, async (req, res) => {
  try {
    res.status(STATUS.OK).json(await communityService.publicProfile(req.params.username, req.user?.id))
  } catch (error) {
    sendError(res, error, 'Erro ao buscar perfil público')
  }
})

router.get('/public/u/:username/book/:id', publicLimiter, validateNumericId(), async (req, res) => {
  try {
    const { username, id } = req.params
    const book = await libraryService.getPublicBook(username, id)

    if (!book) return res.status(STATUS.NOT_FOUND).json(errorBody('Livro não encontrado.', 'BOOK_NOT_FOUND'))

    res.status(STATUS.OK).json(book)
  } catch (error) {
    sendError(res, error, 'Erro ao buscar livro público')
  }
})

router.use(authenticateToken)

router.get('/', async (req, res) => {
  try {
    const userId = req.user.id
    const booksData = await libraryService.getAllBooksByUser(userId, req.query)
    res.status(STATUS.OK).json(booksData)
  } catch (error) {
    sendError(res, error, 'Erro ao listar biblioteca')
  }
})

// Séries do usuário (filtro e autocompletar). Antes de '/:id'.
router.get('/series', async (req, res) => {
  try {
    res.status(STATUS.OK).json(await libraryService.getSeries(req.user.id))
  } catch (error) {
    sendError(res, error, 'Erro ao listar séries')
  }
})

// Importar livros de um CSV (campo "file"): Goodreads ou o CSV exportado do Librishelf.
router.post('/import', uploadLimiter, handleUpload(csvUpload.single('file')), async (req, res) => {
  try {
    const summary = await dataService.importCsv(req.user.id, req.file?.buffer)
    res.status(STATUS.OK).json(summary)
  } catch (error) {
    sendError(res, error, 'Erro ao importar')
  }
})

// Ações em lote: { ids: [1, 2], action: 'status' | 'addTag' | 'removeTag' | 'delete', ... }
router.post('/batch', async (req, res) => {
  try {
    res.status(STATUS.OK).json(await libraryService.batchUpdate(req.user.id, req.body ?? {}))
  } catch (error) {
    sendError(res, error, 'Erro na ação em lote')
  }
})

router.get('/:id', validateNumericId(), async (req, res) => {
  try {
    const { id } = req.params
    // Escopado ao usuário logado: livro de outra pessoa responde 404, igual a inexistente.
    const book = await libraryService.getBookById(id, req.user.id)
    if (!book) return res.status(STATUS.NOT_FOUND).json(errorBody('Livro não encontrado.', 'BOOK_NOT_FOUND'))
    res.status(STATUS.OK).json(book)
  } catch (error) {
    sendError(res, error, 'Erro ao buscar livro')
  }
})

router.post('/', uploadLimiter, handleUpload(upload.single('coverImage')), async (req, res) => {
  try {
    // Autores chegam como campo repetido (authors=A&authors=B) ou um só valor.
    const bookData = {
      ...libraryService.normalizeBookInput(req.body ?? {}),
      user_id: req.user.id
    }

    // Valida a imagem ANTES de criar o livro: com imagem inválida a resposta é
    // 400 e nada fica gravado (antes o livro ficava órfão e o usuário duplicava
    // ao tentar de novo).
    if (req.file && !(await isValidImage(req.file.buffer))) {
      return res.status(STATUS.BAD_REQUEST).json(errorBody('Arquivo enviado não é uma imagem válida.', 'IMAGE_INVALID'))
    }

    const newBookId = await libraryService.addNewBook(bookData)

    // Sem arquivo, mas com capa escolhida na busca por ISBN: o servidor baixa
    // do Open Library. Se falhar, o livro fica salvo sem capa.
    const olCoverId = Number(req.body?.olCoverId)
    if (!req.file && Number.isInteger(olCoverId) && olCoverId > 0) {
      try {
        const image = await fetchCover(olCoverId)
        if (image) {
          await saveBookCover(image, newBookId)
          return res.status(STATUS.CREATED).json({ bookId: newBookId, coverSaved: true })
        }
      } catch (coverError) {
        logger.warn('Capa do Open Library não foi salva', { bookId: newBookId, olCoverId, message: coverError.message })
      }
      return res.status(STATUS.CREATED).json({ bookId: newBookId, coverSaved: false })
    }

    if (req.file) {
      try {
        await saveBookCover(req.file.buffer, newBookId)
      } catch (coverError) {
        // Imagem válida mas falhou ao gravar (disco, permissão): o livro fica
        // salvo sem capa e o cliente é avisado.
        logger.error('Livro criado, mas a capa não foi salva', { bookId: newBookId, message: coverError.message })
        return res.status(STATUS.CREATED).json({ bookId: newBookId, coverSaved: false })
      }
    }

    res.status(STATUS.CREATED).json({ bookId: newBookId, coverSaved: Boolean(req.file) })
  } catch (error) {
    sendError(res, error, 'Erro ao criar livro')
  }
})

router.put('/:id', validateNumericId(), async (req, res) => {
  try {
    const { id } = req.params
    const bookInfo = req.body ?? {}
    const userId = req.user.id

    await libraryService.updateBookDetails(id, userId, bookInfo)

    // Devolve o livro atualizado para o frontend trocar o item na lista sem
    // recarregar tudo.
    const book = await libraryService.getBookById(id, userId)
    res.status(STATUS.OK).json({ message: 'Livro atualizado com sucesso.', book })
  } catch (error) {
    sendError(res, error, 'Erro ao atualizar livro')
  }
})

router.post('/:id/cover', validateNumericId(), uploadLimiter, handleUpload(upload.single('coverImage')), async (req, res) => {
  try {
    const { id } = req.params
    const userId = req.user.id

    if (!req.file) {
      return res.status(STATUS.BAD_REQUEST).json(errorBody('Nenhuma imagem enviada.', 'IMAGE_REQUIRED'))
    }

    await libraryService.checkBookOwnership(id, userId)

    await saveBookCover(req.file.buffer, id)

    logger.info('Capa processada (jpg + avif)', { bookId: id, userId })

    res.status(STATUS.OK).json({ message: 'Capa atualizada com sucesso.' })
  } catch (error) {
    sendError(res, error, 'Erro no upload de capa')
  }
})

router.delete('/:id', validateNumericId(), async (req, res) => {
  try {
    const { id } = req.params
    const userId = req.user.id

    await libraryService.deleteBook(id, userId)

    res.status(STATUS.NO_CONTENT).send()
  } catch (error) {
    sendError(res, error, 'Erro ao deletar livro')
  }
})

// Nota rápida direto no detalhe do livro, sem entrar em modo de edição.
router.patch('/:id/rating', validateNumericId(), async (req, res) => {
  try {
    const rating = await libraryService.setRating(req.params.id, req.user.id, req.body?.rating)
    res.status(STATUS.OK).json({ rating })
  } catch (error) {
    sendError(res, error, 'Erro ao salvar nota')
  }
})

router.patch('/:id/read', validateNumericId(), async (req, res) => {
  try {
    const userId = req.user.id
    await libraryService.markBookAsRead(req.params.id, userId, req.body?.readDate)
    res.status(STATUS.OK).json({ message: 'Livro marcado como lido.' })
  } catch (error) {
    sendError(res, error, 'Erro ao marcar livro como lido')
  }
})

router.delete('/:id/read', validateNumericId(), async (req, res) => {
  try {
    const userId = req.user.id
    await libraryService.markBookAsUnread(req.params.id, userId)
    res.status(STATUS.OK).json({ message: 'Livro marcado como não lido.' })
  } catch (error) {
    sendError(res, error, 'Erro ao marcar livro como não lido')
  }
})

// Status de leitura: { status: 'none' | 'want' | 'reading' | 'read', date?: 'YYYY-MM-DD' }
router.patch('/:id/status', validateNumericId(), async (req, res) => {
  try {
    const result = await libraryService.setReadingStatus(req.params.id, req.user.id, req.body?.status, req.body?.date)
    res.status(STATUS.OK).json(result)
  } catch (error) {
    sendError(res, error, 'Erro ao mudar o status de leitura')
  }
})

export default router