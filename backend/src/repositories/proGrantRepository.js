import { db } from '../database/connection.js'
import { PRO_GRANT_QUERIES as q } from '../database/queries.js'

/** Abre uma transação e devolve o cliente; o chamador faz COMMIT/ROLLBACK. */
export async function transaction(work) {
  const client = await db.connect()
  try {
    await client.query('BEGIN')
    const result = await work(client)
    await client.query('COMMIT')
    return result
  } catch (err) {
    await client.query('ROLLBACK').catch(() => { })
    throw err
  } finally {
    client.release()
  }
}

export async function eligibility(userId, client = db) {
  const { rows } = await client.query(q.ELIGIBILITY, [userId])
  return rows[0] || null
}

export async function offer(code, client = db) {
  const { rows } = await client.query(q.OFFER, [code])
  return rows[0] || null
}

/** Dentro de transação: trava a linha da oferta até o COMMIT. */
export async function lockOffer(code, client) {
  const { rows } = await client.query(q.OFFER_LOCK, [code])
  return rows[0] || null
}

export async function takeSlot(code, client) {
  const { rows } = await client.query(q.TAKE_SLOT, [code])
  return rows[0].slots_used
}

/** → id do entitlement, ou null se a pessoa já tinha a Vanguarda */
export async function insertVanguarda(userId, note, client) {
  const { rows } = await client.query(q.INSERT_VANGUARDA, [userId, note])
  return rows[0]?.id ?? null
}

export async function insertBadge(userId, badge, client) {
  await client.query(q.INSERT_BADGE, [userId, badge])
}

export async function lockUserForTrial(userId, client) {
  const { rows } = await client.query(q.TRIAL_LOCK_USER, [userId])
  return rows[0] || null
}

export async function markTrialUsed(userId, client) {
  await client.query(q.MARK_TRIAL_USED, [userId])
}

export async function insertTrial(userId, days, client) {
  const { rows } = await client.query(q.INSERT_TRIAL, [userId, days])
  return rows[0].ends_at
}
