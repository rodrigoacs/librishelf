import express from 'express'
import fs from 'fs/promises'
import path from 'path'
import multer from 'multer'
import * as libraryService from '../services/libraryService.js'
import { authenticateToken } from '../middlewares/auth.js'
import { validateNumericId } from '../middlewares/validateId.js'
import STATUS from '../utils/statusCodes.js'
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

function handleUpload(uploadMiddleware) {
  return (req, res, next) => {
    uploadMiddleware(req, res, (err) => {
      if (err) {
        const message = err.code === 'LIMIT_FILE_SIZE'
          ? `A imagem pode ter no máximo ${MAX_UPLOAD_MB} MB.`
          : err.message
        return res.status(STATUS.BAD_REQUEST).json({ error: message })
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

router.get('/public/u/:username/book/:id', publicLimiter, validateNumericId(), async (req, res) => {
  try {
    const { username, id } = req.params
    const book = await libraryService.getPublicBook(username, id)

    if (!book) return res.status(STATUS.NOT_FOUND).json({ error: 'Livro não encontrado.' })

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

router.get('/:id', validateNumericId(), async (req, res) => {
  try {
    const { id } = req.params
    // Escopado ao usuário logado: livro de outra pessoa responde 404, igual a inexistente.
    const book = await libraryService.getBookById(id, req.user.id)
    if (!book) return res.status(STATUS.NOT_FOUND).json({ error: 'Book not found.' })
    res.status(STATUS.OK).json(book)
  } catch (error) {
    sendError(res, error, 'Erro ao buscar livro')
  }
})

router.post('/', uploadLimiter, handleUpload(upload.single('coverImage')), async (req, res) => {
  try {
    const { title, pubDate, authors, publisher, tags, isbn, readDate } = req.body ?? {}
    const userId = req.user.id

    if (typeof title !== 'string' || !title.trim()) return res.status(STATUS.BAD_REQUEST).json({ error: 'Title is required.' })
    if (typeof authors !== 'string' || !authors.trim()) return res.status(STATUS.BAD_REQUEST).json({ error: 'Authors is required.' })

    const bookData = {
      title,
      pubDate,
      authors,
      publisher,
      tags: typeof tags === 'string' ? tags.split(',').map(tag => tag.trim()).filter(Boolean) : [],
      isbn,
      readDate: readDate || null,
      user_id: userId
    }

    // Valida a imagem ANTES de criar o livro: com imagem inválida a resposta é
    // 400 e nada fica gravado (antes o livro ficava órfão e o usuário duplicava
    // ao tentar de novo).
    if (req.file && !(await isValidImage(req.file.buffer))) {
      return res.status(STATUS.BAD_REQUEST).json({ error: 'Arquivo enviado não é uma imagem válida.' })
    }

    const newBookId = await libraryService.addNewBook(bookData)

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
      return res.status(STATUS.BAD_REQUEST).json({ error: 'Nenhuma imagem enviada.' })
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

router.patch('/:id/read', validateNumericId(), async (req, res) => {
  try {
    const userId = req.user.id
    await libraryService.markBookAsRead(req.params.id, userId)
    res.status(STATUS.OK).json({ message: 'Book marked as read.' })
  } catch (error) {
    sendError(res, error, 'Erro ao marcar livro como lido')
  }
})

router.delete('/:id/read', validateNumericId(), async (req, res) => {
  try {
    const userId = req.user.id
    await libraryService.markBookAsUnread(req.params.id, userId)
    res.status(STATUS.OK).json({ message: 'Book marked as unread.' })
  } catch (error) {
    sendError(res, error, 'Erro ao marcar livro como não lido')
  }
})

export default router