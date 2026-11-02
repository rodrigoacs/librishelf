import { cleanup } from '../queue.js'
import logger from '../../utils/logger.js'

// Jobs terminados ficam 30 dias (dá para ver o que rodou); falhados ficam até
// alguém olhar.
export const KEEP_DONE_DAYS = 30

export async function cleanupJobs() {
  const removed = await cleanup(KEEP_DONE_DAYS)
  if (removed) logger.info('Jobs antigos removidos', { removed })
  return { removed }
}
