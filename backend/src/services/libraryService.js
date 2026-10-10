import * as libraryRepository from '../repositories/libraryRepository.js'
import * as authRepository from '../repositories/authRepository.js'
import STATUS from '../utils/statusCodes.js'
import { deleteBookCover } from '../utils/imageProcessor.js'
import { parseNameList, parseTagList, validateNameList } from '../utils/nameList.js'

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

/**
 * Valida e normaliza o livro vindo do cliente (POST multipart ou PUT JSON).
 *
 * authors: lista (JSON array, campo repetido no multipart) ou um nome só.
 *          Nunca é separado por vírgula: "Fulano, Beltrano" como texto é UM nome.
 * tags:    lista ou texto "a, b, c".
 */
function normalizeBookInput(raw = {}) {
  const authors = parseNameList(raw.authors)
  if (authors.length === 0) throw httpError('Authors is required.', STATUS.BAD_REQUEST)

  const tags = parseTagList(raw.tags)

  const listError = validateNameList(authors, 'autores') || validateNameList(tags, 'tags')
  if (listError) throw httpError(listError, STATUS.BAD_REQUEST)

  const publisher = typeof raw.publisher === 'string' ? raw.publisher.trim() : ''

  return {
    title: requireText(raw.title, 'Title'),
    authors,
    tags,
    publisher: publisher || null,
    isbn: normalizeIsbn(raw.isbn),
    pubDate: normalizeDate(raw.pubDate, 'pubDate'),
    readDate: normalizeDate(raw.readDate, 'readDate')
  }
}

async function getBookById(id, userId) {
  return await libraryRepository.getBookByIdForUser(id, userId)
}

async function addNewBook(bookData) {
  if (bookData.isbn) {
    const existingBook = await libraryRepository.findBookByIsbn(bookData.isbn, bookData.user_id)

    if (existingBook) {
      throw httpError('ISBN already exists for this user.', STATUS.CONFLICT)
    }
  }

  return await libraryRepository.createBook(bookData)
}

async function updateBookDetails(bookId, userId, rawBook) {
  await checkBookOwnership(bookId, userId)

  // Mesmo contrato e mesma validação do POST.
  return await libraryRepository.updateBook(bookId, normalizeBookInput(rawBook))
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
  normalizeBookInput,
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
