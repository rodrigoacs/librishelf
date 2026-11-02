import * as repo from '../repositories/proGrantRepository.js'
import logger from '../utils/logger.js'

/**
 * Vanguarda: as 100 primeiras contas com registro efetivo (e-mail confirmado
 * E pelo menos 10 livros) ganham Pro vitalício (ends_at nulo = enquanto o
 * serviço existir) e o selo "vanguarda".
 *
 * Roda nos dois gatilhos — confirmar o e-mail e cadastrar/importar livros —
 * e decide dentro de uma transação com a linha da oferta 'vanguarda' travada,
 * então a conta 101 é recusada mesmo com pedidos simultâneos. Desligar a
 * oferta (active = false) ou fechar a janela (ends_at) encerra a Vanguarda.
 * Excluir livros depois não tira o que foi concedido.
 */
export const OFFER_CODE = 'vanguarda'
export const BADGE = 'vanguarda'
export const MIN_BOOKS = 10

const isOpen = offer => Boolean(offer)
  && offer.active
  && offer.in_window
  && (offer.slots_total === null || offer.slots_used < offer.slots_total)

const isEffective = row => Boolean(row) && row.verified && row.books >= MIN_BOOKS

/**
 * → { status: 'granted', slot } | 'already' | 'not_eligible' | 'closed'
 * Lança em erro de banco; os gatilhos usam checkSafely().
 */
export async function check(userId) {
  // Checagens baratas fora da transação: a grande maioria das chamadas para aqui
  const before = await repo.eligibility(userId)
  if (before?.has_vanguarda) return { status: 'already' }
  if (!isEffective(before)) return { status: 'not_eligible' }
  if (!isOpen(await repo.offer(OFFER_CODE))) return { status: 'closed' }

  return repo.transaction(async (client) => {
    const offer = await repo.lockOffer(OFFER_CODE, client)
    if (!isOpen(offer)) return { status: 'closed' }

    // De novo, agora com a vaga travada (outra requisição pode ter concedido)
    const row = await repo.eligibility(userId, client)
    if (row?.has_vanguarda) return { status: 'already' }
    if (!isEffective(row)) return { status: 'not_eligible' }

    const slot = offer.slots_used + 1
    const entitlementId = await repo.insertVanguarda(userId, `Vanguarda nº ${slot}`, client)
    if (!entitlementId) return { status: 'already' }

    await repo.insertBadge(userId, BADGE, client)
    await repo.takeSlot(OFFER_CODE, client)
    logger.info('Vanguarda concedida', { userId, slot })
    return { status: 'granted', slot }
  })
}

/** Para os gatilhos: nunca derruba o cadastro do livro nem a confirmação. */
export async function checkSafely(userId) {
  try {
    return await check(userId)
  } catch (err) {
    logger.error('Falha ao verificar a Vanguarda', { userId, message: err.message })
    return { status: 'error' }
  }
}
