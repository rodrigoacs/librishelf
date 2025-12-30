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

const UPLOAD_DIR = path.join(__dirname, '../../../uploads')

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true })
  console.log(`[System] Pasta de uploads criada em: ${UPLOAD_DIR}`)
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1024 * 1024 * 10 }
})

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

router.post('/', upload.single('coverImage'), async (req, res) => {
  try {
    const { title, pubDate, author, publisher, tags, isbn, readDate } = req.body
    const userId = req.user.id

    if (!title) return res.status(STATUS.BAD_REQUEST).json({ error: 'Title is required.' })

    const bookData = {
      title,
      pubDate,
      author,
      publisher,
      tags: tags ? tags.split(',').map(tag => tag.trim()) : [],
      isbn: isbn || '',
      readDate: readDate || null,
      user_id: userId
    }

    const newBookId = await libraryService.addNewBook(bookData)

    if (req.file) {
      const filePath = path.join(UPLOAD_DIR, `${newBookId}.jpg`)
      fs.writeFileSync(filePath, req.file.buffer)
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

router.post('/:id/cover', upload.single('coverImage'), async (req, res) => {
  try {
    const { id } = req.params
    const userId = req.user.id

    if (!req.file) {
      return res.status(STATUS.BAD_REQUEST).json({ error: 'Nenhuma imagem enviada.' })
    }

    await libraryService.checkBookOwnership(id, userId)

    const filePath = path.join(UPLOAD_DIR, `${id}.jpg`)
    fs.writeFileSync(filePath, req.file.buffer)

    console.log(`[Upload] Capa salva em: ${filePath}`)

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

    const filePath = path.join(UPLOAD_DIR, `${id}.jpg`)
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
    }

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
