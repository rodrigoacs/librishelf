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
import uploadsRoutes from './routes/uploads.js'
import metaRoutes from './routes/meta.js'
import emailRoutes from './routes/email.js'
import reviewRoutes from './routes/reviews.js'
import moderationRoutes from './routes/moderation.js'
import listRoutes from './routes/lists.js'
import errorHandler from './middlewares/errorHandler.js'
import corsOptions from './config/corsOptions.js'
import trustProxy from './config/trustProxy.js'

const app = express()

app.set('trust proxy', trustProxy)
app.disable('x-powered-by')

app.use(cors(corsOptions))
app.use(express.json())
app.use(cookieParser())

// Capas: só o dono, ou qualquer um quando a biblioteca é pública.
app.use('/uploads', uploadsRoutes)

app.use('/auth', authRoutes)
app.use('/library', libraryRoutes)
app.use('/author', authorRoutes)
app.use('/publisher', publisherRoutes)
app.use('/tags', tagsRoutes)
app.use('/dashboard', dashboardRoutes)
app.use('/isbn', isbnRoutes)
app.use('/community', communityRoutes)
app.use('/social', socialRoutes)
app.use('/meta', metaRoutes)
app.use('/email', emailRoutes)
app.use('/reviews', reviewRoutes)
app.use('/moderation', moderationRoutes)
app.use('/lists', listRoutes)
app.get('/ping', (req, res) => { res.json({ message: 'pong' }) })

app.use(errorHandler)

export default app
