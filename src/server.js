import express from 'express'
import cors from 'cors'
import libraryRouter from './routes/library.js'
import authorRouter from './routes/author.js'

const app = express()
app.use(cors())

const PORT = 3000

app.use('/library', libraryRouter)
app.use('/author', authorRouter)

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
}) 
