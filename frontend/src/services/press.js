import { isPhone, prefersReducedMotion } from '../utils/motion.js'

/**
 * "Afundar ao tocar" no celular: marca [data-pressed] no elemento tocável
 * logo no pointerdown (o :active do iOS só chega depois, e no Android some
 * se o dedo mexer um pouco). Sai ao soltar, cancelar (o navegador começou a
 * rolar) ou o dedo sair do elemento. O CSS está no fim do main.css.
 */
const PRESSABLE = '.btn, .book-card, .app-chip, .nav-item, .pill, .icon-button, [data-press]'

let pressed = null

function release() {
  if (!pressed) return
  pressed.removeAttribute('data-pressed')
  pressed = null
}

function onDown(event) {
  if (event.pointerType === 'mouse' || !isPhone() || prefersReducedMotion()) return
  const target = event.target.closest?.(PRESSABLE)
  if (!target || target.disabled || target.getAttribute('aria-disabled') === 'true') return
  release()
  pressed = target
  target.setAttribute('data-pressed', '')
}

export function installPress() {
  if (typeof document === 'undefined') return
  document.addEventListener('pointerdown', onDown, { passive: true })
  for (const type of ['pointerup', 'pointercancel', 'dragstart']) document.addEventListener(type, release, { passive: true })
  document.addEventListener('pointerout', event => { if (pressed && event.target === pressed && !pressed.contains(event.relatedTarget)) release() }, { passive: true })
  window.addEventListener('scroll', release, { passive: true, capture: true })
}
