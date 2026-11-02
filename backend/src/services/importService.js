import { db } from '../database/connection.js'
import { IMPORT_QUERIES as q, DATA_QUERIES } from '../database/queries.js'
import * as libraryRepository from '../repositories/libraryRepository.js'
import * as vanguardaService from './vanguardaService.js'
import * as openLibrary from './openLibraryService.js'
import { fromGoodreads, fromLibrishelf, detectFormat, insertImportedBook, keyOf, MAX_IMPORT_ROWS } from './dataService.js'
import { enqueue } from '../jobs/queue.js'
import { PermanentJobError } from '../jobs/errors.js'
import { csvToObjects, sniffDelimiter } from '../utils/csv.js'
import { saveBookCover } from '../utils/imageProcessor.js'
import { normalizeIsbn13 } from '../utils/isbn.js'
import { httpError } from '../utils/httpError.js'
import STATUS from '../utils/statusCodes.js'
import logger from '../utils/logger.js'

/**
 * Importação em etapas, com a fila de jobs:
 *
 *   1. POST /library/imports (arquivo)       → rascunho + prévia
 *   2. POST /library/imports/:id/preview     → prévia de novo (mapeamento do CSV genérico)
 *   3. POST /library/imports/:id/start       → job import.run
 *   4. GET  /library/imports/:id             → progresso e relatório
 *
 * import.run grava os livros e anota o progresso a cada lote; se o worker cair
 * no meio, o job volta e continua da linha onde parou. Depois, import.covers
 * busca as capas no Open Library em rodadas pequenas, devagar.
 *
 * Limites do Open Library: 1 requisição/s sem identificação, 3/s com
 * User-Agent e e-mail (OPENLIBRARY_CONTACT). Capa por ID não tem limite; capa
 * por ISBN tem (100 a cada 5 min por IP), então a capa sai pelo ID que vem na
 * edição (/isbn/{isbn}.json). A importação usa só parte do limite (a outra
 * fica para as buscas do site) e o Open Library pede para não baixar dados
 * em massa: ritmo de IMPORT_COVER_PAUSE_MS entre livros.
 *   https://openlibrary.org/developers/api
 *   https://openlibrary.org/dev/docs/api/covers
 */
export const RUN_JOB = 'import.run'
export const COVERS_JOB = 'import.covers'
const PROGRESS_EVERY = 25
const MAX_ERRORS = 100
const COVERS_PER_ROUND = 40
const COVER_RETRY_SECONDS = 5 * 60
const DRAFT_HOURS = 24

function coverPauseMs() {
  const raw = Number(process.env.IMPORT_COVER_PAUSE_MS)
  if (Number.isFinite(raw) && raw >= 0) return raw
  return process.env.OPENLIBRARY_CONTACT?.trim() ? 700 : 2000
}

const sleep = ms => (ms > 0 ? new Promise(resolve => setTimeout(resolve, ms)) : Promise.resolve())

// ---------------------------------------------------------- CSV genérico

/** Campos que dá para mapear no CSV genérico (title é obrigatório). */
export const GENERIC_FIELDS = Object.freeze([
  'title', 'authors', 'isbn', 'publisher', 'status', 'rating', 'readDate', 'startedAt',
  'pubDate', 'pages', 'tags', 'notes', 'series', 'seriesIndex'
])

// Cabeçalhos comuns (sem acento, minúsculos) → campo
const SYNONYMS = {
  title: ['title', 'titulo', 'nome', 'livro', 'book', 'book title', 'nome do livro'],
  authors: ['author', 'authors', 'autor', 'autores', 'autor(es)', 'escritor'],
  isbn: ['isbn', 'isbn13', 'isbn 13', 'isbn-13', 'isbn10', 'isbn 10', 'isbn-10', 'ean'],
  publisher: ['publisher', 'editora'],
  status: ['status', 'situacao', 'estado', 'shelf', 'estante', 'exclusive shelf'],
  rating: ['rating', 'nota', 'avaliacao', 'my rating', 'estrelas', 'stars'],
  readDate: ['date read', 'read date', 'lido em', 'data de leitura', 'terminei em', 'data lido', 'finished', 'data de termino'],
  startedAt: ['date started', 'started', 'comecei em', 'inicio', 'data de inicio'],
  pubDate: ['year', 'ano', 'year published', 'publication year', 'ano de publicacao', 'data de publicacao', 'published'],
  pages: ['pages', 'paginas', 'number of pages', 'num pages', 'n de paginas', 'numero de paginas'],
  tags: ['tags', 'categorias', 'categoria', 'genero', 'generos', 'bookshelves', 'shelves', 'prateleiras'],
  notes: ['notes', 'notas', 'anotacoes', 'observacoes', 'comentario', 'private notes', 'review', 'resenha'],
  series: ['series', 'serie', 'colecao', 'saga'],
  seriesIndex: ['volume', 'vol', 'numero', 'series index', 'n na serie']
}

