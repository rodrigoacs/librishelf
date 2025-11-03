import { db } from "../database/connection.js"

async function getUserByUsername(username) {
  const result = await db.query("SELECT * FROM users WHERE username = $1", [username])
  return result.rows[0]
}

async function createUser(userData) {
  const result = await db.query("INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id, username, role", [userData.username, userData.password_hash])
  return result.rows[0]
}

export { getUserByUsername, createUser }
