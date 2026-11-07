/**
 * Biblioteca pública (pacote 33): aba e filtros da estante ⇄ query da URL.
 * Assim dá para mandar o link de "os lidos de fulano em ordem de nota".
 * Valores padrão não aparecem na URL; o resto da query (ex.: ?book=12) fica.
 *
 *   /u/ana?tab=lists
 *   /u/ana?status=read&q=asimov&sort=rating
 */
export const PUBLIC_TABS = ['shelf', 'lists', 'reviews', 'stats']
export const SHELF_STATUSES = ['all', 'read', 'reading', 'want']
// Ordem → campo e direção do GET /library/public/u/:username
export const SHELF_SORTS = {
  recent: { sort: 'recent', order: 'desc' },
  title: { sort: 'title', order: 'asc' },
  authors: { sort: 'authors', order: 'asc' },
  rating: { sort: 'rating', order: 'desc' },
  readDate: { sort: 'readDate', order: 'desc' }
}
export const MAX_SEARCH = 100

const single = value => (Array.isArray(value) ? value[0] : value)

/** Query da URL → { tab, status, search, sort } (inválido vira padrão). */
export function readPublicQuery(query = {}) {
  const tab = single(query.tab)
  const status = single(query.status)
  const sort = single(query.sort)
  return {
    tab: PUBLIC_TABS.includes(tab) ? tab : 'shelf',
    status: SHELF_STATUSES.includes(status) ? status : 'all',
    search: String(single(query.q) ?? '').trim().slice(0, MAX_SEARCH),
    sort: Object.hasOwn(SHELF_SORTS, sort ?? '') ? sort : 'recent'
  }
}

/** Estado → query, mantendo as outras chaves (book…) e tirando os padrões. */
export function writePublicQuery(query = {}, state = {}) {
  const { tab, status, q, sort, ...rest } = query
  const next = { ...rest }
  if (state.tab && state.tab !== 'shelf') next.tab = state.tab
  if (state.status && state.status !== 'all') next.status = state.status
  const search = String(state.search ?? '').trim()
  if (search) next.q = search
  if (state.sort && state.sort !== 'recent') next.sort = state.sort
  return next
}

/** Parâmetros da API para a estante. */
export function shelfParams(state, page, limit) {
  const { sort, order } = SHELF_SORTS[state.sort] ?? SHELF_SORTS.recent
  const params = { page, limit, sort, order }
  if (state.status !== 'all') params.readState = state.status
  if (state.search) params.search = state.search
  return params
}

/** Os padrões estão em uso? (os favoritos só aparecem na estante "crua") */
export function isDefaultShelf(state) {
  return state.status === 'all' && !state.search && state.sort === 'recent'
}
