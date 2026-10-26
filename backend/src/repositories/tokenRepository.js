import { db } from '../database/connection.js'
import { TOKEN_QUERIES as q } from '../database/queries.js'

/** Cria um link novo e invalida os anteriores do mesmo tipo (só o último vale). */
export async function replaceToken(userId, purpose, tokenHash, expiresAt) {
  const client = await db.connect()
  try {
    await client.query('BEGIN')
    await client.query(q.DELETE_UNUSED, [userId, purpose])
    await client.query(q.INSERT, [userId, purpose, tokenHash, expiresAt])
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

/** Marca como usado (uma vez só, se ainda válido) e devolve o user_id; senão null. */
export async function consumeToken(tokenHash, purpose) {
  const { rows } = await db.query(q.CONSUME, [tokenHash, purpose])
  return rows[0]?.user_id ?? null
}

/** Limpeza: links vencidos ou usados há mais de 7 dias. */
/** Links de e-mail velhos e sessões encerradas já vencidas. → linhas removidas */
export async function deleteStale() {
  const { rowCount } = await db.query(q.DELETE_STALE)
  const { rowCount: revoked } = await db.query(q.DELETE_EXPIRED_REVOCATIONS)
  return rowCount + revoked
}
