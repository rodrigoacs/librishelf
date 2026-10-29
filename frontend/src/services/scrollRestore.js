import { nextTick } from 'vue'

/**
 * Voltar para uma tela devolve a rolagem onde estava (Biblioteca, Início).
 *
 * O vue-router guarda a posição da janela de cada entrada do histórico, mas
 * aplicava antes de o conteúdo chegar: a página ainda estava curta e a
 * rolagem parava no topo. Agora:
 *   - a tela segura a rolagem enquanto carrega: const release = holdScroll()
 *     … release() depois do primeiro render com os dados;
 *   - o scrollBehavior (router/index.js) espera com waitForContent();
 *   - a Biblioteca guarda quantas páginas tinha carregado (rememberPages) e,
 *     ao voltar, carrega as mesmas de uma vez (recallPages).
 */

const MAX_WAIT_MS = 4000
// Páginas lembradas valem por meia hora; depois, volta a carregar só a primeira
const PAGES_MAX_AGE_MS = 30 * 60 * 1000

let holds = 0
let waiters = []

function flush() {
  if (holds > 0) return
  const pending = waiters
  waiters = []
  pending.forEach(resolve => resolve())
}

/** Segura a rolagem até release() (ou até MAX_WAIT_MS, para nunca travar). */
export function holdScroll() {
  holds++
  let released = false
  const timer = setTimeout(release, MAX_WAIT_MS)
  function release() {
    if (released) return
    released = true
    clearTimeout(timer)
    holds = Math.max(0, holds - 1)
    // Um quadro depois do render: o navegador já calculou a altura nova
    requestAnimationFrame(flush)
  }
  return release
}

/** Resolve quando nenhuma tela está segurando a rolagem. */
export function waitForContent() {
  return new Promise(resolve => {
    nextTick(() => {
      if (holds === 0) resolve()
      else waiters.push(resolve)
    })
  })
}

/** Esta entrada do histórico foi aberta pelo voltar/avançar (tem rolagem guardada)? */
export function isHistoryReturn() {
  try {
    return Boolean(window.history.state?.scroll)
  } catch {
    return false
  }
}

const pages = new Map()

/** Chave da tela: caminho + query em ordem, sem o livro aberto (?book=). */
export function routeKey(route) {
  const query = { ...route.query }
  delete query.book
  const parts = Object.keys(query).sort().map(key => `${key}=${JSON.stringify(query[key])}`)
  return `${route.path}?${parts.join('&')}`
}

export function rememberPages(key, count) {
  if (count > 1) pages.set(key, { count, at: Date.now() })
  else pages.delete(key)
}

export function recallPages(key) {
  const saved = pages.get(key)
  if (!saved || Date.now() - saved.at > PAGES_MAX_AGE_MS) return 1
  return saved.count
}
