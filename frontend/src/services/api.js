import client from './fetchClient.js'

export default {
  login(credentials) {
    return client.post('/auth/login', credentials)
  },

  register(userData) {
    return client.post('/auth/register', userData)
  },

  async getBooks(queryParams = {}) {
    const queryString = new URLSearchParams(queryParams).toString()
    const url = queryString ? `/library?${queryString}` : '/library'

    return client.get(url)
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

  getAuthors(publisherFilter) {
    const url = publisherFilter ? `/author?publishers=${publisherFilter}` : '/author'
    return client.get(url)
  },

  getPublishers(authorFilter) {
    const url = authorFilter ? `/publisher?authors=${authorFilter}` : '/publisher'
    return client.get(url)
  },

  getTags() {
    return client.get('/tags')
  },

  getRandomCovers() {
    return client.get('/library/covers/random')
  },

  getDashboardStats() {
    return client.get('/dashboard/stats')
  }
}