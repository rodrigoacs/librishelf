import { db } from "../database/connection.js"
import { LIBRARY_QUERIES as q } from "../database/queries.js"

async function getAllBooksByUser(userId, readState) {
  let queryText = `${q.BASE_SELECT} WHERE b.user_id = $1`

  if (readState === 'true') {
    queryText += " AND b.read_date IS NOT NULL"
  } else if (readState === 'false') {
    queryText += " AND b.read_date IS NULL"
  }

  const result = await db.query(queryText, [userId])
  const rows = result.rows || []

  return { size: rows.length, result: rows }
}

async function getBookById(id) {
  const result = await db.query(`${q.BASE_SELECT} WHERE b.id = $1`, [id])
  return result.rows[0] || null
}

async function findBookByIsbn(isbn, userId) {
  const result = await db.query(q.FIND_BY_ISBN, [isbn, userId])
  return result.rows[0] || null
}

async function createBook(bookInfo) {
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

  const result = await db.query(q.ADD_BOOK_FUNC, params)
  return result.rows[0].book_id
}

async function getBookOwner(bookId) {
  const result = await db.query(q.GET_OWNER, [bookId])
  return result.rows[0] || null
}

async function updateBook(bookId, bookInfo) {
  const pubDate = bookInfo.pubdate ? new Date(bookInfo.pubdate).toISOString().split('T')[0] : null
  const readDate = bookInfo.read_date ? new Date(bookInfo.read_date).toISOString().split('T')[0] : null

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

  await db.query(q.UPDATE_BOOK_FUNC, params)
  return true
}

async function deleteBookById(bookId) {
  await db.query(q.DELETE_BOOK, [bookId])
  return true
}

async function updateReadDate(bookId, readDate) {
  await db.query(q.UPDATE_READ_DATE, [readDate, bookId])
  return true
}

export {
  getAllBooksByUser,
  getBookById,
  findBookByIsbn,
  createBook,
  getBookOwner,
  updateBook,
  deleteBookById,
  updateReadDate
}