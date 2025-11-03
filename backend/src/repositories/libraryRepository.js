import { db } from "../database/connection.js"

async function getAllBooksByUser(userId, readState) {
  let query = `
  SELECT
    b.id AS book_id,
    b.title,
    u.name AS user_owner,
    p.name AS publisher_name,
    (SELECT STRING_AGG(a.name, ', ')
     FROM librishelf.books_authors_link AS bal
     JOIN librishelf.authors AS a ON bal.author_id = a.id
     WHERE bal.book_id = b.id
    ) AS authors,
    (SELECT STRING_AGG(t.name, ', ')
     FROM librishelf.books_tags_link AS btl
     JOIN librishelf.tags AS t ON btl.tag_id = t.id
     WHERE btl.book_id = b.id
    ) AS tags,
    b.isbn,
    b.read_date,
    b.publication_date
  FROM
    librishelf.books AS b
    LEFT JOIN librishelf.users AS u ON b.user_id = u.id
    LEFT JOIN librishelf.publishers AS p ON b.publisher_id = p.id
  WHERE 
    b.user_id = $1
  `

  if (readState === 'true') {
    query += " AND b.read_date IS NOT NULL"
  } else if (readState === 'false') {
    query += " AND b.read_date IS NULL"
  }

  const result = await db.query(query, [userId])

  const rows = result.rows || []
  return { size: rows.length, result: rows }
}

async function getBookById(id) {
  const result = await db.query(`SELECT
    b.id AS book_id,
    b.title,
    u.name AS user_owner,
    p.name AS publisher_name,
    (SELECT STRING_AGG(a.name, ', ')
     FROM librishelf.books_authors_link AS bal
     JOIN librishelf.authors AS a ON bal.author_id = a.id
     WHERE bal.book_id = b.id
    ) AS authors,
    (SELECT STRING_AGG(t.name, ', ')
     FROM librishelf.books_tags_link AS btl
     JOIN librishelf.tags AS t ON btl.tag_id = t.id
     WHERE btl.book_id = b.id
    ) AS tags,
    b.isbn,
    b.read_date,
    b.publication_date
  FROM
    librishelf.books AS b
	  LEFT JOIN librishelf.users AS u ON b.user_id = u.id
	  LEFT JOIN librishelf.publishers AS p ON b.publisher_id = p.id
  WHERE 
    b.id = $1`, [id])

  return result.rows[0] || []
}

async function findBookByIsbn(isbn, userId) {
  const result = await db.query(`SELECT * FROM librishelf.books WHERE isbn = $1 AND user_id = $2`, [isbn, userId])
  return result.rows[0] || null
}

async function createBook(bookInfo) {
  const query = `
    SELECT librishelf.add_book(
      $1, $2, $3, $4, $5, $6, $7, $8
    ) AS book_id;`

  const params = [
    bookInfo.title,
    bookInfo.pubDate,
    bookInfo.author,
    bookInfo.publisher,
    bookInfo.tags,
    bookInfo.readDate,
    bookInfo.isbn,
    bookInfo.user_id
  ]

  try {
    const result = await db.query(query, params)
    return result.rows[0].book_id

  } catch (err) {
    console.error("[libraryRepository] error creating book:", err.message)
  }
}

async function getBookOwner(bookId) {
  const query = 'SELECT user_id FROM librishelf.books WHERE id = $1'
  const result = await db.query(query, [bookId])
  return result.rows[0] || null
}

async function updateBook(bookId, bookInfo) {
  const pubDate = bookInfo.pubdate ? new Date(bookInfo.pubdate).toISOString().split('T')[0] : null
  const readDate = bookInfo.read_date ? new Date(bookInfo.read_date).toISOString().split('T')[0] : null

  const queryText = `
    SELECT librishelf.update_book($1, $2, $3, $4, $5, $6, $7, $8)
  `

  const params = [
    bookId,
    bookInfo.title,
    pubDate,
    bookInfo.authors,
    bookInfo.publisher,
    bookInfo.tags,
    readDate,
    bookInfo.isbn
  ]

  await db.query(queryText, params)

  return true
}

async function deleteBookById(bookId) {
  const queryText = 'DELETE FROM librishelf.books WHERE id = $1'
  await db.query(queryText, [bookId])
  return true
}

async function updateReadDate(bookId, readDate) {
  const queryText = 'UPDATE librishelf.books SET read_date = $1 WHERE id = $2'
  await db.query(queryText, [readDate, bookId])
  return true
}

export { getAllBooksByUser, getBookById, findBookByIsbn, createBook, getBookOwner, updateBook, deleteBookById, updateReadDate }
