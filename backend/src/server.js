import express from 'express'
import cors from 'cors'
import libraryRouter from './routes/library.js'
import authorRouter from './routes/author.js'
import authRouter from './routes/auth.js'
import errorHandler from './middlewares/errorHandler.js'

const app = express()
const PORT = 3050

app.use(cors())
app.use(express.json())

app.use('/auth', authRouter)
app.use('/library', libraryRouter)
app.use('/author', authorRouter)

app.get('/ping', (req, res) => {
  res.json({ message: 'pong' })
})

app.use(errorHandler)

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
}) 
