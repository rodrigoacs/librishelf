import * as authorRepository from '../repositories/authorRepository.js'
import { parseNameList } from '../utils/nameList.js'

// ?publishers=A&publishers=B (nome de editora pode ter vírgula: não separa).
async function getAuthorsByUserId(userId, publisherFilter) {
  const publishersList = parseNameList(publisherFilter)

  if (publishersList.length > 0) {
    return await authorRepository.getAuthorsByUserAndPublishers(userId, publishersList)
  }

  return await authorRepository.getAuthorsByUserId(userId)
}

export { getAuthorsByUserId }
