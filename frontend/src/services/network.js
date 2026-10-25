import { ref, computed } from 'vue'

/**
 * Estado da conexão para o aviso "sem conexão" e o modo leitura.
 *   - navigator.onLine e os eventos online/offline do navegador;
 *   - respostas que vieram do cache do service worker (X-Librishelf-Offline)
 *     ou falhas de rede nas chamadas da API (o navegador às vezes acha que
 *     está online com o Wi-Fi conectado e sem internet).
 */
const browserOnline = ref(typeof navigator === 'undefined' ? true : navigator.onLine !== false)
const apiUnreachable = ref(false)

export const isOffline = computed(() => !browserOnline.value || apiUnreachable.value)

/** A API não respondeu (ou a resposta veio do cache). */
export function markApiUnreachable() {
  apiUnreachable.value = true
}

/** Uma resposta de verdade da API chegou. */
export function markApiReachable() {
  apiUnreachable.value = false
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    browserOnline.value = true
    apiUnreachable.value = false
  })
  window.addEventListener('offline', () => {
    browserOnline.value = false
  })
}
