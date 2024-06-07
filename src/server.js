import sqlite3 from 'sqlite3'
import express from 'express'
import cors from 'cors'

const app = express()
const PORT = 3000

app.use(cors())

const PATH = '/mnt/c/Users/rodri/OneDrive/Documentos/Calibre/metadata.db'

const QUERY = `
SELECT 
  title, 
  (SELECT authors.name FROM books_authors_link AS bal JOIN authors ON(bal.author = authors.id) WHERE bal.book = books.id) AS authors, 
  path
FROM 
  books
`

function dbConnect() {
  return new sqlite3.Database(PATH, sqlite3.OPEN_READWRITE, (err) => {
    if (err) {
      console.error(err.message)
      return null
    } else {
      console.log(`[${new Date().toLocaleTimeString()}] Conectado ao banco de dados SQLite. `)
    }
  })
}

function dbClose(db) {
  db.close((err) => {
    if (err) {
      console.error(err.message)
    } else {
      console.log(`[${new Date().toLocaleTimeString()}] Fechado o banco de dados.`)
    }
  })
}

app.get('/library', (req, res) => {
  let db = dbConnect()

  db.all(QUERY, [], (err, rows) => {
    if (err) {
      console.error(err.message)
      return res.status(500).send('Erro ao executar a consulta.')
    } else {
      rows.forEach(row => {
        const basePath = '/@fs/mnt/c/Users/rodri/OneDrive/Documentos/Calibre/'
        row.path = `${basePath}${row.path}/cover.jpg`
      })
      res.json(rows)
    }
  })

  dbClose(db)
})

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`)
})
