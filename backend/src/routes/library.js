import express from 'express'
import fs from 'fs'
import multer from 'multer'
import * as libraryService from '../services/libraryService.js'
import { authenticateToken } from '../middlewares/auth.js'
import STATUS from '../utils/statusCodes.js'
import UPLOAD_DIR from '../config/uploadDir.js'
import { saveBookCover } from '../utils/imageProcessor.js'

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1024 * 1024 * 10 },
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
        return res.status(STATUS.BAD_REQUEST).json({ error: err.message })
      }
      next()
    })
  }
}

const router = express.Router()

router.get('/covers/random', (req, res) => {
  try {
    if (!fs.existsSync(UPLOAD_DIR)) {
      return res.json([])
    }

    const files = fs.readdirSync(UPLOAD_DIR)

    const imageFiles = files.filter(file =>
      /\.(avif)$/i.test(file) && !file.startsWith('.')
    )

    for (let i = imageFiles.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [imageFiles[i], imageFiles[j]] = [imageFiles[j], imageFiles[i]]
    }

    const selectedCovers = imageFiles.slice(0, 50)

    res.json(selectedCovers)
  } catch (error) {
    console.error('Erro ao buscar capas aleatórias:', error)
    res.json([])
  }
})

router.get('/public/u/:username', async (req, res) => {
  try {
    const { username } = req.params
    const libraryData = await libraryService.getPublicLibraryByUsername(username, req.query)
    res.status(STATUS.OK).json(libraryData)
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message })
  }
})

router.get('/public/book/:id', async (req, res) => {
  try {
    const { id } = req.params
    const book = await libraryService.getBookById(id)

    if (!book) return res.status(STATUS.NOT_FOUND).json({ error: 'Livro não encontrado.' })

    res.status(STATUS.OK).json(book)
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message })
  }
})

router.use(authenticateToken)

router.get('/', async (req, res) => {
  try {
    const userId = req.user.id
    const booksData = await libraryService.getAllBooksByUser(userId, req.query)
    res.status(STATUS.OK).json(booksData)
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message })
  }
})

router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params
    const book = await libraryService.getBookById(id)
    if (!book) return res.status(STATUS.NOT_FOUND).json({ error: 'Book not found.' })
    res.status(STATUS.OK).json(book)
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message })
  }
})

router.post('/', handleUpload(upload.single('coverImage')), async (req, res) => {
  try {
    const { title, pubDate, authors, publisher, tags, isbn, readDate } = req.body
    const userId = req.user.id

    if (!title) return res.status(STATUS.BAD_REQUEST).json({ error: 'Title is required.' })

    const cleanIsbn = isbn && isbn.trim() ? isbn.trim() : null

    const bookData = {
      title,
      pubDate,
      authors,
      publisher,
      tags: tags ? tags.split(',').map(tag => tag.trim()) : [],
      isbn: cleanIsbn,
      readDate: readDate || null,
      user_id: userId
    }

    const newBookId = await libraryService.addNewBook(bookData)

    if (req.file) {
      await saveBookCover(req.file.buffer, newBookId)
    }

    res.status(STATUS.CREATED).json({ bookId: newBookId })
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message })
  }
})

router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params
    const bookInfo = req.body
    const userId = req.user.id

    await libraryService.updateBookDetails(id, userId, bookInfo)
    res.status(STATUS.OK).json({ message: 'Livro atualizado com sucesso.' })
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message })
  }
})

router.post('/:id/cover', handleUpload(upload.single('coverImage')), async (req, res) => {
  try {
    const { id } = req.params
    const userId = req.user.id

    if (!req.file) {
      return res.status(STATUS.BAD_REQUEST).json({ error: 'Nenhuma imagem enviada.' })
    }

    await libraryService.checkBookOwnership(id, userId)

    await saveBookCover(req.file.buffer, id)

    console.log(`[Upload] Capa processada (jpg + avif) para o livro ${id}`)

    res.status(STATUS.OK).json({ message: 'Capa atualizada com sucesso.' })
  } catch (error) {
    console.error('Erro no upload de capa:', error)
    res.status(error.status || 500).json({ error: error.message })
  }
})

router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params
    const userId = req.user.id

    await libraryService.deleteBook(id, userId)

    res.status(STATUS.NO_CONTENT).send()
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message })
  }
})

router.patch('/:id/read', async (req, res) => {
  try {
    const userId = req.user.id
    await libraryService.markBookAsRead(req.params.id, userId)
    res.status(STATUS.OK).json({ message: 'Book marked as read.' })
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message })
  }
})

router.delete('/:id/read', async (req, res) => {
  try {
    const userId = req.user.id
    await libraryService.markBookAsUnread(req.params.id, userId)
    res.status(STATUS.OK).json({ message: 'Book marked as unread.' })
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message })
  }
})

export default router