import { ref } from 'vue'
import api from './api.js'

/**
 * Número de pedidos para seguir esperando resposta (badge do menu).
 * Atualiza no máximo uma vez por minuto ao navegar; a tela Comunidade
 * força a atualização depois de aceitar/recusar.
 */
const REFRESH_MS = 60_000

export const pendingRequests = ref(0)
let checkedAt = 0

export async function refreshPendingRequests({ force = false } = {}) {
  if (!force && Date.now() - checkedAt < REFRESH_MS) return pendingRequests.value
  checkedAt = Date.now()
  try {
    const { count } = await api.getPendingRequestsCount()
    pendingRequests.value = count
  } catch {
    // Sem badge não quebra nada.
  }
  return pendingRequests.value
}

export function resetPendingRequests() {
  pendingRequests.value = 0
  checkedAt = 0
}
