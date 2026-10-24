import client from './fetchClient.js'
import { API_URL } from '../config/site.js'

const enc = encodeURIComponent

/**
 * Monta a query string repetindo o parâmetro para listas (author=A&author=B).
 * Nomes de autor e editora podem ter vírgula, então nunca são juntados com ",".
 */
function toQuery(params = {}) {
  const search = new URLSearchParams()

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    if (Array.isArray(value)) {
      value.forEach(item => search.append(key, item))
    } else {
      search.append(key, value)
    }
  }

  const query = search.toString()
  return query ? `?${query}` : ''
}

export default {
  // --- Auth / conta ---
  login(credentials) {
    return client.post('/auth/login', credentials)
  },

  logout() {
    return client.post('/auth/logout')
  },

  me() {
    return client.get('/auth/me')
  },

  register(userData) {
    return client.post('/auth/register', userData)
  },

  forgotPassword(email, locale) {
    return client.post('/auth/password/forgot', { email, locale })
  },

  resetPassword(token, newPassword) {
    return client.post('/auth/password/reset', { token, newPassword })
  },

  verifyEmail(token) {
    return client.post('/auth/email/verify', { token })
  },

  resendVerification(locale) {
    return client.post('/auth/email/verify/resend', { locale })
  },

  changePassword(currentPassword, newPassword) {
    return client.put('/auth/password', { currentPassword, newPassword })
  },

  /** Qualquer combinação de { isPublic, showInCommunity, showActivity }. */
  changeEmail(email, password, locale) {
    return client.patch('/auth/me/email', { email, password, locale })
  },

  changeUsername(username, password) {
    return client.patch('/auth/me/username', { username, password })
  },

  /** Baixa a exportação ('json' ou 'csv') como Blob, com o nome de arquivo do servidor. */
  async exportData(format = 'json') {
    const response = await fetch(`${API_URL}/auth/me/export?format=${format}`, { credentials: 'include' })
    if (!response.ok) {
      let message = 'Não foi possível exportar.'
      try { message = (await response.json()).error || message } catch { /* corpo vazio */ }
      throw new Error(message)
    }
    const disposition = response.headers.get('Content-Disposition') || ''
    const filename = disposition.match(/filename="([^"]+)"/)?.[1] || `librishelf.${format}`
    return { blob: await response.blob(), filename }
  },

  /** Importa um CSV do Goodreads ou do Librishelf. */
  importBooks(file) {
    const formData = new FormData()
    formData.append('file', file)
    return client.post('/library/import', formData)
  },

  setPrivacy(settings) {
    return client.patch('/auth/me/visibility', settings)
  },

  deleteAccount(password) {
    return client.delete('/auth/me', { password })
  },

  // --- Livros ---
  getBooks(queryParams = {}, config = {}) {
    return client.get(`/library${toQuery(queryParams)}`, config)
  },

  getBookById(id) {
    return client.get(`/library/${id}`)
  },

  createBook(formData) {
    return client.post('/library', formData)
  },

  updateBook(id, bookData) {
    return client.put(`/library/${id}`, bookData)
  },

  deleteBook(id) {
    return client.delete(`/library/${id}`)
  },

  updateCover(id, formData) {
    return client.post(`/library/${id}/cover`, formData)
  },

  /** readDate: 'YYYY-MM-DD' no fuso da pessoa (padrão: hoje no servidor). */
  markAsRead(id, readDate) {
    return client.patch(`/library/${id}/read`, readDate ? { readDate } : undefined)
  },

  markAsUnread(id) {
    return client.delete(`/library/${id}/read`)
  },

  /** status: 'none' | 'want' | 'reading' | 'read'; date opcional ('YYYY-MM-DD', no fuso da pessoa). */
  setReadingStatus(id, status, date) {
    return client.patch(`/library/${id}/status`, date ? { status, date } : { status })
  },

  // --- Leituras (histórico) e progresso ---
  getReadings(id) {
    return client.get(`/library/${id}/readings`)
  },

  /** { startedOn?, finishedOn?, rating? } — sem finishedOn = em andamento. */
  addReading(id, reading) {
    return client.post(`/library/${id}/readings`, reading)
  },

  updateReading(id, readingId, fields) {
    return client.patch(`/library/${id}/readings/${readingId}`, fields)
  },

  deleteReading(id, readingId) {
    return client.delete(`/library/${id}/readings/${readingId}`)
  },

  /** { page?, percent?, totalPages? } → { reading, pageCount } */
  setProgress(id, progress) {
    return client.patch(`/library/${id}/progress`, progress)
  },

  getSeries() {
    return client.get('/library/series')
  },

  /** Ações em vários livros: { ids, action: 'status' | 'addTag' | 'removeTag' | 'delete', status?, date?, tag? } */
  batchBooks(body) {
    return client.post('/library/batch', body)
  },

  /** kind: 'author' | 'publisher' | 'tags'. Renomeia (um nome em from) ou mescla vários em `to`. */
  mergeNames(kind, from, to) {
    return client.post(`/${kind}/merge`, { from, to })
  },

  setRating(id, rating) {
    return client.patch(`/library/${id}/rating`, { rating })
  },

  // --- ISBN (Open Library, sempre via servidor) ---
  lookupIsbn(isbn) {
    return client.get(`/isbn/${enc(isbn)}`)
  },

  /** size 'M' = miniatura (lista da busca por título). */
  isbnCoverUrl(coverId, size) {
    return `${API_URL}/isbn/cover/${coverId}${size === 'M' ? '?size=M' : ''}`
  },

  /** Busca por título/autor no Open Library → { results, total }. */
  searchBooks(query, lang, { signal } = {}) {
    const params = new URLSearchParams({ q: query, lang: lang || 'pt' })
    return client.get(`/isbn/search?${params}`, { signal })
  },

  // --- Comunidade ---
  getBookCommunity(id) {
    return client.get(`/community/books/${id}`)
  },

  getPublicProfile(username) {
    return client.get(`/library/public/u/${enc(username)}/profile`)
  },

  // --- Seguir / feed ---
  findReaders(q = '') {
    return client.get(`/community/readers${toQuery({ q })}`)
  },

  getRecommendations() {
    return client.get('/community/recommendations')
  },

  /** Copia um livro da comunidade para a minha estante como "Quero ler". */
  wantFromCommunity(bookId) {
    return client.post(`/community/books/${bookId}/want`)
  },

  getFeed(page = 1) {
    return client.get(`/social/feed${toQuery({ page })}`)
  },

  getConnections() {
    return client.get('/social/connections')
  },

  getPendingRequestsCount() {
    return client.get('/social/requests/count')
  },

  follow(username) {
    return client.post(`/social/follow/${enc(username)}`)
  },

  unfollow(username) {
    return client.delete(`/social/follow/${enc(username)}`)
  },

  getBlocked() {
    return client.get('/social/blocks')
  },

  block(username) {
    return client.post(`/social/blocks/${enc(username)}`)
  },

  unblock(username) {
    return client.delete(`/social/blocks/${enc(username)}`)
  },

  acceptRequest(username) {
    return client.post(`/social/requests/${enc(username)}/accept`)
  },

  rejectRequest(username) {
    return client.delete(`/social/requests/${enc(username)}`)
  },

  removeFollower(username) {
    return client.delete(`/social/followers/${enc(username)}`)
  },

  // --- Listas ---
  getAuthors(publishers = []) {
    return client.get(`/author${toQuery({ publishers })}`)
  },

  getPublishers(authors = []) {
    return client.get(`/publisher${toQuery({ authors })}`)
  },

  getTags() {
    return client.get('/tags')
  },

  getDashboardStats(year) {
    return client.get(`/dashboard/stats${toQuery(year ? { year } : {})}`)
  },

  setReadingGoal(year, target) {
    return client.put('/dashboard/goal', { year, target })
  },

  deleteReadingGoal(year) {
    return client.delete(`/dashboard/goal/${year}`)
  },

  // --- Público ---
  getRandomCovers() {
    return client.get('/library/covers/random')
  },

  getPublicLibrary(username, params = {}) {
    return client.get(`/library/public/u/${enc(username)}${toQuery(params)}`)
  },

  getPublicBook(username, id) {
    return client.get(`/library/public/u/${enc(username)}/book/${id}`)
  }
}
