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

/**
 * "Descartar alterações?" antes de fechar um formulário que mudou. Resolve
 * true para descartar (fechar) e false para continuar editando. Mesmo
 * diálogo das outras confirmações; o foco começa em "Continuar editando".
 *
 *   if (dirty && !(await confirmDiscard(t))) return
 */
export function confirmDiscard(t) {
  return new Promise(resolve => {
    requireConfirm({
      header: t('common.discardTitle'),
      message: t('common.discardMessage'),
      icon: 'pi pi-exclamation-triangle',
      acceptClass: 'btn-danger',
      rejectClass: 'btn-text btn-secondary',
      acceptLabel: t('common.discard'),
      rejectLabel: t('common.keepEditing'),
      accept: () => resolve(true),
      reject: () => resolve(false),
      onHide: () => resolve(false)
    })
  })
}
