import * as authorRepository from '../repositories/authorRepository.js'

async function getAuthorsByUserId(userId, publisherFilter) {
  if (publisherFilter) {
    const publishersList = publisherFilter.split(',').map(p => p.trim()).filter(Boolean)

    if (publishersList.length > 0) {
      return await authorRepository.getAuthorsByUserAndPublishers(userId, publishersList)
    }
  }

  return await authorRepository.getAuthorsByUserId(userId)
}

export { getAuthorsByUserId }