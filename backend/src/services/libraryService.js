import * as libraryRepository from '../repositories/libraryRepository.js'
import * as authRepository from '../repositories/authRepository.js'
import STATUS from '../utils/statusCodes.js'
import { deleteBookCover } from '../utils/imageProcessor.js'
import logger from '../utils/logger.js'
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

/**
 * Data de leitura não pode estar no futuro. Tolerância de 1 dia: o cliente
 * manda a data local, que pode estar à frente da data UTC do servidor.
 */
function normalizeReadDate(value) {
  const date = normalizeDate(value, 'readDate')
  if (!date) return date
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  if (date > tomorrow) {
    throw httpError('A data de leitura não pode estar no futuro.', STATUS.BAD_REQUEST)
  }
  return date
}

const READ_STATES = ['all', 'read', 'unread', 'true', 'false', 'reading', 'want']
export const READING_STATUSES = ['none', 'want', 'reading', 'read']

function normalizeReadState(value) {
  if (value === undefined || value === null || value === '') return 'all'
  if (!READ_STATES.includes(String(value))) {
    throw httpError("Parâmetro 'readState' inválido.", STATUS.BAD_REQUEST)
  }
  return String(value)
}

function normalizeReadMonth(value) {
  if (value === undefined || value === null || value === '') return undefined
  const month = Number(value)
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw httpError("Parâmetro 'readMonth' inválido: use um número de 1 a 12.", STATUS.BAD_REQUEST)
  }
  return month
}

const MAX_SERIES_LENGTH = 200
const MAX_NOTES_LENGTH = 5000

function normalizeSeries(value) {
  if (value === undefined || value === null) return null
  if (typeof value !== 'string') throw httpError("'series' precisa ser texto.", STATUS.BAD_REQUEST)
  const series = value.trim().replace(/\s+/g, ' ')
  if (series.length > MAX_SERIES_LENGTH) {
    throw httpError(`O nome da série pode ter até ${MAX_SERIES_LENGTH} caracteres.`, STATUS.BAD_REQUEST)
  }
  return series || null
}

// Volume: 1, 2, 3… e também 1.5 (conto entre volumes). Vírgula decimal vale.
function normalizeSeriesIndex(value) {
  if (value === undefined || value === null || value === '') return null
  const number = Number(String(value).replace(',', '.'))
  if (!Number.isFinite(number) || number < 0 || number > 9999) {
    throw httpError('O volume precisa ser um número de 0 a 9999.', STATUS.BAD_REQUEST)
  }
  return Math.round(number * 100) / 100
}

function normalizeNotes(value) {
  if (value === undefined || value === null) return null
  if (typeof value !== 'string') throw httpError("'notes' precisa ser texto.", STATUS.BAD_REQUEST)
  const notes = value.replace(/\r\n/g, '\n').trim()
  if (notes.length > MAX_NOTES_LENGTH) {
    throw httpError(`A anotação pode ter até ${MAX_NOTES_LENGTH} caracteres.`, STATUS.BAD_REQUEST)
  }
  return notes || null
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
const OL_WORK_KEY = /^\/works\/OL\d+W$/
const OL_EDITION_KEY = /^\/books\/OL\d+M$/

/** Nota opcional: vazio/null remove; senão inteiro de 1 a 5. */
function normalizeRating(value) {
  if (value === undefined || value === null || value === '' || value === 'null') return null
  const rating = Number(value)
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw httpError('A nota precisa ser um número inteiro de 1 a 5.', STATUS.BAD_REQUEST)
  }
  return rating
}

function normalizeOlKey(value, pattern, field) {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string' || !pattern.test(value)) {
    throw httpError(`Campo '${field}' inválido.`, STATUS.BAD_REQUEST)
  }
  return value
}

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
    readDate: normalizeReadDate(raw.readDate),
    rating: normalizeRating(raw.rating),
    olWorkKey: normalizeOlKey(raw.olWorkKey, OL_WORK_KEY, 'olWorkKey'),
    olEditionKey: normalizeOlKey(raw.olEditionKey, OL_EDITION_KEY, 'olEditionKey'),
    series: normalizeSeries(raw.series),
    seriesIndex: normalizeSeriesIndex(raw.seriesIndex),
    notes: normalizeNotes(raw.notes)
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

  const bookId = await libraryRepository.createBook(bookData)
  if (bookData.series || bookData.seriesIndex !== null || bookData.notes) {
    await libraryRepository.updateExtras(bookId, bookData)
  }
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
  if (input.readDate) await libraryRepository.clearWantIfRead(bookId)

  // Série, volume e anotação: campo que não veio (cliente antigo) fica como estava.
  const body = rawBook ?? {}
  const current = await libraryRepository.getExtras(bookId)
  await libraryRepository.updateExtras(bookId, {
    series: Object.hasOwn(body, 'series') ? input.series : current?.series ?? null,
    seriesIndex: Object.hasOwn(body, 'seriesIndex') ? input.seriesIndex : current?.series_index ?? null,
    notes: Object.hasOwn(body, 'notes') ? input.notes : current?.notes ?? null
  })
  return true
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

  // Autores/editoras/tags que só existiam nesse livro deixam de aparecer nas listas.
  await libraryRepository.pruneUserNames(userId)

  await deleteBookCover(bookId)
}

