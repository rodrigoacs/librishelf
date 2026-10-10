import * as libraryRepository from '../repositories/libraryRepository.js'
import * as authRepository from '../repositories/authRepository.js'
import STATUS from '../utils/statusCodes.js'
import { deleteBookCover } from '../utils/imageProcessor.js'

const READ_YEAR_PATTERN = /^\d{4}$/

function httpError(message, status) {
  const error = new Error(message)
  error.status = status
  return error
}

function normalizeIsbn(isbn) {
  if (typeof isbn !== 'string') return isbn ?? null
  const trimmed = isbn.trim()
  return trimmed ? trimmed : null
}

/**
 * Converte a data recebida para 'YYYY-MM-DD' (ou null quando vazia).
 * Data inválida vira 400 em vez de estourar como 500 no `toISOString()` ou no Postgres.
 */
function normalizeDate(value, fieldName) {
  if (value === undefined || value === null || value === '') return null

  const parsed = new Date(value)

  if (Number.isNaN(parsed.getTime())) {
    throw httpError(`Data inválida em '${fieldName}'.`, STATUS.BAD_REQUEST)
  }

  return parsed.toISOString().split('T')[0]
}

function normalizeReadYear(readYear) {
  if (readYear === undefined || readYear === null || readYear === '' || readYear === 'all') return 'all'

  if (!READ_YEAR_PATTERN.test(String(readYear))) {
    throw httpError("Parâmetro 'readYear' inválido: use um ano com 4 dígitos.", STATUS.BAD_REQUEST)
  }

  return String(readYear)
}

async function getPublicLibraryByUsername(username, query) {
  const user = await authRepository.getUserByName(username)

  // Biblioteca privada responde igual a usuário inexistente: não confirma que a conta existe.
  if (!user || !user.is_public) {
    throw httpError('Biblioteca não encontrada.', STATUS.NOT_FOUND)
  }

  const booksData = await getAllBooksByUser(user.id, query)

  return {
    owner: user.name,
    ...booksData
  }
}

/**
 * Livro da biblioteca pública: só é encontrado se pertencer ao usuário da URL.
 * Antes qualquer id era aceito, o que permitia percorrer os livros de todos os
 * usuários incrementando o id.
 */
async function getPublicBook(username, bookId) {
  const user = await authRepository.getUserByName(username)
  if (!user || !user.is_public) return null

  return await libraryRepository.getBookByIdForUser(bookId, user.id)
}

async function getAllBooksByUser(userId, query) {
  const filters = {
    search: query.search || undefined,
    readState: query.readState || 'all',
    readYear: normalizeReadYear(query.readYear),
    author: query.author || undefined,
    publisher: query.publisher || undefined,
    tags: query.tags || undefined,
    page: query.page || 1,
    limit: query.limit || 20,
    sortField: query.sort || 'recent',
    sortOrder: typeof query.order === 'string' ? query.order : 'desc'
  }

  return await libraryRepository.getAllBooksByUser(userId, filters)
}

async function getRandomPublicBookIds(limit) {
  return await libraryRepository.getRandomPublicBookIds(limit)
}

function requireText(value, fieldName) {
  if (typeof value !== 'string' || !value.trim()) {
    throw httpError(`${fieldName} is required.`, STATUS.BAD_REQUEST)
  }
  return value.trim()
}

async function getBookById(id, userId) {
  return await libraryRepository.getBookByIdForUser(id, userId)
}

async function addNewBook(bookData) {
  bookData.isbn = normalizeIsbn(bookData.isbn)
  bookData.pubDate = normalizeDate(bookData.pubDate, 'pubDate')
  bookData.readDate = normalizeDate(bookData.readDate, 'readDate')

  if (bookData.isbn) {
    const existingBook = await libraryRepository.findBookByIsbn(bookData.isbn, bookData.user_id)

    if (existingBook) {
      throw httpError('ISBN already exists for this user.', STATUS.CONFLICT)
    }
  }

  const newBookId = await libraryRepository.createBook(bookData)

  return newBookId
}

async function updateBookDetails(bookId, userId, bookData) {
  await checkBookOwnership(bookId, userId)

  // Mesmo contrato do POST: título e autores são obrigatórios na edição também.
  bookData.title = requireText(bookData.title, 'Title')
  bookData.authors = requireText(bookData.authors, 'Authors')

  if (typeof bookData.tags === 'string') {
    bookData.tags = bookData.tags.split(',').map(tag => tag.trim()).filter(Boolean)
  }

  if ('isbn' in bookData) {
    bookData.isbn = normalizeIsbn(bookData.isbn)
  }

  bookData.pubDate = normalizeDate(bookData.pubDate, 'pubDate')
  bookData.readDate = normalizeDate(bookData.readDate, 'readDate')

  return await libraryRepository.updateBook(bookId, bookData)
}

async function checkBookOwnership(bookId, userId) {
  const bookOwner = await libraryRepository.getBookOwner(bookId)

  if (!bookOwner) {
    throw httpError('Book not found.', STATUS.NOT_FOUND)
  }

  if (bookOwner.user_id !== userId) {
    throw httpError('Permission denied.', STATUS.FORBIDDEN)
  }

  return true
}

async function deleteBook(bookId, userId) {
  await checkBookOwnership(bookId, userId)

  await libraryRepository.deleteBookById(bookId)

  await deleteBookCover(bookId)
}

async function markBookAsRead(bookId, userId) {
  await checkBookOwnership(bookId, userId)
  const readDate = new Date()
  return await libraryRepository.updateReadDate(bookId, readDate)
}

async function markBookAsUnread(bookId, userId) {
  await checkBookOwnership(bookId, userId)
  return await libraryRepository.updateReadDate(bookId, null)
}

export {
  getAllBooksByUser,
  getBookById,
  getPublicBook,
  getRandomPublicBookIds,
  addNewBook,
  updateBookDetails,
  checkBookOwnership,
  deleteBook,
  markBookAsRead,
  markBookAsUnread,
  getPublicLibraryByUsername,
  normalizeDate,
  normalizeReadYear
}
