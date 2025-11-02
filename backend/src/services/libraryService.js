import * as libraryRepository from '../repositories/libraryRepository.js'

async function getAllBooksByUser(userId, readState) {
  return await libraryRepository.getAllBooksByUser(userId, readState)
}

async function getBookById(id) {
  return await libraryRepository.getBookById(id)
}

export { getAllBooksByUser, getBookById }