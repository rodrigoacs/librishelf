import { TERMS_VERSION } from '../config/terms.js'
import * as repo from '../repositories/termsRepository.js'
import { httpError } from '../utils/httpError.js'
import STATUS from '../utils/statusCodes.js'

/**
 * Aceite dos Termos de Uso e da Política de Privacidade (pacote 35).
 *
 * - Cadastro: aceite obrigatório, gravado junto com a conta (authService).
 * - Versão nova (config/terms.js): /auth/me devolve accepted: false e o app
 *   pede o aceite antes de seguir; POST /auth/me/terms registra.
 * - Checkout: recusado sem o aceite da versão vigente (assertAccepted).
 */

const iso = date => (date ? new Date(date).toISOString() : null)

/** → { version, accepted, acceptedAt } */
export async function statusOf(userId) {
  const acceptedAt = await repo.acceptedAt(userId, TERMS_VERSION)
  return { version: TERMS_VERSION, accepted: Boolean(acceptedAt), acceptedAt: iso(acceptedAt) }
}

/**
 * `version` é a que o app mostrou. Se o servidor já está em outra (deploy no
 * meio da leitura), recusa: o aceite precisa ser do texto vigente.
 */
export async function accept(userId, version) {
  if (typeof version !== 'string' || !version) {
    throw httpError('Informe a versão dos termos.', STATUS.BAD_REQUEST, 'TERMS_VERSION_REQUIRED')
  }
  if (version !== TERMS_VERSION) {
    throw httpError('Os termos mudaram desde que a página foi aberta. Recarregue e leia a versão nova.', STATUS.CONFLICT, 'TERMS_OUTDATED', { version: TERMS_VERSION })
  }
  await repo.accept(userId, TERMS_VERSION)
  return statusOf(userId)
}

/** Para o checkout, dentro da transação dele. */
export async function assertAccepted(userId, client) {
  if (!(await repo.acceptedAt(userId, TERMS_VERSION, client))) {
    throw httpError('Aceite os Termos de Uso para continuar.', STATUS.FORBIDDEN, 'TERMS_NOT_ACCEPTED')
  }
}
