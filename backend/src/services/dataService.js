import { db } from '../database/connection.js'
import { DATA_QUERIES as q } from '../database/queries.js'
import * as libraryRepository from '../repositories/libraryRepository.js'
import { normalizeBookInput } from './libraryService.js'
import * as readingService from './readingService.js'
import { csvToObjects, toCsv } from '../utils/csv.js'
import { normalizeIsbn13 } from '../utils/isbn.js'
import STATUS from '../utils/statusCodes.js'
import logger from '../utils/logger.js'
import { httpError } from '../utils/httpError.js'

/**
 * Seus dados: exportar tudo (JSON ou CSV) e importar livros de um CSV — do
 * Goodreads ou o próprio CSV exportado pelo Librishelf.
 */

// ---------------------------------------------------------------------------
// Exportar
// ---------------------------------------------------------------------------

/** Colunas do CSV do Librishelf (também aceitas na importação). */
export const CSV_COLUMNS = [
  'title', 'authors', 'publisher', 'isbn', 'tags', 'rating', 'status', 'read_date',
  'started_at', 'publication_date', 'series', 'volume', 'notes', 'added_at',
  // Releituras: todas as datas de fim, da mais antiga para a mais recente
  'read_dates', 'pages'
]

// Vários nomes numa célula: separados por "; " (nome de autor pode ter vírgula).
const LIST_SEPARATOR = '; '

async function loadExport(userId) {
  const [user, goals, books] = await Promise.all([
    db.query(q.EXPORT_USER, [userId]),
    db.query(q.EXPORT_GOALS, [userId]),
    db.query(q.EXPORT_BOOKS, [userId])
  ])
  if (!user.rows[0]) throw httpError('Usuário não encontrado.', STATUS.NOT_FOUND, 'USER_NOT_FOUND')
  return { user: user.rows[0], goals: goals.rows, books: books.rows }
}

export async function exportJson(userId) {
  const { user, goals, books } = await loadExport(userId)
  return {
    app: 'Librishelf',
    version: 1,
    exportedAt: new Date().toISOString(),
    account: {
      username: user.name,
      email: user.email,
      emailVerified: user.email_verified,
      createdAt: user.created_at,
      isPublic: user.is_public,
      showInCommunity: user.show_in_community,
      showActivity: user.show_activity,
      allowIndexing: user.allow_indexing
    },
    readingGoals: goals,
    books: books.map(book => ({
      title: book.title,
      authors: book.authors,
      publisher: book.publisher,
      isbn: book.isbn,
      tags: book.tags,
      rating: book.rating,
      status: book.status,
      readDate: book.read_date,
      startedAt: book.started_at,
      publicationDate: book.publication_date,
      series: book.series,
      volume: book.series_index,
      notes: book.notes,
      pages: book.page_count,
      readings: book.readings,
      addedAt: book.added_at
    }))
  }
}

export async function exportCsv(userId) {
  const { books } = await loadExport(userId)
  const rows = books.map(book => [
    book.title,
    book.authors.join(LIST_SEPARATOR),
    book.publisher,
    book.isbn,
    book.tags.join(LIST_SEPARATOR),
    book.rating,
    book.status,
    book.read_date,
    book.started_at,
    book.publication_date,
    book.series,
    book.series_index,
    book.notes,
    book.added_at,
    book.readings.map(r => r.finishedOn).filter(Boolean).join(LIST_SEPARATOR),
    book.page_count
  ])
  return toCsv([CSV_COLUMNS, ...rows])
}

// ---------------------------------------------------------------------------
// Importar
// ---------------------------------------------------------------------------

export const MAX_IMPORT_ROWS = 5000
const MAX_NOTES = 5000
const GOODREADS_SHELVES = new Set(['read', 'currently-reading', 'to-read'])

/** ="0441013597" (como o Goodreads exporta) → 0441013597. */
function cleanIsbn(value) {
  const text = String(value ?? '').replace(/^="?|"$/g, '').replace(/[^0-9Xx]/g, '')
  return text || null
}

/** 2019/05/14, 2019-05-14 → '2019-05-14'; vazio ou inválido → null. */
function cleanDate(value) {
  const match = String(value ?? '').trim().match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/)
  if (!match) return null
  const [, y, m, d] = match
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
}

