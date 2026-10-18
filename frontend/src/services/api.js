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

  setRating(id, rating) {
    return client.patch(`/library/${id}/rating`, { rating })
  },

  // --- ISBN (Open Library, sempre via servidor) ---
  lookupIsbn(isbn) {
    return client.get(`/isbn/${enc(isbn)}`)
  },

  isbnCoverUrl(coverId) {
    return `${API_URL}/isbn/cover/${coverId}`
  },

  // --- Comunidade ---
  getBookCommunity(id) {
    return client.get(`/community/books/${id}`)
  },

  getPublicProfile(username) {
    return client.get(`/library/public/u/${enc(username)}/profile`)
  },

  // --- Seguir / feed ---
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
