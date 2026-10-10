import * as publisherRepository from '../repositories/publisherRepository.js'
import { parseNameList } from '../utils/nameList.js'

// ?authors=A&authors=B (nome de autor pode ter vírgula: não separa).
async function getPublishersByUserId(userId, authorFilter) {
  const authorsList = parseNameList(authorFilter)

  if (authorsList.length > 0) {
    return await publisherRepository.getPublishersByUserAndAuthors(userId, authorsList)
  }

  return await publisherRepository.getPublishersByUserId(userId)
}

export { getPublishersByUserId }