const plain = text => String(text ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[_.:#º°]/g, ' ').replace(/\s+/g, ' ').trim()

/** Sugestão de mapeamento pelos nomes das colunas: { campo: coluna } */
export function suggestMapping(headers) {
  const mapping = {}
  const used = new Set()
  for (const field of GENERIC_FIELDS) {
    const header = headers.find(name => !used.has(name) && SYNONYMS[field].includes(plain(name)))
    if (header) {
      mapping[field] = header
      used.add(header)
    }
  }
  return mapping
}

/** Valida o mapeamento recebido: só campos conhecidos, colunas que existem, título obrigatório. */
export function readMapping(raw, headers) {
  const mapping = {}
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const field of GENERIC_FIELDS) {
      const column = raw[field]
      if (column === undefined || column === null || column === '') continue
      if (typeof column !== 'string' || !headers.includes(column)) {
        throw httpError('Coluna do mapeamento não existe no arquivo.', STATUS.BAD_REQUEST, 'IMPORT_MAPPING_INVALID', { field })
      }
      mapping[field] = column
    }
  }
  return mapping
}

const STATUS_WORDS = {
  read: ['read', 'lido', 'lidos', 'lida', 'finished', 'concluido', 'terminado', 'sim', 'yes'],
  reading: ['reading', 'currently reading', 'currently-reading', 'lendo', 'em leitura', 'em andamento'],
  want: ['want', 'to read', 'to-read', 'quero ler', 'quero-ler', 'wishlist', 'desejo', 'na fila', 'para ler']
}

function statusOf(text) {
  const value = plain(text).replace(/-/g, ' ')
  for (const [status, words] of Object.entries(STATUS_WORDS)) {
    if (words.some(word => word.replace(/-/g, ' ') === value)) return status
  }
  return null
}

/** "4", "4,5", "4/5", "★★★★" → 1 a 5; 0, vazio ou fora disso → null */
export function ratingOf(text) {
  const value = String(text ?? '').trim()
  if (!value) return null
  const stars = (value.match(/★/g) || []).length
  if (stars) return stars <= 5 ? stars : null
  const number = Number(value.replace(',', '.').split('/')[0])
  if (!Number.isFinite(number) || number <= 0) return null
  const rounded = Math.round(number)
  return rounded >= 1 && rounded <= 5 ? rounded : null
}

/**
 * Datas: 2024-05-14, 2024/05/14, 14/05/2024 (dia primeiro, como no Brasil;
 * mês primeiro só quando o dia não cabe como mês, ex. 05/14/2024) ou só o ano.
 */
export function dateOf(text, { yearOnly = false } = {}) {
  const value = String(text ?? '').trim()
  if (!value) return null
  let y, m, d
  let match = value.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/)
  if (match) [y, m, d] = match.slice(1).map(Number)
  else if ((match = value.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/))) {
    const [a, b, year] = match.slice(1).map(Number)
    y = year
    if (a > 12 && b <= 12) [d, m] = [a, b]
    else if (b > 12 && a <= 12) [m, d] = [a, b]
    else [d, m] = [a, b]
  } else if (yearOnly && /^\d{4}$/.test(value)) {
    return `${value}-01-01`
  } else {
    return null
  }
  const check = new Date(Date.UTC(y, m - 1, d))
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) return null
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

const today = () => new Date().toISOString().slice(0, 10)
const notFuture = date => (date && date > today() ? today() : date)
const splitOn = (value, pattern) => String(value ?? '').split(pattern).map(item => item.trim()).filter(Boolean)

