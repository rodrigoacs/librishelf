import { ref } from 'vue'
import { PHONE_QUERY } from '../utils/motion.js'

/**
 * true abaixo de 640 px (celular), acompanhando giro de tela e redimensionar.
 * Um ouvinte só para o app inteiro.
 */
const phone = ref(false)
let installed = false

function install() {
  if (installed || typeof window === 'undefined' || !window.matchMedia) return
  installed = true
  const query = window.matchMedia(PHONE_QUERY)
  phone.value = query.matches
  query.addEventListener?.('change', event => { phone.value = event.matches })
}

export function useIsPhone() {
  install()
  return phone
}
