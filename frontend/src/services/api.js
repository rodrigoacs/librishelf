import client from './fetchClient.js'

const enc = encodeURIComponent

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
    const queryString = new URLSearchParams(queryParams).toString()
    const url = queryString ? `/library?${queryString}` : '/library'

    return client.get(url, config)
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
  getAuthors(publisherFilter) {
    const url = publisherFilter ? `/author?publishers=${enc(publisherFilter)}` : '/author'
    return client.get(url)
  },

  getPublishers(authorFilter) {
    const url = authorFilter ? `/publisher?authors=${enc(authorFilter)}` : '/publisher'
    return client.get(url)
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
    const queryString = new URLSearchParams(params).toString()
    return client.get(`/library/public/u/${enc(username)}?${queryString}`)
  },

  getPublicBook(username, id) {
    return client.get(`/library/public/u/${enc(username)}/book/${id}`)
  }
}
