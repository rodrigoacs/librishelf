import * as repo from '../repositories/proGrantRepository.js'
import * as entitlementRepository from '../repositories/entitlementRepository.js'
import { queueTrialNotices } from './billingEmailService.js'
import { httpError } from '../utils/httpError.js'
import STATUS from '../utils/statusCodes.js'
import logger from '../utils/logger.js'

/**
 * Teste grátis do Pro: 14 dias, ativado pela própria pessoa em Conta, um por
 * conta, sem cartão e sem cobrança automática. O fim vale na hora (a checagem
 * de Pro compara ends_at com agora); o job de expiração só troca o status.
 */
export const TRIAL_DAYS = 14

export async function activate(userId) {
  const endsAt = await repo.transaction(async (client) => {
    const user = await repo.lockUserForTrial(userId, client)
    if (!user) throw httpError('Usuário não encontrado.', STATUS.NOT_FOUND, 'USER_NOT_FOUND')

    if (user.pro_trial_used_at || user.has_trial) {
      throw httpError('Você já usou o teste grátis do Pro.', STATUS.CONFLICT, 'TRIAL_USED')
    }
    if (!user.email_verified_at) {
      throw httpError('Confirme seu e-mail para ativar o teste grátis.', STATUS.FORBIDDEN, 'EMAIL_NOT_VERIFIED_TRIAL')
    }
    // Com Pro ativo o teste seria desperdiçado: fica guardado para depois
    if (await entitlementRepository.hasPro(userId, client)) {
      throw httpError('Você já tem o Pro ativo.', STATUS.CONFLICT, 'TRIAL_ALREADY_PRO')
    }

    await repo.markTrialUsed(userId, client)
    const trial = await repo.insertTrial(userId, TRIAL_DAYS, client)
    // Aviso antes do fim e no fim (a varredura periódica usa as mesmas chaves)
    await queueTrialNotices({ entitlementId: Number(trial.id), endsAt: trial.ends_at }, client)
    return trial.ends_at
  })

  logger.info('Teste grátis ativado', { userId, endsAt })
  return { endsAt: new Date(endsAt).toISOString() }
}
