import express from 'express'
import fs from 'fs'
import path from 'path'
import multer from 'multer'
import * as libraryService from '../services/libraryService.js'
import catchAsync from '../utils/catchAsync.js'
import { authenticateToken } from '../middlewares/auth.js'
import STATUS from '../utils/statusCodes.js'

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1024 * 1024 * 2 }
})

const router = express.Router()

router.use(authenticateToken)

// GET: Listar todos os livros (com filtro opcional de readState)
router.get('/', catchAsync(async (req, res) => {
  const { readState } = req.query
  const userId = req.user.userId

  const books = await libraryService.getAllBooksByUser(userId, readState)
  res.status(STATUS.OK).json(books)
}))

// GET: Buscar um livro específico por ID
router.get('/:id', catchAsync(async (req, res) => {
  const { id } = req.params
  const book = await libraryService.getBookById(id)

  if (!book) {
    const error = new Error('Book not found.')
    error.status = STATUS.NOT_FOUND
    throw error
  }

  res.status(STATUS.OK).json(book)
}))

// POST: Adicionar um novo livro
router.post('/', upload.single('coverImage'), catchAsync(async (req, res) => {
  const { title, pubDate, author, publisher, tags, isbn, readDate } = req.body
  const userId = req.user.userId

  if (!title || !author || !publisher || !tags || !pubDate) {
    const error = new Error('Missing required book information.')
    error.status = STATUS.BAD_REQUEST
    throw error
  }

  const bookData = {
    title,
    pubDate,
    author,
    publisher,
    tags: tags.split(',').map(tag => tag.trim()),
    isbn: isbn || '',
    readDate: readDate || null,
    user_id: userId
  }

  const newBookId = await libraryService.addNewBook(bookData)

  if (req.file) {
    const coverImage = req.file.buffer
    const uploadDir = path.join(process.cwd(), 'uploads')
    const filePath = path.join(uploadDir, `${newBookId}.jpg`)

    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true })
    }
    fs.writeFileSync(filePath, coverImage)
  }

  res.status(STATUS.CREATED).json({ bookId: newBookId })
}))

// PUT: Atualizar detalhes do livro
router.put('/:id', catchAsync(async (req, res) => {
  const { id } = req.params
  const bookInfo = req.body
  const userId = req.user.userId

  await libraryService.updateBookDetails(id, userId, bookInfo)
  res.status(STATUS.OK).json({ message: 'Livro atualizado com sucesso.' })
}))

// POST: Atualizar apenas a capa do livro
router.post('/:id/cover', upload.single('coverImage'), catchAsync(async (req, res) => {
  const { id } = req.params
  const userId = req.user.userId

  if (!req.file) {
    const error = new Error('An image file is required.')
    error.status = STATUS.BAD_REQUEST
    throw error
  }

  await libraryService.checkBookOwnership(id, userId)

  const coverImage = req.file.buffer
  const uploadDir = path.join(process.cwd(), 'uploads')
  const filePath = path.join(uploadDir, `${id}.jpg`)

  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true })
  }

  fs.writeFileSync(filePath, coverImage)
  res.status(STATUS.OK).json({ message: 'Cover updated successfully.' })
}))

// DELETE: Remover um livro
router.delete('/:id', catchAsync(async (req, res) => {
  const { id } = req.params
  const userId = req.user.userId

  await libraryService.deleteBook(id, userId)
  res.status(STATUS.NO_CONTENT).send()
}))

// PATCH: Marcar como LIDO
router.patch('/:id/read', catchAsync(async (req, res) => {
  const { id } = req.params
  const userId = req.user.userId

  await libraryService.markBookAsRead(id, userId)
  res.status(STATUS.OK).json({ message: 'Book marked as read.' })
}))

// DELETE: Marcar como NÃO LIDO
router.delete('/:id/read', catchAsync(async (req, res) => {
  const { id } = req.params
  const userId = req.user.userId

  await libraryService.markBookAsUnread(id, userId)
  res.status(STATUS.OK).json({ message: 'Book marked as unread.' })
}))

export default router