import * as publisherRepository from '../repositories/publisherRepository.js'

async function getPublishersByUserId(userId, authorFilter) {
  // ?x=a&x=b chega como array; aceita os dois formatos em vez de estourar 500.
  const rawFilter = Array.isArray(authorFilter) ? authorFilter.join(',') : authorFilter

  if (typeof rawFilter === 'string' && rawFilter) {
    const authorsList = rawFilter.split(',').map(item => item.trim()).filter(Boolean)

    if (authorsList.length > 0) {
      return await publisherRepository.getPublishersByUserAndAuthors(userId, authorsList)
    }
  }

  return await publisherRepository.getPublishersByUserId(userId)
}

export { getPublishersByUserId }