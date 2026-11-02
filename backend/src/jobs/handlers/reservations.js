import { db } from '../../database/connection.js'
import { JOB_QUERIES as q } from '../../database/queries.js'
import logger from '../../utils/logger.js'

/**
 * Devolve à oferta as vagas de fundador presas em checkouts que venceram sem
 * pagamento. Uma consulta só: a reserva vira 'released' e slots_used desce
 * na mesma instrução.
 */
export async function releaseReservations() {
  const { rows } = await db.query(q.RELEASE_RESERVATIONS)
  const released = rows.reduce((sum, row) => sum + row.released, 0)
  if (released) logger.info('Vagas de checkout vencido devolvidas', { offers: rows })
  return { released }
}
