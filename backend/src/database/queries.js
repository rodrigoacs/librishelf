// import { dbConnect } from './connection.js'
import { error } from '../utils/logger.js'

const DEFAULT_FIELDS = 'id,title,authors,publisher,tags,isbn,path,read_date,pubdate'

const queryFields = {
  'id': `id`,
  'title': `title`,
  'authors': `(SELECT STRING_AGG(name, ', ') FROM books_authors_link JOIN authors ON(author = authors.id) WHERE book = books.id) AS authors`,
  'publisher': `(SELECT name FROM publishers WHERE publishers.id IN (SELECT publisher FROM books_publishers_link WHERE book = books.id)) AS publisher`,
  'tags': `(SELECT STRING_AGG(name, ', ') FROM (SELECT name FROM tags WHERE tags.id IN (SELECT tag FROM books_tags_link WHERE book = books.id) ORDER BY name)) AS tags`,
  'isbn': `isbn`,
  'path': `'/uploads/' || id || '.jpg' AS path`,
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
    return `SELECT DISTINCT ${selectedFields.map(field => queryFields[field]).join(', ')} FROM books WHERE id = ${id}`
  }
  return `SELECT DISTINCT ${selectedFields.map(field => queryFields[field]).join(', ')} FROM books `
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
        callback(null, rows)
      }
    })
  })
}

export function executeAuthorQuery(callback) {
  const query = 'SELECT DISTINCT name FROM authors ORDER BY name'
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
    return 'SELECT DISTINCT name FROM publishers ORDER BY name'
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

export function executeAuthorByPublisherQuery(publishers, callback) {
  const publishersList = publishers.split(',').map(publisher => `'${publisher}'`).join(',')

  const query = `
    SELECT DISTINCT authors.name 
    FROM authors
    JOIN books_authors_link ON authors.id = books_authors_link.author
    JOIN books_publishers_link ON books_authors_link.book = books_publishers_link.book
    JOIN publishers ON books_publishers_link.publisher = publishers.id
    WHERE publishers.name IN (${publishersList})
    ORDER BY authors.name
  `

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

export function addNewBookQuery(bookInfo) {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT add_book(
        '${bookInfo.title}',
        '${bookInfo.pubDate}',
        '${bookInfo.author}',
        '${bookInfo.publisher}',
        '{${bookInfo.tags.join(',')}}',
        '${bookInfo.readDate}',
        '${bookInfo.isbn}',
        ${bookInfo.user_id}
      ) AS book_id;
    `

    dbConnect((err, client, release) => {
      if (err) {
        return reject(err)
      }

      client.query(query, (err, result) => {
        release()
        if (err) {
          return reject(err)
        }

        const newBookId = result.rows[0].book_id
        resolve(newBookId)
      })
    })
  })
}

export function addUserQuery({ username, password }) {
  return new Promise((resolve, reject) => {
    const query = `
      INSERT INTO users (name, password_hash)
      VALUES ('${username}', '${password}')
    `

    dbConnect((err, client, release) => {
      if (err) {
        return reject(err)
      }

      client.query(query, (err) => {
        release()
        if (err) {
          return reject(err)
        }

        resolve()
      })
    })
  })
}

export function getUserByUsernameQuery(username) {
  return new Promise((resolve, reject) => {
    const query = `SELECT * FROM users WHERE name = '${username}'`

    dbConnect((err, client, release) => {
      if (err) {
        return reject(err)
      }

      client.query(query, (err, result) => {
        release()
        if (err) {
          return reject(err)
        }

        const user = result.rows[0]
        resolve(user)
      })
    })
  })
}

export async function updateBookDetailsQuery(bookId, bookInfo) {
  let { title, authors, publisher, tags, isbn, pubdate, read_date } = bookInfo

  if (typeof tags === 'string') {
    tags = tags.split(',').map(tag => tag.trim())
  }

  const query = `
    SELECT update_book(
      ${bookId},
      '${title}',
      '${pubdate}',
      '${authors}',
      '${publisher}',
      '{${tags.join(',')}}',
      '${read_date}',
      '${isbn}'
    );
  `
  
  console.log(query)

  return new Promise((resolve, reject) => {
    dbConnect((err, client, release) => {
      if (err) {
        return reject(err)
      }

      client.query(query, (err, result) => {
        release()
        if (err) {
          return reject(err)
        }

        resolve(result)
      })
    })
  })
}