function cleanYear(value) {
  const year = String(value ?? '').trim()
  return /^\d{4}$/.test(year) ? `${year}-01-01` : null
}

/** Data no futuro (relógio errado, ano digitado errado) vira hoje. */
function notFuture(date) {
  if (!date) return null
  const today = new Date().toISOString().slice(0, 10)
  return date > today ? today : date
}

/** "Duna (Crônicas de Duna, #1)" → título "Duna", série "Crônicas de Duna", volume 1. */
export function splitSeries(rawTitle) {
  const title = String(rawTitle ?? '').trim()
  const match = title.match(/^(.+?)\s*\(([^()]+?),?\s*#(\d+(?:\.\d+)?)\)\s*$/)
  if (!match) return { title, series: null, seriesIndex: null }
  return { title: match[1].trim(), series: match[2].trim(), seriesIndex: match[3] }
}

function cleanPages(value) {
  const pages = Number(String(value ?? '').trim())
  return Number.isInteger(pages) && pages >= 1 && pages <= 20000 ? pages : null
}

function uniqueDates(dates) {
  return [...new Set(dates.map(notFuture).filter(Boolean))].sort()
}

function splitList(value, separator) {
  return String(value ?? '').split(separator).map(item => item.trim()).filter(Boolean)
}

function fromGoodreads(record) {
  const { title, series, seriesIndex } = splitSeries(record.Title)
  const shelf = String(record['Exclusive Shelf'] ?? '').trim()
  const added = cleanDate(record['Date Added'])

  // Prateleiras do Goodreads viram categorias (menos as três de status).
  const tags = splitList(record.Bookshelves, ',')
    .filter(name => !GOODREADS_SHELVES.has(name))
    .map(name => name.replace(/-/g, ' '))

  const notes = [record['Private Notes'], record['My Review']]
    .map(text => String(text ?? '').replace(/<br\s*\/?>/gi, '\n').trim())
    .filter(Boolean)
    .join('\n\n')
    .slice(0, MAX_NOTES)

  let status = 'none'
  if (shelf === 'read') status = 'read'
  else if (shelf === 'currently-reading') status = 'reading'
  else if (shelf === 'to-read') status = 'want'

  const rating = Number(record['My Rating'])

  return {
    title,
    authors: [record.Author, ...splitList(record['Additional Authors'], ',')].map(name => String(name ?? '').trim()).filter(Boolean),
    publisher: String(record.Publisher ?? '').trim(),
    isbn: cleanIsbn(record.ISBN13) || cleanIsbn(record.ISBN),
    tags,
    rating: rating >= 1 && rating <= 5 ? rating : null,
    status,
    // Lido sem data no Goodreads: usa o dia em que foi adicionado.
    readDate: status === 'read' ? notFuture(cleanDate(record['Date Read']) || added) : null,
    startedAt: status === 'reading' ? notFuture(added) : null,
    pubDate: cleanYear(record['Year Published']) || cleanYear(record['Original Publication Year']),
    pages: cleanPages(record['Number of Pages']),
    series,
    seriesIndex,
    notes
  }
}

function fromLibrishelf(record) {
  const status = ['read', 'reading', 'want'].includes(record.status) ? record.status : 'none'
  const rating = Number(record.rating)
  return {
    title: String(record.title ?? '').trim(),
    authors: splitList(record.authors, ';'),
    publisher: String(record.publisher ?? '').trim(),
    isbn: cleanIsbn(record.isbn),
    tags: splitList(record.tags, ';'),
    rating: rating >= 1 && rating <= 5 ? rating : null,
    status,
    readDate: status === 'read' || record.read_date ? notFuture(cleanDate(record.read_date)) : null,
    startedAt: status === 'reading' ? notFuture(cleanDate(record.started_at)) : null,
    pubDate: cleanDate(record.publication_date),
    // Releituras (CSV novo); sem a coluna, a data de leitura de sempre
    readDates: status === 'read' || record.read_date || record.read_dates
      ? uniqueDates([...splitList(record.read_dates, ';').map(cleanDate), cleanDate(record.read_date)])
      : [],
    pages: cleanPages(record.pages),
    series: String(record.series ?? '').trim() || null,
    seriesIndex: String(record.volume ?? '').trim() || null,
    notes: String(record.notes ?? '').slice(0, MAX_NOTES)
  }
}

function detectFormat(headers) {
  if (headers.includes('Exclusive Shelf') || headers.includes('Author l-f')) return 'goodreads'
  if (headers.includes('title') && headers.includes('authors')) return 'librishelf'
  return null
}

const keyOf = (title, author) => `${String(title).toLocaleLowerCase()}\u0000${String(author ?? '').toLocaleLowerCase()}`

/**
 * Importa os livros do CSV. Pula o que já está na estante (mesmo ISBN, ou mesmo
 * título + primeiro autor) e devolve o resumo com o motivo de cada linha pulada.
 */
export async function importCsv(userId, buffer) {
  if (!buffer?.length) throw httpError('Envie o arquivo CSV.', STATUS.BAD_REQUEST, 'CSV_REQUIRED')

  const { headers, records } = csvToObjects(buffer.toString('utf8'))
  const format = detectFormat(headers)
  if (!format) {
    throw httpError('Formato não reconhecido: envie o CSV exportado do Goodreads ou do Librishelf.', STATUS.BAD_REQUEST, 'CSV_FORMAT')
  }
  if (records.length === 0) throw httpError('O arquivo não tem nenhum livro.', STATUS.BAD_REQUEST, 'CSV_EMPTY')
  if (records.length > MAX_IMPORT_ROWS) {
    throw httpError(`O arquivo tem ${records.length} livros; o limite por importação é ${MAX_IMPORT_ROWS}.`, STATUS.BAD_REQUEST, 'CSV_TOO_MANY', { count: records.length, max: MAX_IMPORT_ROWS })
  }

  const { rows: existing } = await db.query(q.EXISTING_KEYS, [userId])
  const isbns = new Set(existing.map(row => row.isbn13).filter(Boolean))
  const keys = new Set(existing.map(row => keyOf(row.title, row.author)))

  const summary = { format, total: records.length, imported: 0, duplicates: 0, errors: [] }

  for (const [index, record] of records.entries()) {
    const line = index + 2 // linha 1 é o cabeçalho
    const book = format === 'goodreads' ? fromGoodreads(record) : fromLibrishelf(record)

    try {
      const input = normalizeBookInput({
        title: book.title,
        authors: book.authors,
        publisher: book.publisher,
        isbn: book.isbn,
        tags: book.tags.join(', '),
        rating: book.rating,
        pubDate: book.pubDate,
        readDate: book.status === 'read' ? book.readDate : null,
        series: book.series,
        seriesIndex: book.seriesIndex,
        notes: book.notes
      })

      const isbn13 = input.isbn ? normalizeIsbn13(input.isbn) : null
      const key = keyOf(input.title, input.authors[0])
      if ((isbn13 && isbns.has(isbn13)) || keys.has(key)) {
        summary.duplicates++
        continue
      }

      const bookId = await libraryRepository.createBook({ ...input, user_id: userId })
      if (input.series || input.seriesIndex !== null || input.notes || book.pages) {
        await libraryRepository.updateExtras(bookId, { ...input, pageCount: book.pages ?? null })
      }
      await readingService.importReadings(bookId, {
        status: book.status,
        finishedDates: book.readDates ?? (book.status === 'read' && input.readDate ? [input.readDate] : []),
        startedOn: book.status === 'reading' ? book.startedAt : null
      })

      if (isbn13) isbns.add(isbn13)
      keys.add(key)
      summary.imported++
    } catch (error) {
      if (summary.errors.length < 100) {
        summary.errors.push({ line, title: book.title || null, reason: error.status ? error.message : 'Erro ao gravar.' })
      }
      if (!error.status) logger.warn('Linha não importada', { userId, line, message: error.message })
    }
  }

  summary.failed = summary.total - summary.imported - summary.duplicates
  logger.info('Importação concluída', { userId, format, imported: summary.imported, duplicates: summary.duplicates, failed: summary.failed })
  return summary
}
