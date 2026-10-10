import { db } from '../database/connection.js'
import { SOCIAL_QUERIES as q } from '../database/queries.js'

export async function followStatus(followerId, followeeId) {
  const { rows } = await db.query(q.FOLLOW_STATUS, [followerId, followeeId])
  return rows[0]?.status ?? null
}

export async function requestFollow(followerId, followeeId) {
  await db.query(q.REQUEST_FOLLOW, [followerId, followeeId])
  return followStatus(followerId, followeeId)
}

/** Apaga o vínculo se o status estiver em `statuses`. → status apagado ou null. */
export async function deleteFollow(followerId, followeeId, statuses) {
  const { rows } = await db.query(q.DELETE_FOLLOW, [followerId, followeeId, statuses])
  return rows[0]?.status ?? null
}

export async function acceptFollow(followerId, followeeId) {
  const { rows } = await db.query(q.ACCEPT_FOLLOW, [followerId, followeeId])
  return rows.length > 0
}

export async function pendingCount(userId) {
  const { rows } = await db.query(q.PENDING_COUNT, [userId])
  return rows[0].count
}

export async function connections(userId) {
  const { rows } = await db.query(q.CONNECTIONS, [userId])
  return rows
}

export async function feed(userId, limit, offset) {
  const { rows } = await db.query(q.FEED, [userId, limit, offset])
  return rows
}