/** Linha do CSV genérico → livro, no mesmo formato de fromGoodreads/fromLibrishelf */
export function fromGeneric(record, mapping) {
  const get = field => (mapping[field] ? String(record[mapping[field]] ?? '').trim() : '')
  const readDate = notFuture(dateOf(get('readDate')))
  let status = mapping.status ? statusOf(get('status')) : null
  if (!status) status = readDate ? 'read' : 'none'
  const pages = Number(get('pages'))
  const pubDate = dateOf(get('pubDate'), { yearOnly: true })
  const pubYear = pubDate ? Number(pubDate.slice(0, 4)) : null

  return {
    title: get('title'),
    // Vírgula não separa autores ("Tolkien, J. R. R."); ponto e vírgula, & e | sim
    authors: splitOn(get('authors'), /\s*(?:;|&|\|)\s*/),
    publisher: get('publisher'),
    isbn: get('isbn').replace(/^="?|"$/g, '').replace(/[^0-9Xx]/g, '') || null,
    tags: splitOn(get('tags'), /[;,|]/),
    rating: ratingOf(get('rating')),
    status,
    readDate: status === 'read' ? readDate : null,
    readDates: status === 'read' && readDate ? [readDate] : [],
    startedAt: status === 'reading' ? notFuture(dateOf(get('startedAt'))) : null,
    pubDate: pubYear && pubYear >= 1000 && pubYear <= new Date().getUTCFullYear() + 1 ? pubDate : null,
    pages: Number.isInteger(pages) && pages >= 1 && pages <= 20000 ? pages : null,
    series: get('series') || null,
    seriesIndex: get('seriesIndex') || null,
    notes: get('notes').slice(0, 5000)
  }
}

// ---------------------------------------------------------------- leitura

/** CSV → { format, headers, records } (genérico se não for Goodreads nem Librishelf) */
export function readFile(content) {
  const text = String(content ?? '')
  const comma = csvToObjects(text)
  const known = detectFormat(comma.headers)
  if (known) return { format: known, headers: comma.headers, records: comma.records }
  const delimiter = sniffDelimiter(text)
  const parsed = delimiter === ',' ? comma : csvToObjects(text, { delimiter })
  return { format: 'generic', headers: parsed.headers, records: parsed.records }
}

function toBook(format, record, mapping) {
  if (format === 'goodreads') return fromGoodreads(record)
  if (format === 'librishelf') return fromLibrishelf(record)
  return fromGeneric(record, mapping)
}

function checkSize(records) {
  if (records.length === 0) throw httpError('O arquivo não tem nenhum livro.', STATUS.BAD_REQUEST, 'CSV_EMPTY')
  if (records.length > MAX_IMPORT_ROWS) {
    throw httpError(`O arquivo tem ${records.length} livros; o limite por importação é ${MAX_IMPORT_ROWS}.`, STATUS.BAD_REQUEST, 'CSV_TOO_MANY', { count: records.length, max: MAX_IMPORT_ROWS })
  }
}

// ----------------------------------------------------------------- prévia

/**
 * Prévia: total, duplicados por ISBN (na estante ou repetidos no arquivo),
 * sem ISBN, "quero ler", sem título e as primeiras linhas como vão entrar.
 */
async function buildPreview(userId, format, records, mapping) {
  if (format === 'generic' && !mapping.title) {
    return { needsMapping: true, total: records.length }
  }
  const { rows } = await db.query(DATA_QUERIES.EXISTING_KEYS, [userId])
  const owned = new Set(rows.map(row => row.isbn13).filter(Boolean))
  const seen = new Set()
  const counts = { total: records.length, duplicates: 0, withoutIsbn: 0, want: 0, untitled: 0, rereads: 0 }
  const sample = []

  for (const record of records) {
    const book = toBook(format, record, mapping)
    if (!book.title) { counts.untitled++; continue }
    if (book.status === 'want') counts.want++
    if (book.readCount > 1) counts.rereads += book.readCount - 1
    const isbn13 = book.isbn ? normalizeIsbn13(book.isbn) : null
    if (!isbn13) counts.withoutIsbn++
    else if (owned.has(isbn13) || seen.has(isbn13)) counts.duplicates++
    else seen.add(isbn13)
    if (sample.length < 5) {
      sample.push({ title: book.title, authors: book.authors, isbn: isbn13, status: book.status, rating: book.rating, readDate: book.readDate })
    }
  }
  return { needsMapping: false, ...counts, sample }
}

// ---------------------------------------------------------------- saída

const iso = date => (date ? new Date(date).toISOString() : null)

function out(row) {
  return {
    id: Number(row.id),
    status: row.status,
    format: row.format,
    filename: row.filename,
    headers: row.headers,
    mapping: row.mapping,
    suggestedMapping: row.format === 'generic' ? suggestMapping(row.headers) : null,
    includeWant: row.include_want,
    total: row.total,
    processed: row.processed,
    imported: row.imported,
    duplicates: row.duplicates,
    skippedWant: row.skipped_want,
    failed: row.failed,
    rereadsWithoutDate: row.rereads_undated,
    errors: row.errors,
    covers: { total: row.covers_total, done: row.covers_done, found: row.covers_found },
    createdAt: iso(row.created_at),
    startedAt: iso(row.started_at),
    finishedAt: iso(row.finished_at)
  }
}

