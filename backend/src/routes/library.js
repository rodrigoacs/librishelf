import express from 'express'
import fs from 'fs'
import path from 'path'
import multer from 'multer'
import { fileURLToPath } from 'url'
import * as libraryService from '../services/libraryService.js'
import { authenticateToken } from '../middlewares/auth.js'
import STATUS from '../utils/statusCodes.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1024 * 1024 * 2 }
})

const router = express.Router()

router.use(authenticateToken)

router.get('/', async (req, res) => {
  const userId = req.user.id
  const booksData = await libraryService.getAllBooksByUser(userId, req.query)

  res.status(STATUS.OK).json(booksData)
})

router.get('/:id', async (req, res) => {
  const { id } = req.params
  const book = await libraryService.getBookById(id)

  if (!book) {
    const error = new Error('Book not found.')
    error.status = STATUS.NOT_FOUND
    throw error
  }

  res.status(STATUS.OK).json(book)
})

router.post('/', upload.single('coverImage'), async (req, res) => {
  const { title, pubDate, author, publisher, tags, isbn, readDate } = req.body
  const userId = req.user.id

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
    const uploadDir = path.join(__dirname, '../../uploads')
    const filePath = path.join(uploadDir, `${newBookId}.jpg`)

    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true })
    }
    fs.writeFileSync(filePath, coverImage)
  }

  res.status(STATUS.CREATED).json({ bookId: newBookId })
})

router.put('/:id', async (req, res) => {
  const { id } = req.params
  const bookInfo = req.body
  const userId = req.user.id

  await libraryService.updateBookDetails(id, userId, bookInfo)
  res.status(STATUS.OK).json({ message: 'Livro atualizado com sucesso.' })
})

router.post('/:id/cover', upload.single('coverImage'), async (req, res) => {
  const { id } = req.params
  const userId = req.user.id

  if (!req.file) {
    const error = new Error('An image file is required.')
    error.status = STATUS.BAD_REQUEST
    throw error
  }

  await libraryService.checkBookOwnership(id, userId)

  const coverImage = req.file.buffer
  const uploadDir = path.join(__dirname, '../../uploads')
  const filePath = path.join(uploadDir, `${id}.jpg`)

  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true })
  }

  fs.writeFileSync(filePath, coverImage)
  res.status(STATUS.OK).json({ message: 'Cover updated successfully.' })
})

router.delete('/:id', async (req, res) => {
  const { id } = req.params
  const userId = req.user.id

  await libraryService.deleteBook(id, userId)
  res.status(STATUS.NO_CONTENT).send()
})

router.patch('/:id/read', async (req, res) => {
  const { id } = req.params
  const userId = req.user.id

  await libraryService.markBookAsRead(id, userId)
  res.status(STATUS.OK).json({ message: 'Book marked as read.' })
})

router.delete('/:id/read', async (req, res) => {
  const { id } = req.params
  const userId = req.user.id

  await libraryService.markBookAsUnread(id, userId)
  res.status(STATUS.OK).json({ message: 'Book marked as unread.' })
})

export default router
