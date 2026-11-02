import * as repo from '../repositories/entitlementRepository.js'
import { featureFlags, tierOf, FREE } from '../config/features.js'

const iso = date => (date ? new Date(date).toISOString() : null)

export function hasPro(userId, client) {
  return repo.hasPro(userId, client)
}

/** true se a pessoa pode usar o recurso agora (grátis, ou Pro ativo). */
export async function canUse(userId, feature, client) {
  if (tierOf(feature) === FREE) return true
  return repo.hasPro(userId, client)
}

/**
 * Plano para o /auth/me:
 * {
 *   pro,                         tem Pro agora
 *   current: { kind, source, startsAt, endsAt, lifetime, autoRenew, canceledAt } | null,
 *   endedAt,                     quando o último Pro acabou (só sem Pro ativo)
 *   features: { recurso: bool },
 *   trial: { available, usedAt }
 * }
 */
export async function planOf(userId) {
  const [entitlement, trial] = await Promise.all([repo.current(userId), repo.trialState(userId)])
  const pro = Boolean(entitlement)
  const endedAt = pro ? null : await repo.lastEnded(userId)

  return {
    pro,
    current: entitlement && {
      kind: entitlement.kind,
      source: entitlement.source,
      startsAt: iso(entitlement.starts_at),
      endsAt: iso(entitlement.ends_at),
      lifetime: entitlement.ends_at === null,
      autoRenew: entitlement.auto_renew,
      canceledAt: iso(entitlement.canceled_at)
    },
    endedAt: iso(endedAt),
    features: featureFlags(pro),
    trial: {
      // Um teste por conta: nem marcado em users, nem entitlement de teste
      available: Boolean(trial) && !trial.usedAt && !trial.hasTrial,
      usedAt: iso(trial?.usedAt)
    }
  }
}

/** ['vanguarda', …] na ordem em que foram concedidos */
export async function badgesOf(userId) {
  return (await repo.badges(userId)).map(row => row.badge)
}
