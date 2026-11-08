import { db } from '../database/connection.js'
import { TERMS_QUERIES as q } from '../database/queries.js'

export async function accept(userId, version) {
  await db.query(q.ACCEPT, [userId, version])
}

/** Data do aceite daquela versão, ou null. `client`: a transação de quem chama. */
export async function acceptedAt(userId, version, client = db) {
  const { rows: [row] } = await client.query(q.ACCEPTED_AT, [userId, version])
  return row?.accepted_at ?? null
}
