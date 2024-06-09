import express from 'express'
import cors from 'cors'
import libraryRouter from './routes/library.js'

const app = express()
app.use(cors())

const PORT = 3000

app.use('/', libraryRouter)

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
}) 
