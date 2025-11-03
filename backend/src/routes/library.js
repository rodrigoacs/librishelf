import * as libraryService from '../services/libraryService.js'
import { authenticateToken } from '../middlewares/auth.js'
import express from 'express'
import multer from 'multer'
import fs from 'fs'
import path from 'path'

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1024 * 1024 * 2 }
})

const router = express.Router()
router.use(authenticateToken)

// Get all books for a user, with optional read state filtering
router.get('/', async (req, res) => {
  try {
    const { readState } = req.query
    const userId = req.user.userId

    const books = await libraryService.getAllBooksByUser(userId, readState)

    res.status(200).json(books)
  } catch (err) {

    res.status(500).json({ code: 'error', message: 'Error retrieving books.' })
  }
})

// Get a specific book by its ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params
    const book = await libraryService.getBookById(id)

    if (!book) {
      return res.status(404).json({ error: 'Book not found.' })
    }

    res.status(200).json(book)
  } catch (err) {
    res.status(500).json({ error: 'Error retrieving the book.' })
  }
})

// Add a new book to the user's library
router.post('/', upload.single('coverImage'), async (req, res) => {
  try {
    const { title, pubDate, author, publisher, tags, isbn, readDate } = req.body
    const userId = req.user.userId

    if (!title || !author || !publisher || !tags || !pubDate) {
      return res.status(400).json({ error: 'Missing required book information.' })
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

    res.status(201).json({ bookId: newBookId })

  } catch (err) {
    if (err.message === 'ISBN already exists for this user.') {
      return res.status(409).json({ error: err.message })
    }

    console.error(err)
    res.status(500).json({ error: 'Error saving the book.' })
  }
})

// Update book details
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params
    const bookInfo = req.body
    const userId = req.user.userId

    await libraryService.updateBookDetails(id, userId, bookInfo)

    res.status(200).json({ message: 'Livro atualizado com sucesso.' })

  } catch (err) {
    if (err.message === 'Book not found.') {
      return res.status(404).json({ error: err.message })
    }

    if (err.message === 'Permission denied.') {
      return res.status(403).json({ error: err.message })
    }

    console.error(err)
    res.status(500).json({ error: 'Error updating the book.' })
  }
})

// Upload or update book cover image
router.post('/:id/cover', upload.single('coverImage'), async (req, res) => {
  try {
    const { id } = req.params
    const userId = req.user.userId

    if (!req.file) {
      return res.status(400).json({ error: 'An image file is required.' })
    }

    await libraryService.checkBookOwnership(id, userId)

    const coverImage = req.file.buffer
    const uploadDir = path.join(process.cwd(), 'uploads')
    const filePath = path.join(uploadDir, `${id}.jpg`)
    console.log(uploadDir, filePath)

    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true })
    }

    fs.writeFileSync(filePath, coverImage)

    res.status(200).json({ message: 'Cover updated successfully.' })

  } catch (err) {
    if (err.message === 'Book not found.') {
      return res.status(404).json({ error: err.message })
    }
    if (err.message === 'Permission denied.') {
      return res.status(403).json({ error: err.message })
    }

    console.error(err)
    res.status(500).json({ error: 'Error updating the cover.' })
  }
})

// Delete a book
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params
    const userId = req.user.userId

    await libraryService.deleteBook(id, userId)

    res.status(204).send()

  } catch (err) {
    if (err.message === 'Book not found.') {
      return res.status(404).json({ error: err.message })
    }
    if (err.message === 'Permission denied.') {
      return res.status(403).json({ error: err.message })
    }
    console.error(err)
    res.status(500).json({ error: 'Error deleting the book.' })
  }
})

// Mark a book as READ
router.patch('/:id/read', async (req, res) => {
  try {
    const { id } = req.params
    const userId = req.user.userId

    await libraryService.markBookAsRead(id, userId)
    res.status(200).json({ message: 'Book marked as read.' })
  } catch (err) {
    res.status(500).json({ error: 'Error processing request.' })
  }
})

// Mark a book as UNREAD
router.delete('/:id/read', async (req, res) => {
  try {
    const { id } = req.params
    const userId = req.user.userId

    await libraryService.markBookAsUnread(id, userId)
    res.status(200).json({ message: 'Book marked as unread.' })
  } catch (err) {
    res.status(500).json({ error: 'Error processing request.' })
  }
})
export default router