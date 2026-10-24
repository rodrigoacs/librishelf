import logger from '../utils/logger.js'
import STATUS from '../utils/statusCodes.js'
import { normalizeIsbn13 } from '../utils/isbn.js'
import { httpError } from '../utils/httpError.js'

/**
 * Busca de livros por ISBN no Open Library, feita sempre pelo servidor (o
 * navegador do usuário não fala com o Open Library).
 *
 * Regras de uso do Open Library: identificar o app no User-Agent (com contato)
 * libera até 3 requisições/s; sem isso, 1/s. Capas por ID (não por ISBN) não
 * têm limite. Respostas ficam em cache para não repetir consultas.
 *   https://openlibrary.org/developers/api
 *   https://openlibrary.org/dev/docs/api/covers
 */

const API_BASE = 'https://openlibrary.org'
const COVERS_BASE = 'https://covers.openlibrary.org'

const TIMEOUT_MS = 8000
const CACHE_TTL_MS = 24 * 60 * 60 * 1000
const NOT_FOUND_TTL_MS = 60 * 60 * 1000
const CACHE_MAX = 500
const COVER_CACHE_MAX = 30
const MAX_COVER_BYTES = 5 * 1024 * 1024
const MAX_AUTHORS = 8

const OL_WORK_KEY = /^\/works\/OL\d+W$/
const OL_EDITION_KEY = /^\/books\/OL\d+M$/
const OL_AUTHOR_KEY = /^\/authors\/OL\d+A$/

let fetchImpl = (...args) => fetch(...args)
let minIntervalMs = Number(process.env.OPENLIBRARY_MIN_INTERVAL_MS) || (contact() ? 350 : 1000)

const lookupCache = new Map()
const coverCache = new Map()

let queue = Promise.resolve()
let lastRequestAt = 0

function contact() {
  return process.env.OPENLIBRARY_CONTACT?.trim() || ''
}

function userAgent() {
  return contact() ? `Librishelf/1.0 (${contact()})` : 'Librishelf/1.0'
}

function unavailable(cause) {
  const error = new Error('A busca por ISBN está indisponível no momento. Tente de novo mais tarde.')
  error.status = 502
  error.cause = cause
  return error
}

/** Só para testes: troca o fetch e zera cache/limite. */
export function configureForTests({ fetch: customFetch, minInterval = 0 } = {}) {
  fetchImpl = customFetch
  minIntervalMs = minInterval
  lookupCache.clear()
  coverCache.clear()
  queue = Promise.resolve()
  lastRequestAt = 0
}

// Fila: uma requisição por vez, com intervalo mínimo entre elas.
function throttled(task) {
  const run = queue.then(async () => {
    const wait = lastRequestAt + minIntervalMs - Date.now()
    if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait))
    lastRequestAt = Date.now()
    return task()
  })
  queue = run.catch(() => { })
  return run
}

function cacheGet(cache, key) {
  const entry = cache.get(key)
  if (!entry) return undefined
  if (entry.expiresAt < Date.now()) {
    cache.delete(key)
    return undefined
  }
  return entry.value
}

function cacheSet(cache, key, value, ttl, max) {
  if (cache.size >= max) cache.delete(cache.keys().next().value)
  cache.set(key, { value, expiresAt: Date.now() + ttl })
}

async function getJson(path) {
  let response
  try {
    response = await throttled(() => fetchImpl(`${API_BASE}${path}`, {
      headers: { 'User-Agent': userAgent(), Accept: 'application/json' },
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS)
    }))
  } catch (err) {
    throw unavailable(err)
  }

  if (response.status === 404) return null
  if (!response.ok) throw unavailable(new Error(`HTTP ${response.status} em ${path}`))

  try {
    return await response.json()
  } catch (err) {
    throw unavailable(err)
  }
}

const MONTHS = {
  jan: 1, january: 1, janeiro: 1, feb: 2, february: 2, fev: 2, fevereiro: 2, mar: 3, march: 3, marco: 3, março: 3,
  apr: 4, april: 4, abr: 4, abril: 4, may: 5, mai: 5, maio: 5, jun: 6, june: 6, junho: 6, jul: 7, july: 7, julho: 7,
  aug: 8, august: 8, ago: 8, agosto: 8, sep: 9, sept: 9, september: 9, set: 9, setembro: 9, oct: 10, october: 10,
  out: 10, outubro: 10, nov: 11, november: 11, novembro: 11, dec: 12, december: 12, dez: 12, dezembro: 12
}

/**
 * publish_date vem como texto livre: "1988", "October 1, 1988", "Oct 1988",
 * "1988-10-01". Devolve 'YYYY-MM-DD' (dia/mês = 01 quando não informados) ou null.
 */
export function parsePublishDate(text) {
  if (typeof text !== 'string') return null
  const value = text.trim().toLowerCase()

  const iso = value.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/)
  if (iso) return validDate(+iso[1], +iso[2], iso[3] ? +iso[3] : 1)

  const yearMatch = value.match(/\b(1[0-9]{3}|20[0-9]{2})\b/)
  if (!yearMatch) return null
  const year = +yearMatch[1]

  const monthName = Object.keys(MONTHS).find(name => new RegExp(`\\b${name}\\b`).test(value))
  const month = monthName ? MONTHS[monthName] : 1

  let day = 1
  if (monthName) {
    const dayMatch = value.replace(yearMatch[1], '').match(/\b([0-3]?\d)\b/)
    if (dayMatch) day = +dayMatch[1]
  }

  return validDate(year, month, day) ?? validDate(year, month, 1)
}

