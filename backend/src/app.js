import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'

import libraryRoutes from './routes/library.js'
import authRoutes from './routes/auth.js'
import authorRoutes from './routes/author.js'
import publisherRoutes from './routes/publisher.js'
import tagsRoutes from './routes/tags.js'
import dashboardRoutes from './routes/dashboard.js'
import isbnRoutes from './routes/isbn.js'
import communityRoutes from './routes/community.js'
import socialRoutes from './routes/social.js'
import errorHandler from './middlewares/errorHandler.js'
import UPLOAD_DIR from './config/uploadDir.js'
import corsOptions from './config/corsOptions.js'
import trustProxy from './config/trustProxy.js'

const UPLOADS_CACHE_CONTROL = 'public, max-age=3600, stale-while-revalidate=86400'

const app = express()

app.set('trust proxy', trustProxy)
app.disable('x-powered-by')

app.use(cors(corsOptions))
app.use(express.json())
app.use(cookieParser())

app.use('/uploads', express.static(UPLOAD_DIR, {
  etag: true,
  lastModified: true,
  setHeaders: (res) => {
    res.setHeader('Cache-Control', UPLOADS_CACHE_CONTROL)
    res.setHeader('X-Content-Type-Options', 'nosniff')
  }
}))

app.use('/auth', authRoutes)
app.use('/library', libraryRoutes)
app.use('/author', authorRoutes)
app.use('/publisher', publisherRoutes)
app.use('/tags', tagsRoutes)
app.use('/dashboard', dashboardRoutes)
app.use('/isbn', isbnRoutes)
app.use('/community', communityRoutes)
app.use('/social', socialRoutes)
app.get('/ping', (req, res) => { res.json({ message: 'pong' }) })

app.use(errorHandler)

export default app
