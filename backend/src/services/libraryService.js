import * as libraryRepository from '../repositories/libraryRepository.js'

async function getAllBooksByUser(userId, readState) {
  return await libraryRepository.getAllBooksByUser(userId, readState)
}

async function getBookById(id) {
  return await libraryRepository.getBookById(id)
}

async function addNewBook(bookData) {
  const existingBook = await libraryRepository.findBookByIsbn(bookData.isbn, bookData.user_id)
  if (existingBook) {
    throw new Error('ISBN already exists for this user.')
  }

  const newBookId = await libraryRepository.createBook(bookData)

  return newBookId
}

async function updateBookDetails(bookId, userId, bookData) {
  const bookOwner = await libraryRepository.getBookOwner(bookId)

  if (!bookOwner) {
    throw new Error('Book not found.')
  }

  if (bookOwner.user_id !== userId) {
    throw new Error('Permission denied.')
  }

  if (typeof bookData.tags === 'string') {
    bookData.tags = bookData.tags.split(',').map(tag => tag.trim())
  }

  return await libraryRepository.updateBook(bookId, bookData)
}

async function checkBookOwnership(bookId, userId) {
  const bookOwner = await libraryRepository.getBookOwner(bookId)

  if (!bookOwner) {
    throw new Error('Book not found.')
  }

  if (bookOwner.user_id !== userId) {
    throw new Error('Permission denied.')
  }

  return true
}

async function deleteBook(bookId, userId) {
  await checkBookOwnership(bookId, userId)

  await libraryRepository.deleteBookById(bookId)

  const uploadDir = path.join(process.cwd(), 'uploads')
  const filePath = path.join(uploadDir, `${bookId}.jpg`)
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath)
  }
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

export { getAllBooksByUser, getBookById, addNewBook, updateBookDetails, checkBookOwnership, deleteBook, markBookAsRead, markBookAsUnread }