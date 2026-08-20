import { db } from "../database/connection.js"
import { PUBLISHER_QUERIES as q } from "../database/queries.js"

async function getPublishersByUserId(userId) {
  const result = await db.query(q.GET_PUBLISHERS_BY_USER, [userId])
  return result.rows
}

async function getPublishersByUserAndAuthors(userId, authorsList) {
  const result = await db.query(q.GET_PUBLISHERS_BY_USER_AND_AUTHORS, [userId, authorsList])
  return result.rows
}

export { getPublishersByUserId, getPublishersByUserAndAuthors }