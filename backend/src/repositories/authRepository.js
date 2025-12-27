import { db } from "../database/connection.js"
import { AUTH_QUERIES as q } from "../database/queries.js"

async function findUserByUsername(username) {
  const result = await db.query(q.FIND_USER_BY_USERNAME, [username])
  return result.rows[0] || null
}

async function createUser(username, hashedPassword) {
  const result = await db.query(q.CREATE_USER, [username, hashedPassword])
  return result.rows[0]
}

export { findUserByUsername, createUser }