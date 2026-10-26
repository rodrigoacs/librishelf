import * as libraryRepository from '../repositories/libraryRepository.js'
import * as authRepository from '../repositories/authRepository.js'
import STATUS from '../utils/statusCodes.js'
import { deleteBookCover } from '../utils/imageProcessor.js'
import logger from '../utils/logger.js'
import { parseNameList, parseTagList, nameListError } from '../utils/nameList.js'
import { httpError } from '../utils/httpError.js'
import {
  normalizeDate, normalizeReadDate, normalizeRating, normalizePageCount, checkLength,
  MAX_TITLE_LENGTH, MAX_ISBN_LENGTH, MAX_PUBLISHER_LENGTH
} from '../utils/bookFields.js'
import * as readingService from './readingService.js'

const READ_YEAR_PATTERN = /^\d{4}$/

function normalizeIsbn(isbn) {
  if (isbn === undefined || isbn === null) return null
  if (typeof isbn !== 'string' && typeof isbn !== 'number') {
    throw httpError("Campo 'isbn' inválido.", STATUS.BAD_REQUEST, 'FIELD_INVALID', { field: 'isbn' })
  }
  const trimmed = String(isbn).trim()
  return trimmed ? checkLength(trimmed, 'isbn', MAX_ISBN_LENGTH) : null
}

const READ_STATES = ['all', 'read', 'unread', 'true', 'false', 'reading', 'want']
export const READING_STATUSES = ['none', 'want', 'reading', 'read']

function normalizeReadState(value) {
  if (value === undefined || value === null || value === '') return 'all'
  if (!READ_STATES.includes(String(value))) {
    throw httpError("Parâmetro 'readState' inválido.", STATUS.BAD_REQUEST, 'PARAM_INVALID', { param: 'readState' })
  }
  return String(value)
}

function normalizeReadMonth(value) {
  if (value === undefined || value === null || value === '') return undefined
  const month = Number(value)
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw httpError("Parâmetro 'readMonth' inválido: use um número de 1 a 12.", STATUS.BAD_REQUEST, 'PARAM_INVALID', { param: 'readMonth' })
  }
  return month
}

const MAX_SERIES_LENGTH = 200
const MAX_NOTES_LENGTH = 5000

function normalizeSeries(value) {
  if (value === undefined || value === null) return null
  if (typeof value !== 'string') throw httpError("'series' precisa ser texto.", STATUS.BAD_REQUEST, 'FIELD_INVALID', { field: 'series' })
  const series = value.trim().replace(/\s+/g, ' ')
  if (series.length > MAX_SERIES_LENGTH) {
    throw httpError(`O nome da série pode ter até ${MAX_SERIES_LENGTH} caracteres.`, STATUS.BAD_REQUEST, 'SERIES_TOO_LONG', { max: MAX_SERIES_LENGTH })
  }
  return series || null
}

// Volume: 1, 2, 3… e também 1.5 (conto entre volumes). Vírgula decimal vale.
function normalizeSeriesIndex(value) {
  if (value === undefined || value === null || value === '') return null
  const number = Number(String(value).replace(',', '.'))
  if (!Number.isFinite(number) || number < 0 || number > 9999) {
    throw httpError('O volume precisa ser um número de 0 a 9999.', STATUS.BAD_REQUEST, 'VOLUME_INVALID')
  }
  return Math.round(number * 100) / 100
}

function normalizeNotes(value) {
  if (value === undefined || value === null) return null
  if (typeof value !== 'string') throw httpError("'notes' precisa ser texto.", STATUS.BAD_REQUEST, 'FIELD_INVALID', { field: 'notes' })
  const notes = value.replace(/\r\n/g, '\n').trim()
  if (notes.length > MAX_NOTES_LENGTH) {
    throw httpError(`A anotação pode ter até ${MAX_NOTES_LENGTH} caracteres.`, STATUS.BAD_REQUEST, 'NOTES_TOO_LONG', { max: MAX_NOTES_LENGTH })
  }
  return notes || null
}

function normalizeReadYear(readYear) {
  if (readYear === undefined || readYear === null || readYear === '' || readYear === 'all') return 'all'

  if (!READ_YEAR_PATTERN.test(String(readYear))) {
    throw httpError("Parâmetro 'readYear' inválido: use um ano com 4 dígitos.", STATUS.BAD_REQUEST, 'PARAM_INVALID', { param: 'readYear' })
  }

  return String(readYear)
}

