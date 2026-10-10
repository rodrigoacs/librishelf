import client from './fetchClient.js'

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

  changePassword(currentPassword, newPassword) {
    return client.put('/auth/password', { currentPassword, newPassword })
  },

  setLibraryVisibility(isPublic) {
    return client.patch('/auth/me/visibility', { isPublic })
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

  markAsRead(id) {
    return client.patch(`/library/${id}/read`)
  },

  markAsUnread(id) {
    return client.delete(`/library/${id}/read`)
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

  getDashboardStats() {
    return client.get('/dashboard/stats')
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
