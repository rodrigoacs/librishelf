import { reactive } from 'vue'

/**
 * Avisos rápidos (toast), no lugar do ToastService do PrimeVue. Mesma API:
 *
 *   const toast = useToast()
 *   toast.add({ severity: 'success' | 'info' | 'warn' | 'error', summary, detail, life })
 *
 * O ToastHost (no App.vue) mostra a fila.
 */
const DEFAULT_LIFE = 4000
let nextId = 1

export const toasts = reactive([])

export function removeToast(id) {
  const index = toasts.findIndex(item => item.id === id)
  if (index !== -1) toasts.splice(index, 1)
}

export function addToast({ severity = 'info', summary = '', detail = '', life = DEFAULT_LIFE } = {}) {
  const id = nextId++
  toasts.push({ id, severity, summary, detail, life })
  // No máximo 4 na tela: o mais antigo sai
  while (toasts.length > 4) toasts.shift()
  return id
}

export function useToast() {
  return { add: addToast, remove: removeToast }
}
