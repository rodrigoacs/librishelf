import * as publisherRepository from '../repositories/publisherRepository.js'

async function getPublishersByUserId(userId, authorFilter) {
  if (authorFilter) {
    const authorsList = authorFilter.split(',').map(a => a.trim()).filter(Boolean)

    if (authorsList.length > 0) {
      return await publisherRepository.getPublishersByUserAndAuthors(userId, authorsList)
    }
  }

  return await publisherRepository.getPublishersByUserId(userId)
}

export { getPublishersByUserId }