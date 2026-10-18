/**
 * Filtros da biblioteca ⇄ query string da URL.
 *
 * Assim a URL de /books guarda a busca, os filtros, a ordem e o modo de
 * exibição: dá para recarregar, voltar, salvar nos favoritos ou mandar o link.
 * Valores padrão não aparecem na URL, para ela ficar curta.
 *
 *   /books?q=asimov&status=read&year=2025&tags=Fantasia&sort=title&order=asc&view=list
 */

const SORT_FIELDS = ['recent', 'title', 'authors', 'readDate', 'pubDate', 'rating']
const READ_STATES = ['read', 'unread']
export const VIEW_MODES = ['grid', 'list']

function asList(value) {
  if (value === undefined || value === null || value === '') return []
  return (Array.isArray(value) ? value : [value]).map(String).filter(Boolean)
}

function asSingle(value) {
  return Array.isArray(value) ? value[0] : value
}

/** Query da URL → filtros do useLibrary (só o que veio; o resto fica no padrão). */
export function queryToFilters(query = {}) {
  const status = asSingle(query.status)
  const year = asSingle(query.year)
  const sort = asSingle(query.sort)
  const order = asSingle(query.order)

  return {
    search: String(asSingle(query.q) ?? ''),
    readState: READ_STATES.includes(status) ? status : 'all',
    readYear: /^\d{4}$/.test(year ?? '') ? year : 'all',
    author: asList(query.author),
    publisher: asList(query.publisher),
    tags: asList(query.tags),
    isbnStatus: asSingle(query.isbn) === 'invalid' ? 'invalid' : 'all',
    sortField: SORT_FIELDS.includes(sort) ? sort : 'recent',
    sortOrder: order === 'asc' ? 'asc' : 'desc'
  }
}

export function queryToView(query = {}) {
  const view = asSingle(query.view)
  return VIEW_MODES.includes(view) ? view : null
}

/** Filtros + modo de exibição → query da URL, sem os valores padrão. */
export function filtersToQuery(filters, view = 'grid') {
  const query = {}
  if (filters.search?.trim()) query.q = filters.search.trim()
  if (READ_STATES.includes(filters.readState)) query.status = filters.readState
  if (filters.readYear && filters.readYear !== 'all') query.year = String(filters.readYear)
  if (filters.author?.length) query.author = [...filters.author]
  if (filters.publisher?.length) query.publisher = [...filters.publisher]
  if (filters.tags?.length) query.tags = [...filters.tags]
  if (filters.isbnStatus === 'invalid') query.isbn = 'invalid'
  if (filters.sortField && filters.sortField !== 'recent') query.sort = filters.sortField
  if (filters.sortOrder === 'asc') query.order = 'asc'
  if (view === 'list') query.view = 'list'
  return query
}

/** Compara duas queries ignorando a ordem das chaves. */
export function sameQuery(a = {}, b = {}) {
  const normalize = query => JSON.stringify(
    Object.keys(query).sort().map(key => [key, asList(query[key])])
  )
  return normalize(a) === normalize(b)
}
