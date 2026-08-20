import { db } from "../database/connection.js"
import { AUTHOR_QUERIES as q } from "../database/queries.js"

async function getAuthorsByUserId(userId) {
  const result = await db.query(q.GET_AUTHORS_BY_USER, [userId])
  return result.rows
}

async function getAuthorsByUserAndPublishers(userId, publishersList) {
  const result = await db.query(q.GET_AUTHORS_BY_USER_AND_PUBLISHERS, [userId, publishersList])
  return result.rows
}

export { getAuthorsByUserId, getAuthorsByUserAndPublishers }