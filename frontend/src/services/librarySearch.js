import { ref } from 'vue'

/**
 * Lupa da barra do topo (celular): vai para a Biblioteca e põe o foco na
 * busca. O pedido fica guardado até a Biblioteca montar e consumir.
 */
export const librarySearchRequest = ref(0)

export function requestLibrarySearch() {
  librarySearchRequest.value++
}

let consumed = 0

/** true uma vez por pedido novo */
export function takeLibrarySearchRequest() {
  if (librarySearchRequest.value === consumed) return false
  consumed = librarySearchRequest.value
  return true
}