async function ownImport(userId, id) {
  const row = (await db.query(q.GET, [id, userId])).rows[0]
  if (!row) throw httpError('Importação não encontrada.', STATUS.NOT_FOUND, 'IMPORT_NOT_FOUND')
  return row
}

// ------------------------------------------------------------------ rotas

/** POST /library/imports — arquivo → rascunho + prévia */
export async function createDraft(userId, file) {
  if (!file?.buffer?.length) throw httpError('Envie o arquivo CSV.', STATUS.BAD_REQUEST, 'CSV_REQUIRED')
  const content = file.buffer.toString('utf8')
  const { format, headers, records } = readFile(content)
  if (headers.length === 0) throw httpError('O arquivo não tem nenhum livro.', STATUS.BAD_REQUEST, 'CSV_EMPTY')
  checkSize(records)

  const mapping = format === 'generic' ? suggestMapping(headers) : null
  const filename = String(file.originalname || '').slice(0, 255) || null
  const row = (await db.query(q.INSERT_DRAFT, [userId, format, filename, content, JSON.stringify(headers), mapping ? JSON.stringify(mapping) : null, records.length])).rows[0]
  return { import: out(row), preview: await buildPreview(userId, format, records, mapping || {}) }
}

/** POST /library/imports/:id/preview — { mapping } (CSV genérico) */
export async function preview(userId, id, { mapping } = {}) {
  const row = await ownImport(userId, id)
  if (row.status !== 'draft') throw httpError('Esta importação já começou.', STATUS.CONFLICT, 'IMPORT_NOT_DRAFT')
  const { format, headers, records } = readFile(row.content)
  let chosen = row.mapping || {}
  if (format === 'generic' && mapping !== undefined) {
    chosen = readMapping(mapping, headers)
    await db.query(q.SET_MAPPING, [id, JSON.stringify(chosen)])
  }
  return { import: out({ ...row, mapping: format === 'generic' ? chosen : null }), preview: await buildPreview(userId, format, records, chosen) }
}

/** POST /library/imports/:id/start — { includeWant, mapping } */
export async function start(userId, id, { includeWant = false, mapping } = {}) {
  const row = await ownImport(userId, id)
  if (row.status !== 'draft') throw httpError('Esta importação já começou.', STATUS.CONFLICT, 'IMPORT_NOT_DRAFT')

  let chosen = row.mapping
  if (row.format === 'generic') {
    chosen = mapping !== undefined ? readMapping(mapping, row.headers) : (row.mapping || {})
    if (!chosen.title) throw httpError('Escolha a coluna do título.', STATUS.BAD_REQUEST, 'IMPORT_MAPPING_REQUIRED', { field: 'title' })
  }

  const client = await db.connect()
  try {
    await client.query('BEGIN')
    const updated = (await client.query(q.QUEUE, [id, includeWant === true, chosen ? JSON.stringify(chosen) : null])).rows[0]
    await enqueue(RUN_JOB, { importId: Number(id) }, { dedupeKey: `${RUN_JOB}:${id}`, maxAttempts: 3 }, client)
    await client.query('COMMIT')
    return { import: out(updated) }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => { })
    // Índice único: uma importação andando por conta
    if (error.code === '23505') throw httpError('Já há uma importação em andamento.', STATUS.CONFLICT, 'IMPORT_RUNNING')
    throw error
  } finally {
    client.release()
  }
}

export async function get(userId, id) {
  return { import: out(await ownImport(userId, id)) }
}

export async function list(userId) {
  const { rows } = await db.query(q.LIST, [userId])
  return { imports: rows.map(out) }
}

/** Rascunho: some. Terminada: some o relatório. Andando: não. */
export async function remove(userId, id) {
  const row = await ownImport(userId, id)
  if (['queued', 'running'].includes(row.status)) throw httpError('Esta importação está em andamento.', STATUS.CONFLICT, 'IMPORT_RUNNING')
  await db.query(q.DELETE, [id])
  return { deleted: true }
}

// ------------------------------------------------------------------- jobs

