import * as authorRepository from '../repositories/authorRepository.js'

async function getAuthorsByUserId(userId, publisherFilter) {
  // ?x=a&x=b chega como array; aceita os dois formatos em vez de estourar 500.
  const rawFilter = Array.isArray(publisherFilter) ? publisherFilter.join(',') : publisherFilter

  if (typeof rawFilter === 'string' && rawFilter) {
    const publishersList = rawFilter.split(',').map(item => item.trim()).filter(Boolean)

    if (publishersList.length > 0) {
      return await authorRepository.getAuthorsByUserAndPublishers(userId, publishersList)
    }
  }

  return await authorRepository.getAuthorsByUserId(userId)
}

export { getAuthorsByUserId }