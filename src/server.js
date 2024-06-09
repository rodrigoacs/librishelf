import sqlite3 from 'sqlite3'
import express from 'express'
import cors from 'cors'

const app = express()
app.use(cors())

const PORT = 3000

const DB_PATH = '/mnt/c/Users/rodri/OneDrive/Documentos/Calibre/metadata.db'
const BASE_PATH = '/@fs/mnt/c/Users/rodri/OneDrive/Documentos/Calibre/'

const queryFields = {
  'title': `title`,
  'authors': `(SELECT GROUP_CONCAT(name, ', ') FROM books_authors_link JOIN authors ON(author = authors.id) WHERE book = books.id) AS authors`,
  'publisher': `(SELECT name FROM publishers WHERE publishers.id IN (SELECT publisher FROM books_publishers_link WHERE book = books.id)) AS publisher`,
  'tags': `(SELECT GROUP_CONCAT(name, ', ') FROM (SELECT name FROM tags WHERE tags.id IN (SELECT tag FROM books_tags_link WHERE book = books.id) ORDER BY name)) AS tags`,
  'isbn': `(SELECT val FROM identifiers WHERE book = books.id AND type = 'isbn') AS isbn`,
  'path': `path`,
  'read_date': `CASE WHEN timestamp LIKE '0101-01-01 00:00:00+00:00' THEN 'não lido' ELSE strftime('%F', timestamp) END AS read_date`,
  'pubdate': `CASE WHEN pubdate LIKE '0101-01-01 00:00:00+00:00' THEN 'NA' ELSE strftime('%F', pubdate) END AS pubdate`
}

function dbConnect() {
  return new sqlite3.Database(DB_PATH, sqlite3.OPEN_READWRITE, (err) => {
    if (err) {
      console.error(`[${new Date().toLocaleTimeString()}] Erro ao conectar ao banco de dados: ${err.message}`)
    } else {
      console.log(`[${new Date().toLocaleTimeString()}] Conectado ao banco de dados SQLite.`)
    }
  })
}

function dbClose(db) {
  db.close((err) => {
    if (err) {
      console.error(`[${new Date().toLocaleTimeString()}] Erro ao fechar o banco de dados: ${err.message}`)
    } else {
      console.log(`[${new Date().toLocaleTimeString()}] Banco de dados fechado.`)
    }
  })
}

app.get('/library', (req, res) => {
  const { fields } = req.query

  const selectedFields = fields.split(',').map(field => field.trim())
  const invalidFields = selectedFields.filter(field => !queryFields[field])
  if (invalidFields.length > 0) {
    return res.status(400).send(`Campos inválidos: ${invalidFields.join(', ')}`)
  }

  const query = `SELECT ${selectedFields.map(field => queryFields[field]).join(', ')} FROM books`

  const db = dbConnect()

  db.all(query, [], (err, rows) => {
    if (err) {
      console.error(`[${new Date().toLocaleTimeString()}] Erro ao executar a consulta: ${err.message}`)
      res.status(500).send('Erro ao executar a consulta.')
      dbClose(db)
      return
    } else {
      if (selectedFields.includes('path')) {
        rows.forEach(row => {
          row.path = `${BASE_PATH}${row.path}/cover.jpg`
        })
      }
      res.json(rows)
      dbClose(db)
    }
  })
})

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`)
})
