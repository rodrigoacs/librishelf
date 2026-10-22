import { nextTick, onBeforeUnmount, ref } from 'vue'

/**
 * Painel flutuante preso a um gatilho (listas do AppSelect e do
 * AppMultiSelect). Usa a Popover API: o painel vai para a camada superior,
 * então não é cortado por overflow nem fica atrás de um diálogo, e o
 * navegador fecha com Esc e com clique fora.
 *
 *   const { triggerEl, panelEl, isOpen, open, close, onToggle } = useFloatingPanel({ matchWidth: true })
 *   <button ref="triggerEl" :popovertarget="id">…</button>
 *   <div ref="panelEl" :id="id" popover="auto" @toggle="onToggle">…</div>
 *
 * O gatilho com popovertarget deixa o navegador abrir e fechar no clique
 * (sem o "fecha e abre de novo" de quando o clique fora cai no gatilho).
 */
export function useFloatingPanel({ matchWidth = true, gap = 6, onOpen, onClose } = {}) {
  const triggerEl = ref(null)
  const panelEl = ref(null)
  const isOpen = ref(false)

  function place() {
    const trigger = triggerEl.value
    const panel = panelEl.value
    if (!trigger || !panel) return
    const rect = trigger.getBoundingClientRect()
    if (matchWidth) panel.style.minWidth = `${rect.width}px`
    const panelRect = panel.getBoundingClientRect()
    const spaceBelow = window.innerHeight - rect.bottom
    const openUp = spaceBelow < panelRect.height + gap + 8 && rect.top > spaceBelow
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - panelRect.width - 8))
    panel.style.left = `${left}px`
    // Abrindo para cima, prende pela base: se a lista encolher (busca), continua colada no gatilho
    if (openUp) {
      panel.style.top = 'auto'
      panel.style.bottom = `${window.innerHeight - rect.top + gap}px`
    } else {
      panel.style.bottom = 'auto'
      panel.style.top = `${rect.bottom + gap}px`
    }
  }

  function onScrollOrResize(event) {
    // Rolagem dentro do próprio painel não fecha
    if (event?.type === 'scroll' && panelEl.value?.contains(event.target)) return
    close()
  }

  function open() {
    const panel = panelEl.value
    if (!panel || panel.matches(':popover-open')) return
    try {
      panel.showPopover()
    } catch {
      // navegador sem Popover API
    }
  }

  function close() {
    const panel = panelEl.value
    if (panel?.matches(':popover-open')) panel.hidePopover()
  }

  function toggle() {
    if (isOpen.value) close()
    else open()
  }

  // Ligar no @toggle do painel: vale para abrir/fechar por clique, teclado,
  // Esc ou clique fora.
  async function onToggle(event) {
    if (event.newState === 'open') {
      isOpen.value = true
      place()
      window.addEventListener('resize', onScrollOrResize)
      window.addEventListener('scroll', onScrollOrResize, true)
      await nextTick()
      place()
      onOpen?.()
      return
    }
    isOpen.value = false
    window.removeEventListener('resize', onScrollOrResize)
    window.removeEventListener('scroll', onScrollOrResize, true)
    onClose?.()
  }

  onBeforeUnmount(() => {
    window.removeEventListener('resize', onScrollOrResize)
    window.removeEventListener('scroll', onScrollOrResize, true)
  })

  return { triggerEl, panelEl, isOpen, open, close, toggle, place, onToggle }
}
