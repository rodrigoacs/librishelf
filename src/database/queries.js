import { dbConnect, dbClose } from './connection.js'

const BASE_PATH = '/@fs/mnt/c/Users/rodri/OneDrive/Documentos/Calibre/'
const DEFAULT_FIELDS = 'title,authors,publisher,tags,isbn,path,read_date,pubdate'

const queryFields = {
  'title': `title`,
  'authors': `(SELECT GROUP_CONCAT(name, ', ') FROM books_authors_link JOIN authors ON(author = authors.id) WHERE book = books.id) AS authors`,
  'publisher': `(SELECT name FROM publishers WHERE publishers.id IN (SELECT publisher FROM books_publishers_link WHERE book = books.id)) AS publisher`,
  'tags': `(SELECT GROUP_CONCAT(name, ', ') FROM (SELECT name FROM tags WHERE tags.id IN (SELECT tag FROM books_tags_link WHERE book = books.id) ORDER BY name)) AS tags`,
  'isbn': `(SELECT val FROM identifiers WHERE book = books.id AND type = 'isbn') AS isbn`,
  'path': `path`,
  'read_date': `CASE WHEN timestamp LIKE '0101-01-01 00:00:00+00:00' THEN 'unread' ELSE strftime('%F', timestamp) END AS read_date`,
  'pubdate': `CASE WHEN pubdate LIKE '0101-01-01 00:00:00+00:00' THEN 'NA' ELSE strftime('%F', pubdate) END AS pubdate`
}

export function prepareQuery(fields = DEFAULT_FIELDS) {
  const selectedFields = fields.split(',').map(field => field.trim())
  const invalidFields = selectedFields.filter(field => !queryFields[field])
  if (invalidFields.length > 0) {
    throw new Error(`Invalid fields: ${invalidFields.join(', ')}`)
  }
  return `SELECT ${selectedFields.map(field => queryFields[field]).join(', ')} FROM books`
}

export function executeQuery(query, callback) {
  const db = dbConnect()
  db.all(query, [], (err, rows) => {
    if (err) {
      console.error(`[${new Date().toLocaleTimeString()}] Error executing query: ${err.message}`)
      callback(err, null)
    } else {
      if (query.includes('path')) {
        rows.forEach(row => {
          row.path = `${BASE_PATH}${row.path}/cover.jpg`
        })
      }
      callback(null, rows)
    }
    dbClose(db)
  })
}
