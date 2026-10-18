import { db } from '../database/connection.js'
import { COMMUNITY_QUERIES as cq, PROFILE_QUERIES as pq } from '../database/queries.js'

export async function readersOfBook(bookId, userId) {
  const { rows } = await db.query(cq.READERS_OF_BOOK, [bookId, userId])
  return rows
}

export async function alsoHave(bookId, userId, limit) {
  const { rows } = await db.query(cq.ALSO_HAVE, [bookId, userId, limit])
  return rows
}

export async function commonBooks(viewerId, targetId, limit) {
  const { rows } = await db.query(cq.COMMON_BOOKS, [viewerId, targetId, limit])
  return { total: rows[0]?.total ?? 0, books: rows.map(({ total, ...book }) => book) }
}

export async function profileStats(userId) {
  const { rows } = await db.query(pq.STATS, [userId])
  return rows[0]
}

export async function findReaders(viewerId, text, limit) {
  const pattern = `%${text.replace(/[\\%_]/g, '\\$&')}%`
  const { rows } = await db.query(cq.FIND_READERS, [viewerId, text, pattern, limit])
  return rows
}

export async function recommendations(userId, limit) {
  const { rows } = await db.query(cq.RECOMMENDATIONS, [userId, limit])
  return rows
}

export async function sourceBook(bookId, userId) {
  const { rows } = await db.query(cq.SOURCE_BOOK, [bookId, userId])
  return rows[0] ?? null
}
