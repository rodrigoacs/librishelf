import { nextTick } from 'vue'
import { MOTION, canAnimate, navDirection, pickTransition } from '../utils/motion.js'
import { bookIdFromQuery } from '../utils/bookQuery.js'

/**
 * Troca de tela com a View Transitions API, só no celular (utils/motion.js →
 * canAnimate) e só onde o navegador tem a API. Sem ela (iOS antes do 18,
 * movimento reduzido, desktop) a tela troca na hora, como antes.
 *
 * A navegação não espera a animação: o callback libera o router logo no
 * começo e só aguarda a tela nova desenhar (no máximo MAX_WAIT ms). Uma
 * navegação nova no meio pula a animação em curso (skipTransition).
 *
 * Capa que viaja (book-open/book-close): a capa do card e a do livro aberto
 * recebem view-transition-name "book-cover" na hora, uma de cada vez. O
 * grupo dessa capa é animado aqui só com transform (o CSS desliga a
 * animação padrão, que mexe em width/height).
 */
const MAX_WAIT = 350
const COVER = 'book-cover'

let current = null
let lastPosition = null
let sharedFrom = null

/** O card tocado avisa qual capa vai viajar (antes do router.push). */
export function shareCoverFrom(element) {
  sharedFrom = element || null
}

function supported() {
  return typeof document !== 'undefined' && typeof document.startViewTransition === 'function'
}

function position() {
  const value = window.history.state?.position
  return Number.isFinite(value) ? value : null
}

function cardCover(bookId) {
  if (!bookId) return null
  const card = document.querySelector(`[data-book-id="${CSS.escape(String(bookId))}"] [data-cover]`)
  if (!card) return null
  const rect = card.getBoundingClientRect()
  // Fora da tela não vale a pena viajar: some e aparece
  return rect.bottom > 0 && rect.top < window.innerHeight ? card : null
}

function openBookCover() {
  const dialogs = document.querySelectorAll('dialog[open] [data-shared-cover]')
  return dialogs[dialogs.length - 1] || null
}

function name(element, value) {
  if (element) element.style.viewTransitionName = value
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// Espera algo aparecer no DOM sem depender de requestAnimationFrame (que
// não roda enquanto a View Transition segura a pintura)
async function waitFor(find, limit = MAX_WAIT) {
  const start = performance.now()
  for (;;) {
    const found = find()
    if (found || performance.now() - start > limit) return found
    await wait(16)
  }
}

function animateCover(fromRect, toRect, kind) {
  if (!fromRect || !toRect || !toRect.width || !toRect.height) return
  const sx = fromRect.width / toRect.width
  const sy = fromRect.height / toRect.height
  const from = `translate(${fromRect.left}px, ${fromRect.top}px) scale(${sx}, ${sy})`
  const to = `translate(${toRect.left}px, ${toRect.top}px)`
  document.documentElement.animate(
    { transform: [from, to] },
    {
      duration: MOTION.long,
      easing: kind === 'book-open' ? MOTION.easeEnter : MOTION.easeStandard,
      fill: 'both',
      pseudoElement: `::view-transition-group(${COVER})`
    }
  )
}

export function installViewTransitions(router) {
  router.afterEach(() => {
    lastPosition = position()
  })

  router.beforeResolve((to, from) => {
    if (!supported() || !canAnimate() || !from.matched.length) {
      sharedFrom = null
      return true
    }

    const now = position()
    // popstate: o histórico já está na posição de destino; push: ainda não
    const direction = now !== null && lastPosition !== null && now !== lastPosition
      ? navDirection(lastPosition, now)
      : (to.redirectedFrom ? 'swap' : 'forward')

    const fromBook = from.name === 'library' ? bookIdFromQuery(from.query) : null
    const toBook = to.name === 'library' ? bookIdFromQuery(to.query) : null
    const kind = pickTransition({
      fromPath: from.path,
      toPath: to.path,
      fromBook,
      toBook,
      direction,
      fromDepth: from.meta.depth || 1,
      toDepth: to.meta.depth || 1
    })
    const shared = sharedFrom
    sharedFrom = null
    if (!kind) return true

    current?.skipTransition()

    let oldCover = null
    if (kind === 'book-open') oldCover = shared || cardCover(toBook)
    if (kind === 'book-close') oldCover = openBookCover()
    const fromRect = oldCover?.getBoundingClientRect()
    name(oldCover, COVER)

    return new Promise(resolve => {
      let newCover = null
      let toRect = null
      document.documentElement.dataset.nav = kind

      let transition
      try {
        transition = document.startViewTransition(async () => {
          name(oldCover, '')
          resolve(true)
          await nextTick()
          if (kind === 'book-open') newCover = await waitFor(openBookCover)
          else if (kind === 'book-close') newCover = await waitFor(() => cardCover(fromBook), 120)
          else await nextTick()
          if (oldCover && newCover) {
            name(newCover, COVER)
            toRect = newCover.getBoundingClientRect()
          }
        })
      } catch {
        delete document.documentElement.dataset.nav
        name(oldCover, '')
        resolve(true)
        return
      }

      current = transition
      transition.ready
        .then(() => { if (newCover) animateCover(fromRect, toRect, kind) })
        .catch(() => {})
      transition.finished
        .catch(() => {})
        .finally(() => {
          name(newCover, '')
          name(oldCover, '')
          if (current === transition) {
            current = null
            delete document.documentElement.dataset.nav
          }
        })
    })
  })
}
