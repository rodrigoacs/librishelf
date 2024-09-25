import express from 'express'
import fs from 'fs'
import path from 'path'
import multer from 'multer'
import { prepareLibraryQuery, executeLibraryQuery, addNewBookQuery } from '../database/queries.js'
import { error } from '../utils/logger.js'
import { fileURLToPath } from 'url'
import { authenticateToken } from '../middlewares/auth.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1024 * 1024 * 2 } // Limit file size to 2MB
})

const router = express.Router()
// router.use(authenticateToken)  // Applies authentication to all routes in this file

router.get('/', (req, res) => {
  const { fields, readState } = req.query
  let query

  try {
    query = prepareLibraryQuery(null, fields)
    if (readState === 'true') {
      query += " WHERE timestamp != '0101-01-01 00:00:00.000' AND timestamp IS NOT NULL"
    } else if (readState === 'false') {
      query += " WHERE timestamp = '0101-01-01 00:00:00.000' OR timestamp IS NULL"
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
    const { title, pubdate, author, publisher, tags, isbn } = req.body

    if (!title || !author || !publisher || !tags || !pubdate || !isbn) {
      return res.status(400).json({ error: 'Missing required book information.' })
    }

    const parsedTags = tags.split(',').map(tag => tag.trim())

    const bookInfo = {
      title,
      pubdate,
      author,
      publisher,
      tags: parsedTags,
      isbn
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

export default router
