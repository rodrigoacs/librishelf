import { isPhone } from '../utils/motion.js'

/**
 * Voltar do celular fecha o que está por cima (folha, gaveta) antes de sair
 * da tela, como num app. Ao abrir, entra uma posição extra no histórico com
 * a mesma URL; o voltar a consome e fecha o de cima.
 *
 * O ouvinte de popstate é de captura e para a propagação quando o voltar é
 * nosso: o vue-router não vê nada e a tela não muda. Fechando por outro
 * caminho (X, Esc, puxar), a posição extra é consumida com history.back()
 * e esse popstate também é engolido aqui.
 *
 * Só no celular (abaixo de 640 px): no desktop nada muda.
 */
const stack = []
let swallow = 0
let swallowed = []
let seq = 0
let installed = false

function onPopState(event) {
  if (swallow > 0) {
    swallow--
    event.stopImmediatePropagation()
    swallowed.shift()?.()
    return
  }
  const top = stack[stack.length - 1]
  if (!top) return
  // Só é nosso se o estado para onde voltamos não tem a marca da entrada de cima
  if (event.state?.__overlay === top.id) return
  event.stopImmediatePropagation()
  stack.pop()
  top.onBack()
}

function install() {
  if (installed || typeof window === 'undefined') return
  installed = true
  window.addEventListener('popstate', onPopState, true)
}

/**
 * Registra algo aberto por cima. Devolve release(): chame ao fechar por
 * qualquer caminho que não seja o voltar (consome a posição extra). A
 * Promise de release() resolve quando o histórico já voltou: quem vai
 * navegar logo em seguida (item do menu) espera por ela, senão a posição
 * extra ficaria no meio do histórico e o voltar pararia nela.
 */
export function pushOverlay(onBack) {
  if (typeof window === 'undefined' || !isPhone()) return () => Promise.resolve()
  install()
  const id = ++seq
  const entry = { id, onBack }
  stack.push(entry)
  window.history.pushState({ ...(window.history.state || {}), __overlay: id }, '')
  return function release() {
    const index = stack.indexOf(entry)
    if (index === -1) return Promise.resolve() // já saiu pelo voltar
    stack.splice(index, 1)
    if (window.history.state?.__overlay !== id) return Promise.resolve()
    swallow++
    return new Promise(resolve => {
      swallowed.push(resolve)
      // Rede de segurança: o popstate não veio (aba em segundo plano)
      setTimeout(resolve, 400)
      window.history.back()
    })
  }
}

/** Para testes */
export function overlayDepth() {
  return stack.length
}
