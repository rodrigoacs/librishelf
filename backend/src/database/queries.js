import { dbConnect } from './connection.js'
import { error, info } from '../utils/logger.js'

const BASE_PATH = '/@fs/mnt/c/Users/rodri/OneDrive/Documentos/Calibre/'
const DEFAULT_FIELDS = 'id,title,authors,publisher,tags,isbn,path,read_date,pubdate'

const queryFields = {
  'id': `id`,
  'title': `title`,
  'authors': `(SELECT STRING_AGG(name, ', ') FROM books_authors_link JOIN authors ON(author = authors.id) WHERE book = books.id) AS authors`,
  'publisher': `(SELECT name FROM publishers WHERE publishers.id IN (SELECT publisher FROM books_publishers_link WHERE book = books.id)) AS publisher`,
  'tags': `(SELECT STRING_AGG(name, ', ') FROM (SELECT name FROM tags WHERE tags.id IN (SELECT tag FROM books_tags_link WHERE book = books.id) ORDER BY name)) AS tags`,
  'isbn': `(SELECT val FROM identifiers WHERE book = books.id AND type = 'isbn') AS isbn`,
  'path': `path`,
  'read_date': `CASE WHEN timestamp = '0101-01-01 00:00:00+00:00' THEN '' ELSE to_char(timestamp, 'YYYY-MM-DD') END AS read_date`,
  'pubdate': `CASE WHEN pubdate = '0101-01-01 00:00:00+00:00' THEN '' ELSE to_char(pubdate, 'YYYY-MM-DD') END AS pubdate`
}

export function prepareLibraryQuery(id = null, fields = DEFAULT_FIELDS) {
  const selectedFields = fields.split(',').map(field => field.trim())
  const invalidFields = selectedFields.filter(field => !queryFields[field])
  if (invalidFields.length > 0) {
    throw new Error(`Invalid fields: ${invalidFields.join(', ')}`)
  }
  if (id) {
    return `SELECT ${selectedFields.map(field => queryFields[field]).join(', ')} FROM books WHERE id = ${id}`
  }
  return `SELECT ${selectedFields.map(field => queryFields[field]).join(', ')} FROM books `
}

export function executeLibraryQuery(query, callback) {
  dbConnect((err, client, release) => {
    if (err) {
      error(`Error connecting to the database: ${err.message}`)
      return callback(err, null)
    }
    client.query(query, (err, result) => {
      release()
      if (err) {
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

export function executeAuthorQuery(callback) {
  const query = 'SELECT name FROM authors ORDER BY name'
  dbConnect((err, client, release) => {
    if (err) {
      error(`Error connecting to the database: ${err.message}`)
      return callback(err, null)
    }
    client.query(query, (err, result) => {
      release()
      if (err) {
        callback(err, null)
      } else {
        callback(null, result.rows)
      }
    })
  })
}

export function preparePublisherQuery(authors) {
  if (!authors) {
    return 'SELECT name FROM publishers ORDER BY name'
  }
  const authorsList = authors.split(',').map(author => `'${author}'`).join(',')
  return `SELECT DISTINCT name FROM publishers WHERE id IN (
    SELECT publisher FROM books_publishers_link WHERE book IN (
      SELECT book FROM books_authors_link WHERE author IN (
        SELECT id FROM authors WHERE name IN (${authorsList})
      )
    )
  ) ORDER BY name`
}

export function executePublisherQuery(query, callback) {
  dbConnect((err, client, release) => {
    if (err) {
      error(`Error connecting to the database: ${err.message}`)
      return callback(err, null)
    }
    client.query(query, (err, result) => {
      release()
      if (err) {
        callback(err, null)
      } else {
        callback(null, result.rows)
      }
    })
  })
}
