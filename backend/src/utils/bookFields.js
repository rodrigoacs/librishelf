import STATUS from './statusCodes.js'
import { httpError } from './httpError.js'

/**
 * Validação de campos de livro e de leitura, usada pelo cadastro/edição
 * (libraryService) e pelas leituras (readingService).
 */

/**
 * Converte a data recebida para 'YYYY-MM-DD' (ou null quando vazia).
 * Data inválida vira 400 em vez de estourar como 500 no `toISOString()` ou no Postgres.
 */
export function normalizeDate(value, fieldName) {
  if (value === undefined || value === null || value === '') return null

  const parsed = new Date(value)

  if (Number.isNaN(parsed.getTime())) {
    throw httpError(`Data inválida em '${fieldName}'.`, STATUS.BAD_REQUEST, 'DATE_INVALID', { field: fieldName })
  }

  return parsed.toISOString().split('T')[0]
}

/**
 * Data de leitura (início ou fim) não pode estar no futuro. Tolerância de 1
 * dia: o cliente manda a data local, que pode estar à frente da data UTC do servidor.
 */
export function normalizeReadDate(value, fieldName = 'readDate') {
  const date = normalizeDate(value, fieldName)
  if (!date) return date
  if (date > tomorrow()) {
    throw httpError('A data de leitura não pode estar no futuro.', STATUS.BAD_REQUEST, 'READ_DATE_FUTURE')
  }
  return date
}

export function today() {
  return new Date().toISOString().slice(0, 10)
}

function tomorrow() {
  return new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

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
