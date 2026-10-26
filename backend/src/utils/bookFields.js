import STATUS from './statusCodes.js'
import { httpError } from './httpError.js'

/**
 * Validação de campos de livro e de leitura, usada pelo cadastro/edição
 * (libraryService) e pelas leituras (readingService).
 */

/**
 * Datas trafegam como 'YYYY-MM-DD'. Só esse formato (ou um instante ISO
 * completo, de clientes antigos) é aceito, com dia que existe no calendário:
 * '2020-02-31' é 400 em vez de virar 2020-03-02 sem aviso, e anos como
 * 10000 ou -1 não chegam ao Postgres (antes: 500).
 */
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:?\d{2})$/

// Publicação: de livros antigos (1000) a lançamentos anunciados (2100)
export const PUB_MIN_YEAR = 1000
export const PUB_MAX_YEAR = 2100
// Leitura: de 1900 até hoje (com a tolerância de 1 dia de fuso)
export const READ_MIN_YEAR = 1900

function invalidDate(fieldName) {
  return httpError(`Data inválida em '${fieldName}'.`, STATUS.BAD_REQUEST, 'DATE_INVALID', { field: fieldName })
}

function parseDate(value, fieldName) {
  if (typeof value !== 'string' && !(value instanceof Date)) throw invalidDate(fieldName)

  let iso
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw invalidDate(fieldName)
    iso = value.toISOString().slice(0, 10)
  } else {
    const text = value.trim()
    if (DATE_ONLY.test(text)) iso = text
    else if (DATE_TIME.test(text) && !Number.isNaN(Date.parse(text))) iso = new Date(text).toISOString().slice(0, 10)
    else throw invalidDate(fieldName)
  }

  const [, y, m, d] = iso.match(DATE_ONLY) || []
  const year = Number(y)
  const month = Number(m)
  const day = Number(d)
  // Dia que existe (fevereiro, 30/31): monta em UTC e confere se não "rolou"
  const check = new Date(Date.UTC(year, month - 1, day))
  if (!y || month < 1 || month > 12 || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
    throw invalidDate(fieldName)
  }
  return { iso, year }
}

function outOfRange(fieldName, min, max) {
  return httpError(`Data fora do intervalo em '${fieldName}' (anos de ${min} a ${max}).`, STATUS.BAD_REQUEST, 'DATE_OUT_OF_RANGE', { field: fieldName, min, max })
}

/**
 * Data de publicação → 'YYYY-MM-DD' (ou null quando vazia). Ano de
 * PUB_MIN_YEAR a PUB_MAX_YEAR.
 */
export function normalizeDate(value, fieldName) {
  if (value === undefined || value === null || value === '') return null
  const { iso, year } = parseDate(value, fieldName)
  if (year < PUB_MIN_YEAR || year > PUB_MAX_YEAR) throw outOfRange(fieldName, PUB_MIN_YEAR, PUB_MAX_YEAR)
  return iso
}

/**
 * Data de leitura (início ou fim): de READ_MIN_YEAR até hoje. Tolerância de
 * 1 dia: o cliente manda a data local, que pode estar à frente da data UTC do servidor.
 */
export function normalizeReadDate(value, fieldName = 'readDate') {
  if (value === undefined || value === null || value === '') return null
  const { iso, year } = parseDate(value, fieldName)
  if (iso > tomorrow()) {
    throw httpError('A data de leitura não pode estar no futuro.', STATUS.BAD_REQUEST, 'READ_DATE_FUTURE')
  }
  if (year < READ_MIN_YEAR) throw outOfRange(fieldName, READ_MIN_YEAR, new Date().getUTCFullYear())
  return iso
}

/**
 * "Hoje" do servidor (UTC). Só como último recurso: o app manda a data local
 * da pessoa; entre 21h e meia-noite de Brasília o UTC já é o dia seguinte.
 */
export function today() {
  return new Date().toISOString().slice(0, 10)
}

function tomorrow() {
  return new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

/** Texto com tamanho máximo (título, ISBN, editora): acima do limite é 400, não 500 do índice. */
export function checkLength(value, fieldName, max) {
  if (typeof value === 'string' && value.length > max) {
    throw httpError(`O campo '${fieldName}' pode ter até ${max} caracteres.`, STATUS.BAD_REQUEST, 'FIELD_TOO_LONG', { field: fieldName, max })
  }
  return value
}

export const MAX_TITLE_LENGTH = 500
export const MAX_ISBN_LENGTH = 32
export const MAX_PUBLISHER_LENGTH = 200

/** Nota opcional: vazio/null remove; senão inteiro de 1 a 5. */
export function normalizeRating(value) {
  if (value === undefined || value === null || value === '' || value === 'null') return null
  const rating = Number(value)
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw httpError('A nota precisa ser um número inteiro de 1 a 5.', STATUS.BAD_REQUEST, 'RATING_INVALID')
  }
  return rating
}

export const MAX_PAGES = 20000

/** Total de páginas: vazio/null remove; senão inteiro de 1 a 20000. */
export function normalizePageCount(value) {
  if (value === undefined || value === null || value === '' || value === 'null') return null
  const pages = Number(value)
  if (!Number.isInteger(pages) || pages < 1 || pages > MAX_PAGES) {
    throw httpError(`O número de páginas precisa ser um inteiro de 1 a ${MAX_PAGES}.`, STATUS.BAD_REQUEST, 'PAGE_COUNT_INVALID', { max: MAX_PAGES })
  }
  return pages
}
