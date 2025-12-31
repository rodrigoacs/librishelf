import { db } from "../database/connection.js"
import { TAG_QUERIES as q } from "../database/queries.js"

export async function getTagsByUserId(userId) {
  const result = await db.query(q.GET_TAGS_BY_USER, [userId])
  return result.rows
}