async function setRating(bookId, userId, value) {
  await checkBookOwnership(bookId, userId)
  return await libraryRepository.updateRating(bookId, normalizeRating(value))
}

/**
 * Marca como lido. O cliente manda a data local (YYYY-MM-DD): com o relógio do
 * servidor em UTC, quem marca às 22h em Brasília veria "lido amanhã".
 */
async function markBookAsRead(bookId, userId, rawDate) {
  await checkBookOwnership(bookId, userId)
  const readDate = normalizeReadDate(rawDate) ?? new Date()
  return await libraryRepository.updateReadDate(bookId, readDate)
}

async function markBookAsUnread(bookId, userId) {
  await checkBookOwnership(bookId, userId)
  return await libraryRepository.updateReadDate(bookId, null)
}

/**
 * Status de leitura em um passo só:
 *   none    → só na estante (tira "Quero ler"/"Lendo" e a data de leitura)
 *   want    → "Quero ler" (apaga a data de leitura)
 *   reading → "Lendo" desde `date` (ou hoje); num livro já lido é releitura e a data antiga fica
 *   read    → "Lido" em `date` (ou hoje)
 * Devolve { status, readDate, startedAt } já como ficaram no banco.
 */
async function setReadingStatus(bookId, userId, rawStatus, rawDate) {
  await checkBookOwnership(bookId, userId)
  const status = String(rawStatus ?? '')

  if (!READING_STATUSES.includes(status)) {
    throw httpError("Status inválido: use 'none', 'want', 'reading' ou 'read'.", STATUS.BAD_REQUEST)
  }

  if (status === 'read') {
    const readDate = normalizeReadDate(rawDate) ?? new Date().toISOString().slice(0, 10)
    await libraryRepository.updateReadDate(bookId, readDate)
    return { status: 'read', readDate, startedAt: null }
  }

  let startedAt = null
  if (status === 'reading') {
    startedAt = normalizeReadDate(rawDate)
    if (!startedAt) {
      const current = await libraryRepository.getBookByIdForUser(bookId, userId)
      startedAt = current?.reading_status === 'reading' && current.started_at
        ? new Date(current.started_at).toISOString().slice(0, 10)
        : new Date().toISOString().slice(0, 10)
    }
  }

  const row = await libraryRepository.setReadingStatus(bookId, {
    status: status === 'want' || status === 'reading' ? status : null,
    startedAt,
    clearRead: status !== 'reading'
  })

  return {
    status: row.reading_status ?? (row.read_date ? 'read' : 'none'),
    readDate: row.read_date,
    startedAt: row.started_at
  }
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
    throw httpError("Ação inválida: use 'status', 'addTag', 'removeTag' ou 'delete'.", STATUS.BAD_REQUEST)
  }

  const ids = [...new Set((Array.isArray(body.ids) ? body.ids : []).map(Number))]
  if (ids.length === 0 || ids.length > MAX_BATCH || !ids.every(id => Number.isInteger(id) && id > 0 && id <= 2147483647)) {
    throw httpError(`Envie de 1 a ${MAX_BATCH} ids de livros válidos.`, STATUS.BAD_REQUEST)
  }

  const owned = await libraryRepository.filterOwnedIds(userId, ids)
  if (owned.length !== ids.length) {
    throw httpError('Alguns livros não foram encontrados na sua biblioteca.', STATUS.FORBIDDEN)
  }

  if (action === 'status') {
    const status = String(body.status ?? '')
    if (!READING_STATUSES.includes(status)) {
      throw httpError("Status inválido: use 'none', 'want', 'reading' ou 'read'.", STATUS.BAD_REQUEST)
    }
    const date = normalizeReadDate(body.date) ?? new Date().toISOString().slice(0, 10)
    return { updated: await libraryRepository.batchSetStatus(ids, status, date) }
  }

  if (action === 'addTag' || action === 'removeTag') {
    const [tag] = parseTagList(body.tag)
    const tagError = tag ? validateNameList([tag], 'tags') : 'Informe a categoria.'
    if (tagError) throw httpError(tagError, STATUS.BAD_REQUEST)

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
  batchUpdate,
  setRating,
  getPublicLibraryByUsername,
  normalizeDate,
  normalizeReadYear
}
