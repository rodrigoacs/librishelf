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

async function getSessionById(id) {
  const result = await db.query(q.FIND_SESSION_BY_ID, [id])
  return result.rows[0] || null
}

async function getPasswordHashById(id) {
  const result = await db.query(q.FIND_PASSWORD_HASH_BY_ID, [id])
  return result.rows[0] || null
}

async function createUser(username, hashedPassword, email) {
  const result = await db.query(q.CREATE_USER, [username, hashedPassword, email])
  return result.rows[0]
}

async function updatePassword(id, hashedPassword) {
  const result = await db.query(q.UPDATE_PASSWORD, [id, hashedPassword])
  return result.rows[0] || null
}

async function setPrivacy(id, { isPublic, showInCommunity, showActivity }) {
  const result = await db.query(q.SET_PRIVACY, [id, isPublic, showInCommunity, showActivity])
  return result.rows[0] || null
}

/**
 * Remove o usuário e devolve os ids dos livros que ele tinha, para o service
 * apagar as capas do disco. Livros e vínculos saem pelo ON DELETE CASCADE.
 */
async function deleteUser(id) {
  const client = await db.connect()

  try {
    await client.query('BEGIN')
    const { rows } = await client.query(q.LIST_BOOK_IDS_BY_USER, [id])
    await client.query(q.DELETE_USER, [id])
    await client.query('COMMIT')
    return rows.map(row => row.id)
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

export {
  getUserByUsername,
  getUserByName,
  getUserById,
  getSessionById,
  getPasswordHashById,
  createUser,
  updatePassword,
  setPrivacy,
  deleteUser
}
