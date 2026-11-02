import { db } from '../database/connection.js'
import { ENTITLEMENT_QUERIES as q } from '../database/queries.js'

/** `client` opcional: dentro de uma transação, use o mesmo cliente. */
export async function hasPro(userId, client = db) {
  const { rows } = await client.query(q.HAS_PRO, [userId])
  return rows[0].pro
}

export async function current(userId, client = db) {
  const { rows } = await client.query(q.CURRENT, [userId])
  return rows[0] || null
}

export async function lastEnded(userId, client = db) {
  const { rows } = await client.query(q.LAST_ENDED, [userId])
  return rows[0]?.ended_at ?? null
}

export async function trialState(userId, client = db) {
  const { rows } = await client.query(q.TRIAL, [userId])
  if (!rows[0]) return null
  return { usedAt: rows[0].pro_trial_used_at, hasTrial: rows[0].has_trial }
}

export async function badges(userId, client = db) {
  const { rows } = await client.query(q.BADGES, [userId])
  return rows
}