/** Job import.run: grava os livros a partir da linha onde parou. */
export async function runImport(importId) {
  const row = (await db.query(q.CLAIM, [importId])).rows[0]
  if (!row) return { skipped: 'importação não está na fila' }

  let parsed
  try {
    parsed = readFile(row.content)
    checkSize(parsed.records)
  } catch (error) {
    await db.query(q.FAIL, [importId, JSON.stringify([{ line: null, title: null, reason: error.message }])])
    throw new PermanentJobError(`Importação ${importId}: ${error.message}`)
  }

  const { rows: existing } = await db.query(DATA_QUERIES.EXISTING_KEYS, [row.user_id])
  const sets = {
    isbns: new Set(existing.map(item => item.isbn13).filter(Boolean)),
    keys: new Set(existing.map(item => keyOf(item.title, item.author)))
  }
  const state = {
    processed: row.processed,
    imported: row.imported,
    duplicates: row.duplicates,
    skippedWant: row.skipped_want,
    failed: row.failed,
    rereads: row.rereads_undated,
    errors: Array.isArray(row.errors) ? row.errors : []
  }
  const save = () => db.query(q.PROGRESS, [importId, state.processed, state.imported, state.duplicates, state.skippedWant,
    state.failed, state.rereads, JSON.stringify(state.errors)])

  for (let index = state.processed; index < parsed.records.length; index++) {
    const book = toBook(row.format, parsed.records[index], row.mapping || {})
    if (book.status === 'want' && !row.include_want) {
      state.skippedWant++
    } else {
      try {
        const result = await insertImportedBook(row.user_id, book, sets)
        if (result.result === 'duplicate') {
          state.duplicates++
        } else {
          state.imported++
          if (book.readCount > 1) state.rereads += book.readCount - 1
          if (result.isbn13) await db.query(q.ADD_COVER, [importId, result.bookId, result.isbn13])
        }
      } catch (error) {
        state.failed++
        if (state.errors.length < MAX_ERRORS) {
          state.errors.push({ line: index + 2, title: book.title || null, reason: error.status ? error.message : 'Erro ao gravar.', code: error.errorCode || null, params: error.params || null })
        }
        if (!error.status) logger.warn('Linha não importada', { importId, line: index + 2, message: error.message })
      }
    }
    state.processed = index + 1
    if (state.processed % PROGRESS_EVERY === 0) await save()
  }

  await save()
  const done = (await db.query(q.FINISH, [importId])).rows[0]
  if (done.covers_total > 0) await enqueue(COVERS_JOB, { importId: Number(importId), round: 0 }, { dedupeKey: `${COVERS_JOB}:${importId}:0`, maxAttempts: 3 })
  if (state.imported > 0) await vanguardaService.checkSafely(row.user_id)

  logger.info('Importação concluída', { importId, userId: row.user_id, format: row.format, imported: state.imported, duplicates: state.duplicates, failed: state.failed })
  return { imported: state.imported, duplicates: state.duplicates, failed: state.failed, covers: done.covers_total }
}

/**
 * Job import.covers: uma rodada de até COVERS_PER_ROUND livros; enfileira a
 * próxima. Open Library fora do ar: a rodada para e volta em 5 minutos.
 */
export async function runCovers(importId, round = 0) {
  const pending = (await db.query(q.PENDING_COVERS, [importId, COVERS_PER_ROUND])).rows
  let found = 0
  let checked = 0

  for (const item of pending) {
    let gotCover = false
    try {
      if (!item.cover_version) {
        const coverId = await openLibrary.coverIdForIsbn(item.isbn13)
        const buffer = coverId ? await openLibrary.fetchCover(coverId, 'L') : null
        if (buffer) {
          await saveBookCover(buffer, item.book_id)
          await libraryRepository.markCover(item.book_id)
          gotCover = true
          found++
        }
      }
    } catch (error) {
      if (error.errorCode === 'OPENLIBRARY_UNAVAILABLE') {
        await db.query(q.COUNT_COVERS, [importId])
        await enqueue(COVERS_JOB, { importId: Number(importId), round: round + 1 },
          { dedupeKey: `${COVERS_JOB}:${importId}:${round + 1}`, runAt: new Date(Date.now() + COVER_RETRY_SECONDS * 1000), maxAttempts: 3 })
        return { checked, found, paused: true }
      }
      // Capa que não deu para processar: segue sem ela
      logger.warn('Capa da importação não foi salva', { importId, bookId: item.book_id, message: error.message })
    }
    await db.query(q.COVER_DONE, [importId, item.book_id, gotCover])
    checked++
    await sleep(coverPauseMs())
  }

  const counts = (await db.query(q.COUNT_COVERS, [importId])).rows[0]
  if (counts && counts.covers_done < counts.covers_total && pending.length > 0) {
    await enqueue(COVERS_JOB, { importId: Number(importId), round: round + 1 }, { dedupeKey: `${COVERS_JOB}:${importId}:${round + 1}`, maxAttempts: 3 })
  }
  return { checked, found }
}

/** Limpeza diária (imports.cleanup): rascunhos esquecidos e arquivos de importações que falharam. */
export async function cleanup() {
  const { rowCount } = await db.query(q.CLEANUP, [DRAFT_HOURS])
  return { removed: rowCount }
}
