import express from 'express'
import fs, { read } from 'fs'
import path from 'path'
import multer from 'multer'
import { prepareLibraryQuery, executeLibraryQuery, addNewBookQuery, updateBookDetailsQuery } from '../database/queries.js'
import { error } from '../utils/logger.js'
import { fileURLToPath } from 'url'
import { authenticateToken } from '../middlewares/auth.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1024 * 1024 * 2 }
})

const router = express.Router()
router.use(authenticateToken)

router.get('/', (req, res) => {
  const { fields, readState } = req.query
  const userId = req.user.userId
  let query

  try {
    query = prepareLibraryQuery(null, fields)
    query += ` WHERE user_id = ${userId}`

    if (readState === 'true') {
      query += " AND timestamp != '0101-01-01 00:00:00.000' AND timestamp IS NOT NULL"
    } else if (readState === 'false') {
      query += " AND (timestamp = '0101-01-01 00:00:00.000' OR timestamp IS NULL)"
    }
  } catch (err) {
    error('Error preparing GET /library query: ' + err.message)
    return res.status(400).json({ error: err.message })
  }

  executeLibraryQuery(query, (err, rows) => {
    if (err) {
      error('Error executing GET /library query: ' + err.message)
      return res.status(500).json({ error: 'Error executing the query.' })
    } else {
      res.json(rows)
    }
  })
})

router.get('/:id', (req, res) => {
  const { id } = req.params

  const query = prepareLibraryQuery(id)

  executeLibraryQuery(query, (err, rows) => {
    if (err) {
      error('Error executing GET /library/:id query: ' + err.message)
      return res.status(500).json({ error: 'Error executing the query.' })
    } else {
      res.json(rows[0])
    }
  })
})

router.post('/', upload.single('coverImage'), async (req, res) => {
  try {
    const { title, pubDate, author, publisher, tags, isbn, readDate } = req.body
    const userId = req.user.userId

    if (!title || !author || !publisher || !tags || !pubDate || !isbn) {
      return res.status(400).json({ error: 'Missing required book information.' })
    }

    const parsedTags = tags.split(',').map(tag => tag.trim())

    const bookInfo = {
      title,
      pubDate,
      author,
      publisher,
      tags: parsedTags,
      isbn,
      readDate: readDate || '0101-01-01 00:00:00.000',
      user_id: userId
    }

    const newBookId = await addNewBookQuery(bookInfo)

    if (req.file) {
      const coverImage = req.file.buffer
      const uploadDir = path.resolve(__dirname, '../../../frontend/src/assets/covers/')
      const filePath = path.join(uploadDir, `${newBookId}.jpg`)

      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true })
      }

      fs.writeFileSync(filePath, coverImage)
    }

    res.status(201).json({ bookId: newBookId })
  } catch (err) {
    error('Error saving the book: ' + err.message)
    res.status(500).json({ error: 'An error occurred while saving the book.' })
  }
})

router.put('/:id', async (req, res) => {
  try {
    const bookId = req.params.id
    const bookInfo = req.body

    await updateBookDetailsQuery(bookId, bookInfo)
    res.status(200).json({ message: 'Book updated successfully.' })
  } catch (error) {
    console.error('Error updating book:', error)
    res.status(500).json({ error: 'Failed to update book details.' })
  }
})



export default router
