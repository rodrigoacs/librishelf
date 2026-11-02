import { cleanup } from '../queue.js'
import { deleteStale as deleteStaleTokens } from '../../repositories/tokenRepository.js'
import { purge as purgeEmailSends } from '../../services/emailQuota.js'
import logger from '../../utils/logger.js'

// Jobs terminados ficam 30 dias (dá para ver o que rodou); falhados ficam até
// alguém olhar. A dedupe_key dos e-mails some junto: as janelas dos avisos
// (billingEmailService) são todas menores que isso.
export const KEEP_DONE_DAYS = 30

export async function cleanupJobs() {
  const removed = await cleanup(KEEP_DONE_DAYS)
  // Registro do limite de envio: só as últimas 24 h importam
  const emailSends = await purgeEmailSends()
  if (removed || emailSends) logger.info('Jobs antigos removidos', { removed, emailSends })
  return { removed, emailSends }
}

/** tokens.cleanup (diário): links de e-mail vencidos ou usados. Antes era um setInterval no server.js. */
export async function cleanupTokens() {
  const removed = await deleteStaleTokens()
  if (removed) logger.info('Links de e-mail antigos removidos', { removed })
  return { removed }
}
