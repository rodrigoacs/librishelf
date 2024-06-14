import { dbConnect } from './connection.js'

const BASE_PATH = '/@fs/mnt/c/Users/rodri/OneDrive/Documentos/Calibre/'
const DEFAULT_FIELDS = 'title,authors,publisher,tags,isbn,path,read_date,pubdate'

const queryFields = {
  'title': `title`,
  'authors': `(SELECT STRING_AGG(name, ', ') FROM books_authors_link JOIN authors ON(author = authors.id) WHERE book = books.id) AS authors`,
  'publisher': `(SELECT name FROM publishers WHERE publishers.id IN (SELECT publisher FROM books_publishers_link WHERE book = books.id)) AS publisher`,
  'tags': `(SELECT STRING_AGG(name, ', ') FROM (SELECT name FROM tags WHERE tags.id IN (SELECT tag FROM books_tags_link WHERE book = books.id) ORDER BY name)) AS tags`,
  'isbn': `(SELECT val FROM identifiers WHERE book = books.id AND type = 'isbn') AS isbn`,
  'path': `path`,
  'read_date': `CASE WHEN timestamp = '0101-01-01 00:00:00+00:00' THEN 'não lido' ELSE to_char(timestamp, 'YYYY-MM-DD') END AS read_date`,
  'pubdate': `CASE WHEN pubdate = '0101-01-01 00:00:00+00:00' THEN 'NA' ELSE to_char(pubdate, 'YYYY-MM-DD') END AS pubdate`
}

// Prepara a consulta SQL com base nos campos selecionados
export function prepareLibraryQuery(fields = DEFAULT_FIELDS) {
  const selectedFields = fields.split(',').map(field => field.trim())
  const invalidFields = selectedFields.filter(field => !queryFields[field])
  if (invalidFields.length > 0) {
    throw new Error(`Invalid fields: ${invalidFields.join(', ')}`)
  }
  return `SELECT ${selectedFields.map(field => queryFields[field]).join(', ')} FROM books`
}

// Executa uma consulta ao banco de dados
export function executeLibraryQuery(query, callback) {
  dbConnect((err, client, release) => {
    if (err) {
      return callback(err, null)
    }
    client.query(query, (err, result) => {
      release()
      if (err) {
        console.error(`[${new Date().toLocaleTimeString()}] Error executing query: ${err.message}`)
        callback(err, null)
      } else {
        const rows = result.rows
        if (query.includes('path')) {
          rows.forEach(row => {
            row.path = `${BASE_PATH}${row.path}/cover.jpg`
          })
        }
        callback(null, rows)
      }
    })
  })
}

// Função específica para consultas de autores
export function executeAuthorQuery(callback) {
  const query = 'SELECT DISTINCT name FROM authors'
  dbConnect((err, client, release) => {
    if (err) {
      return callback(err, null)
    }
    client.query(query, (err, result) => {
      release()
      if (err) {
        console.error(`[${new Date().toLocaleTimeString()}] Error executing query: ${err.message}`)
        callback(err, null)
      } else {
        callback(null, result.rows)
      }
    })
  })
}
