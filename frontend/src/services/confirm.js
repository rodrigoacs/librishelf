import { shallowRef } from 'vue'

/**
 * Pergunta de confirmação, no lugar do ConfirmationService do PrimeVue.
 * Mesma API:
 *
 *   const confirm = useConfirm()
 *   confirm.require({ message, header, icon, acceptLabel, rejectLabel,
 *                     acceptClass, rejectClass, accept, reject, onHide })
 *
 * O ConfirmHost (no App.vue) mostra a pergunta num diálogo.
 */
export const pendingConfirm = shallowRef(null)

export function requireConfirm(options) {
  // Uma pergunta por vez: a anterior conta como "não"
  if (pendingConfirm.value) settleConfirm(false)
  pendingConfirm.value = { ...options }
}

export function settleConfirm(accepted) {
  const current = pendingConfirm.value
  if (!current) return
  pendingConfirm.value = null
  if (accepted) current.accept?.()
  else current.reject?.()
  current.onHide?.()
}

export function useConfirm() {
  return { require: requireConfirm, close: () => settleConfirm(false) }
}
