import { db } from "../database/connection.js"
import { AUTHOR_QUERIES as q } from "../database/queries.js"

async function getAllAuthors() {
  const result = await db.query(q.GET_ALL_AUTHORS)
  return result.rows
}

async function getAuthorsByPublishers(publishersList) {
  const result = await db.query(q.GET_AUTHORS_BY_PUBLISHER, [publishersList])
  return result.rows
}

async function getAuthorsByUserId(userId) {
  const result = await db.query(q.GET_AUTHORS_BY_USER, [userId])
  return result.rows
}

export { getAllAuthors, getAuthorsByPublishers, getAuthorsByUserId }