function validDate(year, month, day) {
  if (year < 1000 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return null
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCMonth() !== month - 1) return null
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function firstCoverId(...lists) {
  for (const list of lists) {
    const id = Array.isArray(list) ? list.find(value => Number.isInteger(value) && value > 0) : undefined
    if (id) return id
  }
  return null
}

// Registros de autor quebrados no Open Library (importações automáticas) vêm
// com nomes de mentira, ex.: "invalid author ID" no ISBN 9788501401380.
const PLACEHOLDER_AUTHOR = /^(invalid author( id)?|unknown( author)?|anonymous|anônimo|desconhecido|n\/?a|none|null|undefined|-+|\?+)$/i

function isRealAuthorName(name) {
  return name.length > 1 && !PLACEHOLDER_AUTHOR.test(name) && !/invalid author/i.test(name)
}

// Autor mesclado no Open Library vira { type: /type/redirect, location: /authors/... }.
async function fetchAuthor(key) {
  const author = await getJson(`${key}.json`)
  if (author?.type?.key === '/type/redirect' && OL_AUTHOR_KEY.test(author.location ?? '')) {
    return getJson(`${author.location}.json`)
  }
  return author
}

async function authorNames(keys) {
  const names = []
  const unique = [...new Set(keys.filter(k => OL_AUTHOR_KEY.test(k)))].slice(0, MAX_AUTHORS)
  for (const key of unique) {
    try {
      const author = await fetchAuthor(key)
      const name = typeof author?.name === 'string' ? author.name.trim().replace(/\s+/g, ' ') : ''
      if (!name) continue
      if (!isRealAuthorName(name)) {
        logger.warn('Autor do Open Library com nome inválido ignorado', { key, name })
        continue
      }
      if (!names.includes(name)) names.push(name)
    } catch (err) {
      logger.warn('Autor do Open Library não carregou', { key, message: err.message })
    }
  }
  return names
}

/**
 * ISBN → { isbn13, title, authors[], publisher, pubDate, olWorkKey, olEditionKey, coverId }
 * ou null se o Open Library não conhece o ISBN.
 */
export async function lookupIsbn(rawIsbn) {
  const isbn13 = normalizeIsbn13(rawIsbn)
  if (!isbn13) throw httpError('ISBN inválido.', STATUS.BAD_REQUEST, 'ISBN_INVALID')

  const cached = cacheGet(lookupCache, isbn13)
  if (cached !== undefined) return cached

  const edition = await getJson(`/isbn/${isbn13}.json`)

  if (!edition) {
    cacheSet(lookupCache, isbn13, null, NOT_FOUND_TTL_MS, CACHE_MAX)
    return null
  }

  const workKey = edition.works?.find(work => OL_WORK_KEY.test(work?.key))?.key ?? null
  let work = null
  if (workKey) {
    try {
      work = await getJson(`${workKey}.json`)
    } catch (err) {
      logger.warn('Obra do Open Library não carregou', { workKey, message: err.message })
    }
  }

  const editionAuthorKeys = (edition.authors ?? []).map(author => author?.key).filter(Boolean)
  const workAuthorKeys = (work?.authors ?? []).map(entry => entry?.author?.key).filter(Boolean)
  // Autores da edição primeiro; se nenhum servir (ausentes ou quebrados), os da obra.
  let authors = await authorNames(editionAuthorKeys)
  if (authors.length === 0) authors = await authorNames(workAuthorKeys)

  const baseTitle = (edition.title || work?.title || '').trim()
  const subtitle = typeof edition.subtitle === 'string' ? edition.subtitle.trim() : ''

  const result = {
    isbn13,
    title: subtitle ? `${baseTitle}: ${subtitle}` : baseTitle,
    authors,
    publisher: Array.isArray(edition.publishers) && typeof edition.publishers[0] === 'string'
      ? edition.publishers[0].trim()
      : null,
    pubDate: parsePublishDate(edition.publish_date),
    olWorkKey: workKey,
    olEditionKey: OL_EDITION_KEY.test(edition.key) ? edition.key : null,
    coverId: firstCoverId(edition.covers, work?.covers)
  }

  cacheSet(lookupCache, isbn13, result, CACHE_TTL_MS, CACHE_MAX)
  return result
}

/** Capa grande pelo ID (sem limite de requisições no Open Library). */
export async function fetchCover(coverId) {
  const id = Number(coverId)
  if (!Number.isInteger(id) || id <= 0) throw httpError('Capa inválida.', STATUS.BAD_REQUEST, 'COVER_INVALID')

  const cached = cacheGet(coverCache, id)
  if (cached !== undefined) return cached

  let response
  try {
    response = await fetchImpl(`${COVERS_BASE}/b/id/${id}-L.jpg?default=false`, {
      headers: { 'User-Agent': userAgent() },
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS)
    })
  } catch (err) {
    throw unavailable(err)
  }

  if (response.status === 404) return null
  if (!response.ok) throw unavailable(new Error(`HTTP ${response.status} na capa ${id}`))

  const declared = Number(response.headers.get('content-length'))
  if (declared > MAX_COVER_BYTES) throw httpError('Capa grande demais.', 502, 'COVER_TOO_LARGE')

  const buffer = Buffer.from(await response.arrayBuffer())
  if (buffer.length > MAX_COVER_BYTES) throw httpError('Capa grande demais.', 502, 'COVER_TOO_LARGE')

  cacheSet(coverCache, id, buffer, CACHE_TTL_MS, COVER_CACHE_MAX)
  return buffer
}