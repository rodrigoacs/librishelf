import { db } from "../database/connection.js"
import { PUBLISHER_QUERIES as q } from "../database/queries.js"

async function getAllPublishers() {
  const result = await db.query(q.GET_ALL_PUBLISHERS)
  return result.rows
}

async function getPublishersByAuthors(authorsList) {
  const result = await db.query(q.GET_PUBLISHERS_BY_AUTHOR, [authorsList])
  return result.rows
}

export { getAllPublishers, getPublishersByAuthors }