async function getPublicLibraryByUsername(username, query) {
  const user = await authRepository.getUserByName(username)

  // Biblioteca privada responde igual a usuário inexistente: não confirma que a conta existe.
  if (!user || !user.is_public) {
    throw httpError('Biblioteca não encontrada.', STATUS.NOT_FOUND, 'LIBRARY_NOT_FOUND')
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

  const book = await libraryRepository.getBookByIdForUser(bookId, user.id)
  if (!book) return null
  // A anotação é só do dono.
  const { notes, ...publicBook } = book
  return publicBook
}

async function getAllBooksByUser(userId, query) {
  const filters = {
    search: query.search || undefined,
    readState: normalizeReadState(query.readState),
    readYear: normalizeReadYear(query.readYear),
    readMonth: normalizeReadMonth(query.readMonth),
    series: typeof query.series === 'string' && query.series.trim() ? query.series.trim() : undefined,
    author: query.author || undefined,
    publisher: query.publisher || undefined,
    tags: query.tags || undefined,
    isbnStatus: query.isbn === 'invalid' ? 'invalid' : undefined,
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

const FIELD_LABELS = { Title: 'título' }

function requireText(value, fieldName) {
  if (typeof value !== 'string' || !value.trim()) {
    throw httpError(`Informe o campo ${FIELD_LABELS[fieldName] || fieldName}.`, STATUS.BAD_REQUEST, 'FIELD_REQUIRED', { field: fieldName.toLowerCase() })
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
const OL_WORK_KEY = /^\/works\/OL\d+W$/
const OL_EDITION_KEY = /^\/books\/OL\d+M$/

function normalizeOlKey(value, pattern, field) {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string' || !pattern.test(value)) {
    throw httpError(`Campo '${field}' inválido.`, STATUS.BAD_REQUEST, 'FIELD_INVALID', { field })
  }
  return value
}

function normalizeBookInput(raw = {}) {
  const authors = parseNameList(raw.authors)
  if (authors.length === 0) throw httpError('Informe pelo menos um autor.', STATUS.BAD_REQUEST, 'AUTHORS_REQUIRED')

  const tags = parseTagList(raw.tags)

  const listError = nameListError(authors, 'autores') || nameListError(tags, 'tags')
  if (listError) throw httpError(listError.message, STATUS.BAD_REQUEST, listError.code, listError.params)

  const publisher = typeof raw.publisher === 'string' ? raw.publisher.trim() : ''
  checkLength(publisher, 'publisher', MAX_PUBLISHER_LENGTH)

  return {
    title: checkLength(requireText(raw.title, 'Title'), 'title', MAX_TITLE_LENGTH),
    authors,
    tags,
    publisher: publisher || null,
    isbn: normalizeIsbn(raw.isbn),
    pubDate: normalizeDate(raw.pubDate, 'pubDate'),
    readDate: normalizeReadDate(raw.readDate),
    rating: normalizeRating(raw.rating),
    olWorkKey: normalizeOlKey(raw.olWorkKey, OL_WORK_KEY, 'olWorkKey'),
    olEditionKey: normalizeOlKey(raw.olEditionKey, OL_EDITION_KEY, 'olEditionKey'),
    series: normalizeSeries(raw.series),
    seriesIndex: normalizeSeriesIndex(raw.seriesIndex),
    notes: normalizeNotes(raw.notes),
    pageCount: normalizePageCount(raw.pageCount)
  }
}

async function getBookById(id, userId) {
  return await libraryRepository.getBookByIdForUser(id, userId)
}

async function addNewBook(bookData) {
  if (bookData.isbn) {
    const existingBook = await libraryRepository.findBookByIsbn(bookData.isbn, bookData.user_id)

    if (existingBook) {
      throw httpError('Você já tem um livro com este ISBN.', STATUS.CONFLICT, 'ISBN_TAKEN')
    }
  }

  const bookId = await libraryRepository.createBook(bookData)
  if (bookData.series || bookData.seriesIndex !== null || bookData.notes || bookData.pageCount) {
    await libraryRepository.updateExtras(bookId, bookData)
  }
  // Data de leitura no cadastro = primeira leitura do histórico
  if (bookData.readDate) await readingService.applyFormReadDate(bookId, bookData.readDate)
  return bookId
}

async function updateBookDetails(bookId, userId, rawBook) {
  await checkBookOwnership(bookId, userId)

  // Mesmo contrato e mesma validação do POST.
  const input = normalizeBookInput(rawBook)

  // Quem não manda "rating" (clientes antigos) não apaga a nota que já existe.
  if (!Object.hasOwn(rawBook ?? {}, 'rating')) {
    const current = await libraryRepository.getBookByIdForUser(bookId, userId)
    input.rating = current?.rating ?? null
  }

  await libraryRepository.updateBook(bookId, input)
  // readDate = data da última leitura; sem data, o histórico fica como está
  // (update_book grava a coluna direto; o resumo volta a refletir as leituras)
  const body0 = rawBook ?? {}
  const explicitNull = Object.hasOwn(body0, 'readDate') && (body0.readDate === null || body0.readDate === '')
  await readingService.applyFormReadDate(bookId, input.readDate, { clear: explicitNull })

  // Série, volume e anotação: campo que não veio (cliente antigo) fica como estava.
  const body = rawBook ?? {}
  const current = await libraryRepository.getExtras(bookId)
  await libraryRepository.updateExtras(bookId, {
    series: Object.hasOwn(body, 'series') ? input.series : current?.series ?? null,
    seriesIndex: Object.hasOwn(body, 'seriesIndex') ? input.seriesIndex : current?.series_index ?? null,
    notes: Object.hasOwn(body, 'notes') ? input.notes : current?.notes ?? null,
    pageCount: Object.hasOwn(body, 'pageCount') ? input.pageCount : current?.page_count ?? null
  })
  return true
}

/**
 * Livro de outra pessoa responde igual a livro inexistente (404): 403 aqui
 * confirmaria que o id existe (o GET já respondia 404).
 */
async function checkBookOwnership(bookId, userId) {
  const bookOwner = await libraryRepository.getBookOwner(bookId)

  if (!bookOwner || bookOwner.user_id !== userId) {
    throw httpError('Livro não encontrado.', STATUS.NOT_FOUND, 'BOOK_NOT_FOUND')
  }

  return true
}

async function deleteBook(bookId, userId) {
  await checkBookOwnership(bookId, userId)

  await libraryRepository.deleteBookById(bookId)

  // Autores/editoras/tags que só existiam nesse livro deixam de aparecer nas listas.
  await libraryRepository.pruneUserNames(userId)

  await deleteBookCover(bookId)
}

async function setRating(bookId, userId, value) {
  await checkBookOwnership(bookId, userId)
  return await libraryRepository.updateRating(bookId, normalizeRating(value))
}

/**
 * Marcar lido / desmarcar / status de leitura: ver readingService (as
 * leituras viraram histórico na migration 009). Ficam aqui os nomes usados
 * pelas rotas.
 */
async function markBookAsRead(bookId, userId, rawDate) {
  return readingService.markRead(bookId, userId, rawDate)
}

async function markBookAsUnread(bookId, userId) {
  return readingService.markUnread(bookId, userId)
}

async function setReadingStatus(bookId, userId, rawStatus, rawDate) {
  return readingService.setStatus(bookId, userId, rawStatus, rawDate)
}

async function touchBook(bookId) {
  await libraryRepository.touchBook(bookId)
}

async function getSeries(userId) {
  return await libraryRepository.getSeriesByUser(userId)
}

const MAX_BATCH = 500
const BATCH_ACTIONS = ['status', 'addTag', 'removeTag', 'delete']

/**
 * Ações em vários livros de uma vez: { ids, action, status?, date?, tag? }.
 * Todos os ids precisam ser do usuário; se algum não for, nada é feito (403).
 */
async function batchUpdate(userId, body = {}) {
  const { action } = body
  if (!BATCH_ACTIONS.includes(action)) {
    throw httpError("Ação inválida: use 'status', 'addTag', 'removeTag' ou 'delete'.", STATUS.BAD_REQUEST, 'BATCH_ACTION_INVALID')
  }

  const ids = [...new Set((Array.isArray(body.ids) ? body.ids : []).map(Number))]
  if (ids.length === 0 || ids.length > MAX_BATCH || !ids.every(id => Number.isInteger(id) && id > 0 && id <= 2147483647)) {
    throw httpError(`Envie de 1 a ${MAX_BATCH} ids de livros válidos.`, STATUS.BAD_REQUEST, 'BATCH_IDS_INVALID', { max: MAX_BATCH })
  }

  const owned = await libraryRepository.filterOwnedIds(userId, ids)
  if (owned.length !== ids.length) {
    throw httpError('Alguns livros não foram encontrados na sua biblioteca.', STATUS.NOT_FOUND, 'BATCH_BOOKS_NOT_FOUND')
  }

  if (action === 'status') {
    return { updated: await readingService.batchStatus(ids, body.status, body.date) }
  }

  if (action === 'addTag' || action === 'removeTag') {
    const [tag] = parseTagList(body.tag)
    if (!tag) throw httpError('Informe a categoria.', STATUS.BAD_REQUEST, 'TAG_REQUIRED')
    const tagError = nameListError([tag], 'tags')
    if (tagError) throw httpError(tagError.message, STATUS.BAD_REQUEST, tagError.code, tagError.params)

    if (action === 'addTag') {
      return { updated: await libraryRepository.batchAddTag(userId, ids, tag) }
    }
    const updated = await libraryRepository.batchRemoveTag(userId, ids, tag)
    await libraryRepository.pruneUserNames(userId)
    return { updated }
  }

  // delete
  const deleted = await libraryRepository.batchDelete(ids)
  await libraryRepository.pruneUserNames(userId)
  const failed = []
  for (const id of ids) {
    try { await deleteBookCover(id) } catch { failed.push(id) }
  }
  if (failed.length) logger.warn('Capas não removidas na exclusão em lote', { userId, failed })
  return { updated: deleted }
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
  setReadingStatus,
  getSeries,
  touchBook,
  batchUpdate,
  setRating,
  getPublicLibraryByUsername,
  normalizeDate,
  normalizeReadYear
}
