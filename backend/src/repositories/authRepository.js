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

async function markLogin(id) {
  await db.query(q.MARK_LOGIN, [id])
}

async function markSeen(id) {
  await db.query(q.MARK_SEEN, [id])
}

async function getSessionById(id) {
  const result = await db.query(q.FIND_SESSION_BY_ID, [id])
  return result.rows[0] || null
}

async function getPasswordHashById(id) {
  const result = await db.query(q.FIND_PASSWORD_HASH_BY_ID, [id])
  return result.rows[0] || null
}

async function getUserByEmail(email) {
  const result = await db.query(q.FIND_USER_BY_EMAIL, [email])
  return result.rows[0] || null
}

async function markEmailVerified(id) {
  const result = await db.query(q.MARK_EMAIL_VERIFIED, [id])
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

async function setPrivacy(id, { isPublic, showInCommunity, showActivity, allowIndexing }) {
  const result = await db.query(q.SET_PRIVACY, [id, isPublic, showInCommunity, showActivity, allowIndexing])
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

/** Outro usuário já usa este e-mail ou nome (sem diferenciar maiúsculas)? */
async function isEmailTaken(email, exceptId) {
  const result = await db.query(q.EMAIL_TAKEN, [email, exceptId])
  return result.rowCount > 0
}

async function isNameTaken(name, exceptId) {
  const result = await db.query(q.NAME_TAKEN, [name, exceptId])
  return result.rowCount > 0
}

async function updateEmail(id, email) {
  const result = await db.query(q.UPDATE_EMAIL, [id, email])
  return result.rows[0] ?? null
}

async function updateName(id, name) {
  const result = await db.query(q.UPDATE_NAME, [id, name])
  return result.rows[0] ?? null
}

export {
  isEmailTaken,
  isNameTaken,
  updateEmail,
  updateName,
  getUserByUsername,
  getUserByName,
  markLogin,
  markSeen,
  getUserById,
  getUserByEmail,
  markEmailVerified,
  getSessionById,
  getPasswordHashById,
  createUser,
  updatePassword,
  setPrivacy,
  deleteUser
}
