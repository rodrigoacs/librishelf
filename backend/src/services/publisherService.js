import * as publisherRepository from '../repositories/publisherRepository.js'

async function listPublishers(authorFilter) {
  if (authorFilter) {
    const authorsList = authorFilter.split(',').map(a => a.trim())

    if (authorsList.length > 0) {
      return await publisherRepository.getPublishersByAuthors(authorsList)
    }
  }

  return await publisherRepository.getAllPublishers()
}

export { listPublishers }