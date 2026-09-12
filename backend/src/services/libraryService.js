import * as libraryRepository from '../repositories/libraryRepository.js'
import * as authRepository from '../repositories/authRepository.js'
import STATUS from '../utils/statusCodes.js'
import { deleteBookCover } from '../utils/imageProcessor.js'

function normalizeIsbn(isbn) {
  if (typeof isbn !== 'string') return isbn ?? null
  const trimmed = isbn.trim()
  return trimmed ? trimmed : null
}

async function getPublicLibraryByUsername(username, query) {
  const user = await authRepository.getUserByUsername(username)

  if (!user) {
    const error = new Error('User not found.')
    error.status = STATUS.NOT_FOUND
    throw error
  }

  const booksData = await getAllBooksByUser(user.id, query)

  return {
    owner: user.name || user.username,
    ...booksData
  }
}

async function getAllBooksByUser(userId, query) {
  const filters = {
    search: query.search || undefined,
    readState: query.readState || 'all',
    readYear: query.readYear || 'all',
    author: query.author || undefined,
    publisher: query.publisher || undefined,
    tags: query.tags || undefined,
    page: query.page || 1,
    limit: query.limit || 20,
    sortField: query.sort || 'recent',
    sortOrder: query.order || 'desc'
  }

  return await libraryRepository.getAllBooksByUser(userId, filters)
}

async function getBookById(id) {
  return await libraryRepository.getBookById(id)
}

async function addNewBook(bookData) {
  bookData.isbn = normalizeIsbn(bookData.isbn)

  if (bookData.isbn) {
    const existingBook = await libraryRepository.findBookByIsbn(bookData.isbn, bookData.user_id)

    if (existingBook) {
      const error = new Error('ISBN already exists for this user.')
      error.status = STATUS.CONFLICT
      throw error
    }
  }

  const newBookId = await libraryRepository.createBook(bookData)

  return newBookId
}

async function updateBookDetails(bookId, userId, bookData) {
  const bookOwner = await libraryRepository.getBookOwner(bookId)

  if (!bookOwner) {
    const error = new Error('Book not found.')
    error.status = STATUS.NOT_FOUND
    throw error
  }

  if (bookOwner.user_id !== userId) {
    const error = new Error('Permission denied.')
    error.status = STATUS.FORBIDDEN
    throw error
  }

  if (typeof bookData.tags === 'string') {
    bookData.tags = bookData.tags.split(',').map(tag => tag.trim()).filter(Boolean)
  }

  if ('isbn' in bookData) {
    bookData.isbn = normalizeIsbn(bookData.isbn)
  }

  return await libraryRepository.updateBook(bookId, bookData)
}

async function checkBookOwnership(bookId, userId) {
  const bookOwner = await libraryRepository.getBookOwner(bookId)

  if (!bookOwner) {
    const error = new Error('Book not found.')
    error.status = STATUS.NOT_FOUND
    throw error
  }

  if (bookOwner.user_id !== userId) {
    const error = new Error('Permission denied.')
    error.status = STATUS.FORBIDDEN
    throw error
  }

  return true
}

async function deleteBook(bookId, userId) {
  await checkBookOwnership(bookId, userId)

  await libraryRepository.deleteBookById(bookId)

  await deleteBookCover(bookId)
}

async function markBookAsRead(bookId, userId) {
  await checkBookOwnership(bookId, userId)
  const readDate = new Date()
  return await libraryRepository.updateReadDate(bookId, readDate)
}

async function markBookAsUnread(bookId, userId) {
  await checkBookOwnership(bookId, userId)
  return await libraryRepository.updateReadDate(bookId, null)
}

export { getAllBooksByUser, getBookById, addNewBook, updateBookDetails, checkBookOwnership, deleteBook, markBookAsRead, markBookAsUnread, getPublicLibraryByUsername }