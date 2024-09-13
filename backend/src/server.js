import express from 'express'
import cors from 'cors'
import bodyParser from 'body-parser'
import libraryRouter from './routes/library.js'
import authorRouter from './routes/author.js'
import publisherRouter from './routes/publisher.js'
import registerRouter from './routes/register.js'
import loginRouter from './routes/login.js'

const app = express()
const PORT = 3000

app.use(cors())
app.use(bodyParser.json())

app.use('/library', libraryRouter)
app.use('/author', authorRouter)
app.use('/publisher', publisherRouter)
app.use('/register', registerRouter)
app.use('/login', loginRouter)

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
}) 
