import { db } from '../../database/connection.js'
import { JOB_QUERIES as q } from '../../database/queries.js'
import logger from '../../utils/logger.js'

/**
 * Marca como 'expired' o Pro que passou de ends_at. O acesso já acabou no
 * horário certo (a checagem compara ends_at com agora); isto deixa o status
 * coerente para o admin e para os avisos por e-mail (pacote dos e-mails).
 */
export async function expireEntitlements() {
  const { rows } = await db.query(q.EXPIRE_ENTITLEMENTS)
  if (rows.length) logger.info('Pro vencido marcado como expirado', { total: rows.length, kinds: countBy(rows, 'kind') })
  return { expired: rows.length }
}

function countBy(rows, key) {
  return rows.reduce((acc, row) => ({ ...acc, [row[key]]: (acc[row[key]] || 0) + 1 }), {})
}
