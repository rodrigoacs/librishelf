/**
 * v-tooltip, no lugar do Tooltip do PrimeVue.
 *
 *   <button v-tooltip.bottom="'Filtros'" aria-label="Filtros">…</button>
 *
 * Aparece no hover e no foco do teclado, some com Esc, ao sair ou ao
 * clicar. Em tela de toque não aparece (não há hover). O texto vira
 * aria-describedby do elemento, a menos que já seja o aria-label dele.
 * Fica num popover (camada superior), então aparece também dentro de diálogos.
 */
let counter = 0
const GAP = 8

function place(tip, target, side) {
  const rect = target.getBoundingClientRect()
  const tipRect = tip.getBoundingClientRect()
  let top
  let left
  if (side === 'bottom') {
    top = rect.bottom + GAP
    left = rect.left + rect.width / 2 - tipRect.width / 2
  } else if (side === 'left') {
    top = rect.top + rect.height / 2 - tipRect.height / 2
    left = rect.left - tipRect.width - GAP
  } else if (side === 'right') {
    top = rect.top + rect.height / 2 - tipRect.height / 2
    left = rect.right + GAP
  } else {
    top = rect.top - tipRect.height - GAP
    left = rect.left + rect.width / 2 - tipRect.width / 2
  }
  // Não deixa sair da tela
  left = Math.max(GAP, Math.min(left, window.innerWidth - tipRect.width - GAP))
  top = Math.max(GAP, Math.min(top, window.innerHeight - tipRect.height - GAP))
  tip.style.left = `${left}px`
  tip.style.top = `${top}px`
}

function show(el) {
  const state = el._tooltip
  if (!state?.text || state.tip) return
  const tip = document.createElement('div')
  tip.className = 'app-tooltip'
  tip.id = state.id
  tip.setAttribute('role', 'tooltip')
  tip.textContent = state.text
  if ('popover' in HTMLElement.prototype) tip.setAttribute('popover', 'manual')
  document.body.appendChild(tip)
  try {
    tip.showPopover?.()
  } catch {
    // sem Popover API: fica como elemento fixo comum
  }
  place(tip, el, state.side)
  state.tip = tip
}

function hide(el) {
  const state = el._tooltip
  if (!state?.tip) return
  state.tip.remove()
  state.tip = null
}

function sideOf(binding) {
  return ['top', 'bottom', 'left', 'right'].find(side => binding.modifiers[side]) || 'top'
}

function sync(el, binding) {
  const state = el._tooltip
  state.text = binding.value ? String(binding.value) : ''
  state.side = sideOf(binding)
  if (state.tip) state.tip.textContent = state.text
  // Se o texto já é o nome acessível do elemento, não repete na descrição
  const describes = state.text && el.getAttribute('aria-label') !== state.text
  if (describes) el.setAttribute('aria-describedby', state.id)
  else if (el.getAttribute('aria-describedby') === state.id) el.removeAttribute('aria-describedby')
  if (!state.text) hide(el)
}

const hoverCapable = () => window.matchMedia?.('(hover: hover)').matches ?? true

export default {
  mounted(el, binding) {
    const state = { id: `tooltip-${++counter}`, text: '', side: 'top', tip: null }
    el._tooltip = state
    state.onEnter = () => hoverCapable() && show(el)
    state.onFocus = () => el.matches(':focus-visible') && show(el)
    state.onLeave = () => hide(el)
    state.onKey = event => event.key === 'Escape' && hide(el)
    el.addEventListener('mouseenter', state.onEnter)
    el.addEventListener('mouseleave', state.onLeave)
    el.addEventListener('focus', state.onFocus)
    el.addEventListener('blur', state.onLeave)
    el.addEventListener('click', state.onLeave)
    el.addEventListener('keydown', state.onKey)
    sync(el, binding)
  },
  updated(el, binding) {
    sync(el, binding)
  },
  beforeUnmount(el) {
    const state = el._tooltip
    hide(el)
    el.removeEventListener('mouseenter', state.onEnter)
    el.removeEventListener('mouseleave', state.onLeave)
    el.removeEventListener('focus', state.onFocus)
    el.removeEventListener('blur', state.onLeave)
    el.removeEventListener('click', state.onLeave)
    el.removeEventListener('keydown', state.onKey)
    delete el._tooltip
  }
}
