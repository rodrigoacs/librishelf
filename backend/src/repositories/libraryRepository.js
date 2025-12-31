import { log } from "console"
import { db } from "../database/connection.js"
import { LIBRARY_QUERIES as q } from "../database/queries.js"

async function getAllBooksByUser(userId, filters = {}) {
  const {
    search,
    readState,
    readYear,
    author,
    publisher,
    tags,
    page = 1,
    limit = 20,
    sortField = 'recent',
    sortOrder = 'desc'
  } = filters

  let query = q.BASE_SELECT.replace('SELECT', 'SELECT COUNT(*) OVER() AS total_count,') + ` WHERE b.user_id = $1`

  const params = [userId]
  let paramIndex = 2

  if (readState === 'read' || readState === 'true') {
    query += ` AND (b.read_date IS NOT NULL AND b.read_date::date <> '0101-01-01')`
  } else if (readState === 'unread' || readState === 'false') {
    query += ` AND (b.read_date IS NULL OR b.read_date::date = '0101-01-01')`
  }

  if (readYear && readYear !== 'all') {
    query += ` AND EXTRACT(YEAR FROM b.read_date) = $${paramIndex}`
    params.push(readYear)
    paramIndex++
  }

  if (search) {
    query += ` AND (b.title ILIKE $${paramIndex} OR b.isbn ILIKE $${paramIndex})`
    params.push(`%${search}%`)
    paramIndex++
  }

  if (author) {
    const authorList = Array.isArray(author) ? author : author.split(',').map(a => a.trim())
    query += ` AND EXISTS (
      SELECT 1 FROM librishelf.books_authors_link bal 
      JOIN librishelf.authors a ON bal.author_id = a.id 
      WHERE bal.book_id = b.id AND a.name = ANY($${paramIndex})
    )`
    params.push(authorList)
    paramIndex++
  }

  if (publisher) {
    const publisherList = Array.isArray(publisher) ? publisher : publisher.split(',').map(p => p.trim())
    query += ` AND p.name = ANY($${paramIndex})`
    params.push(publisherList)
    paramIndex++
  }

  if (tags) {
    const tagsList = Array.isArray(tags) ? tags : tags.split(',').map(t => t.trim())
    query += ` AND EXISTS (
      SELECT 1 FROM librishelf.books_tags_link btl
      JOIN librishelf.tags t ON btl.tag_id = t.id
      WHERE btl.book_id = b.id AND t.name = ANY($${paramIndex})
    )`
    params.push(tagsList)
    paramIndex++
  }

  const sortMapping = {
    'title': 'b.title',
    'authors': 'authors',
    'pubDate': 'b.publication_date',
    'readDate': 'b.read_date',
    'recent': 'b.id'
  }

  const dbSortField = sortMapping[sortField] || 'b.id'
  const dbSortOrder = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC'

  query += ` ORDER BY ${dbSortField} ${dbSortOrder}`

  const limitVal = parseInt(limit) || 20
  const pageVal = parseInt(page) || 1
  const offset = (pageVal - 1) * limitVal

  query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`
  params.push(limitVal, offset)

  const result = await db.query(query, params)
  const total = result.rows.length > 0 ? parseInt(result.rows[0].total_count) : 0

  return {
    page: pageVal,
    limit: limitVal,
    total: total,
    size: result.rows.length,
    result: result.rows
  }
}

async function getBookById(id) {
  const result = await db.query(q.GET_BOOK_BY_ID, [id])
  return result.rows[0] || null
}

async function findBookByIsbn(isbn, userId) {
  const result = await db.query(q.FIND_BY_ISBN, [isbn, userId])
  return result.rows[0] || null
}

async function createBook(bookInfo) {
  const tagsArray = Array.isArray(bookInfo.tags) ? bookInfo.tags : (bookInfo.tags ? bookInfo.tags.split(',') : [])

  const params = [
    bookInfo.title,
    bookInfo.pubDate,
    bookInfo.author,
    bookInfo.publisher,
    tagsArray,
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
  const tagsArray = Array.isArray(bookInfo.tags) ? bookInfo.tags : []

  const params = [
    bookId,
    bookInfo.title,
    pubDate,
    bookInfo.authors,
    bookInfo.publisher,
    tagsArray,
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
