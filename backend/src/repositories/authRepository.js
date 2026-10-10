import { db } from "../database/connection.js"
import { AUTH_QUERIES as q } from "../database/queries.js"

async function getUserByUsername(username) {
  const result = await db.query(q.FIND_USER_BY_USERNAME, [username])
  return result.rows[0] || null
}

// Só pelo nome de usuário (sem e-mail): usado nas rotas públicas, para que
// /public/u/<e-mail> não sirva de oráculo de "esse e-mail tem conta?".
async function getUserByName(name) {
  const result = await db.query(q.FIND_USER_BY_NAME, [name])
  return result.rows[0] || null
}

async function getUserById(id) {
  const result = await db.query(q.FIND_USER_BY_ID, [id])
  return result.rows[0] || null
}

async function createUser(username, hashedPassword, email) {
  const result = await db.query(q.CREATE_USER, [username, hashedPassword, email])
  return result.rows[0]
}

export { getUserByUsername, getUserByName, getUserById, createUser }