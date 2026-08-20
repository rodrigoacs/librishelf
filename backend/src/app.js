import express from 'express'
import cors from 'cors'

import libraryRoutes from './routes/library.js'
import authRoutes from './routes/auth.js'
import authorRoutes from './routes/author.js'
import publisherRoutes from './routes/publisher.js'
import tagsRoutes from './routes/tags.js'
import dashboardRoutes from './routes/dashboard.js'
import errorHandler from './middlewares/errorHandler.js'
import UPLOAD_DIR from './config/uploadDir.js'

const app = express()

app.use(cors())
app.use(express.json())

app.use('/uploads', express.static(UPLOAD_DIR))

app.use('/auth', authRoutes)
app.use('/library', libraryRoutes)
app.use('/author', authorRoutes)
app.use('/publisher', publisherRoutes)
app.use('/tags', tagsRoutes)
app.use('/dashboard', dashboardRoutes)
app.get('/ping', (req, res) => { res.json({ message: 'pong' }) })

app.use(errorHandler)

export default app