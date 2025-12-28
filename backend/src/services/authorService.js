import * as authorRepository from '../repositories/authorRepository.js'

async function listAuthors(publisherFilter) {
  if (publisherFilter) {
    const publishersList = publisherFilter.split(',').map(p => p.trim())

    if (publishersList.length > 0) {
      return await authorRepository.getAuthorsByPublishers(publishersList)
    }
  }

  return await authorRepository.getAllAuthors()
}

export { listAuthors }