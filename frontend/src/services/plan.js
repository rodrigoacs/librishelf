import { computed } from 'vue'
import { currentUser, loadSession } from './session.js'
import { PRO_FEATURES_READY } from '../config/plan.js'

/**
 * Plano da pessoa, a partir do /auth/me (user.plan). Quem decide é o
 * servidor; aqui só se mostra ou esconde.
 *
 *   const { plan, hasPro, canUse, refresh } = usePlan()
 *   canUse('collector')  → pode escrever nesse recurso agora
 */
export const plan = computed(() => currentUser.value?.plan ?? null)
export const hasPro = computed(() => Boolean(plan.value?.pro))

export function canUse(feature) {
  const features = plan.value?.features
  return Boolean(features && features[feature])
}

/** O recurso Pro já existe no app (os que faltam aparecem como "em breve"). */
export function isReady(feature) {
  return PRO_FEATURES_READY.includes(feature)
}

export function refresh() {
  return loadSession({ force: true })
}

export function usePlan() {
  return { plan, hasPro, canUse, isReady, refresh }
}

export const isProRequired = error => error?.code === 'PRO_REQUIRED'

/**
 * A API recusou com PRO_REQUIRED: o Pro pode ter acabado com a tela aberta.
 * Recarrega o /auth/me (no máximo uma vez a cada poucos segundos) para os
 * avisos Pro aparecerem no lugar certo. A mensagem do erro fica com quem
 * chamou, como qualquer outro erro.
 */
const REFRESH_GAP_MS = 5000
let lastRefresh = 0

export function onProRequired() {
  if (Date.now() - lastRefresh < REFRESH_GAP_MS) return
  lastRefresh = Date.now()
  refresh().catch(() => { })
}
