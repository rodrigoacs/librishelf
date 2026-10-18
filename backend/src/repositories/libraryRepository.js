import { db } from "../database/connection.js"
import { LIBRARY_QUERIES as q } from "../database/queries.js"
import { resolvePagination } from "../utils/pagination.js"
import STATUS from "../utils/statusCodes.js"
import { parseNameList } from "../utils/nameList.js"

const UNIQUE_VIOLATION = '23505'
const ISBN_CONSTRAINT = 'idx_books_isbn_user'

// Só a violação do índice de ISBN vira 409 "ISBN já existe". Antes qualquer
// 23505 (ex.: tag repetida no mesmo livro) aparecia como conflito de ISBN.
function toIsbnConflictError(err) {
  if (err.code === UNIQUE_VIOLATION && err.constraint === ISBN_CONSTRAINT) {
    const conflictError = new Error('ISBN already exists for this user.')
    conflictError.status = STATUS.CONFLICT
    return conflictError
  }

  return err
}

async function getAllBooksByUser(userId, filters = {}) {
  const {
    search,
    readState,
    readYear,
    readMonth,
    author,
    publisher,
    tags,
    isbnStatus,
    page = 1,
    limit = 20,
    sortField = 'recent',
    sortOrder = 'desc'
  } = filters

  let query = q.BASE_SELECT.replace('SELECT', 'SELECT COUNT(*) OVER() AS total_count,') + ` WHERE b.user_id = $1`

  const params = [userId]
  let paramIndex = 2

  if (readState === 'read' || readState === 'true') {
    query += ` AND b.read_date IS NOT NULL`
  } else if (readState === 'unread' || readState === 'false') {
    query += ` AND b.read_date IS NULL`
  } else if (readState === 'reading' || readState === 'want') {
    query += ` AND b.reading_status = $${paramIndex}`
    params.push(readState)
    paramIndex++
  }

  if (readYear && readYear !== 'all') {
    query += ` AND EXTRACT(YEAR FROM b.read_date) = $${paramIndex}`
    params.push(readYear)
    paramIndex++

    // Mês só vale junto com o ano (gráfico mensal do painel → biblioteca).
    if (readMonth) {
      query += ` AND EXTRACT(MONTH FROM b.read_date) = $${paramIndex}`
      params.push(readMonth)
      paramIndex++
    }
  }

  // Busca por título, ISBN ou nome de qualquer autor do livro. % e _ digitados
  // valem como texto, não como curinga do ILIKE.
  if (search) {
    query += ` AND (
      b.title ILIKE $${paramIndex}
      OR b.isbn ILIKE $${paramIndex}
      OR EXISTS (
        SELECT 1 FROM librishelf.books_authors_link bal_s
        JOIN librishelf.authors a_s ON bal_s.author_id = a_s.id
        WHERE bal_s.book_id = b.id AND a_s.name ILIKE $${paramIndex}
      )
    )`
    params.push(`%${String(search).replace(/[\\%_]/g, '\\$&')}%`)
    paramIndex++
  }

  if (parseNameList(author).length > 0) {
    const authorList = parseNameList(author)
    query += ` AND EXISTS (
      SELECT 1 FROM librishelf.books_authors_link bal 
      JOIN librishelf.authors a ON bal.author_id = a.id 
      WHERE bal.book_id = b.id AND a.name = ANY($${paramIndex})
    )`
    params.push(authorList)
    paramIndex++
  }

  if (parseNameList(publisher).length > 0) {
    const publisherList = parseNameList(publisher)
    query += ` AND p.name = ANY($${paramIndex})`
    params.push(publisherList)
    paramIndex++
  }

  if (parseNameList(tags).length > 0) {
    const tagsList = parseNameList(tags)
    query += ` AND EXISTS (
      SELECT 1 FROM librishelf.books_tags_link btl
      JOIN librishelf.tags t ON btl.tag_id = t.id
      WHERE btl.book_id = b.id AND t.name = ANY($${paramIndex})
    )`
    params.push(tagsList)
    paramIndex++
  }

  // Livros com ISBN preenchido que não passa na validação (para o usuário corrigir).
  if (isbnStatus === 'invalid') {
    query += ` AND b.isbn IS NOT NULL AND btrim(b.isbn) <> '' AND b.isbn13 IS NULL`
  }

  const sortMapping = {
    'title': 'b.title',
    'authors': 'authors',
    'pubDate': 'b.publication_date',
    'readDate': 'b.read_date',
    'rating': 'b.rating',
    'recent': 'b.id'
  }

  const dbSortField = sortMapping[sortField] || 'b.id'
  const dbSortOrder = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC'

  // Sem nota/data vai para o fim nas duas direções; b.id desempata (paginação estável).
  query += ` ORDER BY ${dbSortField} ${dbSortOrder} NULLS LAST, b.id ${dbSortOrder}`

  const { page: pageVal, limit: limitVal, offset } = resolvePagination(page, limit)

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

// Sempre escopado ao dono: não existe mais busca de livro só por id.
async function getBookByIdForUser(id, userId) {
  const result = await db.query(q.GET_BOOK_BY_ID_FOR_USER, [id, userId])
  return result.rows[0] || null
}

async function getRandomPublicBookIds(limit) {
  const result = await db.query(q.RANDOM_PUBLIC_BOOK_IDS, [limit])
  return result.rows.map(row => row.id)
}

async function findBookByIsbn(isbn, userId) {
  const result = await db.query(q.FIND_BY_ISBN, [isbn, userId])
  return result.rows[0] || null
}

async function createBook(bookInfo) {
  const params = [
    bookInfo.title,
    bookInfo.pubDate,
    bookInfo.authors,
    bookInfo.publisher,
    bookInfo.tags,
    bookInfo.readDate,
    bookInfo.isbn,
    bookInfo.user_id,
    bookInfo.rating ?? null,
    bookInfo.olWorkKey ?? null,
    bookInfo.olEditionKey ?? null
  ]

  try {
    const result = await db.query(q.ADD_BOOK_FUNC, params)
    return result.rows[0].book_id
  } catch (err) {
    throw toIsbnConflictError(err)
  }
}

async function getCoverAccess(bookId) {
  const result = await db.query(q.COVER_ACCESS, [bookId])
  return result.rows[0] || null
}

async function getBookOwner(bookId) {
  const result = await db.query(q.GET_OWNER, [bookId])
  return result.rows[0] || null
}

async function updateBook(bookId, bookInfo) {
  const pubDate = bookInfo.pubDate ?? null
  const readDate = bookInfo.readDate ?? null
  const params = [
    bookId,
    bookInfo.title,
    pubDate,
    bookInfo.authors,
    bookInfo.publisher,
    bookInfo.tags,
    readDate,
    bookInfo.isbn,
    bookInfo.rating ?? null,
    bookInfo.olWorkKey ?? null,
    bookInfo.olEditionKey ?? null
  ]

  try {
    await db.query(q.UPDATE_BOOK_FUNC, params)
    return true
  } catch (err) {
    throw toIsbnConflictError(err)
  }
}

async function deleteBookById(bookId) {
  await db.query(q.DELETE_BOOK, [bookId])
  return true
}

async function updateRating(bookId, rating) {
  const result = await db.query(q.UPDATE_RATING, [rating, bookId])
  return result.rows[0]?.rating ?? null
}

async function setReadingStatus(bookId, { status, startedAt, clearRead }) {
  const result = await db.query(q.SET_READING_STATUS, [status, startedAt, clearRead, bookId])
  return result.rows[0] ?? null
}

async function clearWantIfRead(bookId) {
  await db.query(q.CLEAR_WANT_IF_READ, [bookId])
}

async function pruneUserNames(userId) {
  await db.query(q.PRUNE_USER_NAMES, [userId])
}

async function updateReadDate(bookId, readDate) {
  await db.query(q.UPDATE_READ_DATE, [readDate, bookId])
  return true
}

export {
  getAllBooksByUser,
  getBookByIdForUser,
  getRandomPublicBookIds,
  findBookByIsbn,
  createBook,
  getBookOwner,
  getCoverAccess,
  updateBook,
  deleteBookById,
  updateReadDate,
  updateRating,
  setReadingStatus,
  clearWantIfRead,
  pruneUserNames
}