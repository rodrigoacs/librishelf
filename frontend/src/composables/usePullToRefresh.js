import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { GESTURE, refreshPull } from '../utils/motion.js'
import { useIsPhone } from './useIsPhone.js'

/**
 * Puxar para atualizar (só no celular): com a página no topo, arrastar para
 * baixo puxa o indicador; soltando depois de refreshTrigger, chama onRefresh
 * e o indicador gira até a promessa acabar. Abaixo disso, volta.
 *
 *   const pull = usePullToRefresh(() => Promise.all([loadA(), loadB()]))
 *   <PullRefresh :state="pull" />
 *
 * Toque (touch events passivos): o gesto acontece com a página parada no topo
 * e o "puxar e recarregar" do navegador desligado (html.has-pull-refresh no
 * main.css), então não há o que impedir. Não começa com folha ou menu aberto
 * (algo inert na tela), nem na faixa da borda esquerda (é o gesto do menu).
 */
export function usePullToRefresh(onRefresh) {
  const phone = useIsPhone()
  const offset = ref(0)
  const progress = ref(0)
  const status = ref('idle') // idle | pulling | armed | refreshing | done
  const dragging = ref(false)

  let start = null
  let decided = false

  function reset() {
    start = null
    decided = false
    dragging.value = false
  }

  function blocked(target) {
    if (document.querySelector('dialog[open], [inert]')) return true
    return Boolean(target?.closest?.('input, textarea, select, [contenteditable="true"]'))
  }

  function onTouchStart(event) {
    if (!phone.value || status.value === 'refreshing' || event.touches.length !== 1) return
    if (window.scrollY > 0 || blocked(event.target)) return
    const touch = event.touches[0]
    if (touch.clientX <= GESTURE.edgeWidth) return
    start = { x: touch.clientX, y: touch.clientY }
    decided = false
  }

  function onTouchMove(event) {
    if (!start) return
    const touch = event.touches[0]
    const dx = touch.clientX - start.x
    const dy = touch.clientY - start.y
    if (!decided) {
      if (Math.abs(dx) < GESTURE.slop && Math.abs(dy) < GESTURE.slop) return
      // Para baixo e mais vertical que horizontal; senão é rolagem ou outro gesto
      if (dy <= 0 || Math.abs(dx) > Math.abs(dy) || window.scrollY > 0) { reset(); return }
      decided = true
      dragging.value = true
    }
    const pull = refreshPull(dy - GESTURE.slop)
    offset.value = pull.offset
    progress.value = pull.progress
    status.value = pull.armed ? 'armed' : 'pulling'
  }

  async function onTouchEnd() {
    if (!start) return
    const armed = decided && status.value === 'armed'
    reset()
    if (!armed) {
      offset.value = 0
      progress.value = 0
      status.value = 'idle'
      return
    }
    status.value = 'refreshing'
    offset.value = GESTURE.refreshTrigger * 0.8
    progress.value = 1
    try {
      await onRefresh()
    } finally {
      status.value = 'done'
      offset.value = 0
      progress.value = 0
      setTimeout(() => { if (status.value === 'done') status.value = 'idle' }, 400)
    }
  }

  const listeners = [
    ['touchstart', onTouchStart],
    ['touchmove', onTouchMove],
    ['touchend', onTouchEnd],
    ['touchcancel', onTouchEnd]
  ]

  function sync(on) {
    document.documentElement.classList.toggle('has-pull-refresh', on)
  }

  onMounted(() => {
    for (const [name, fn] of listeners) window.addEventListener(name, fn, { passive: true })
    sync(phone.value)
  })
  watch(phone, sync)
  onBeforeUnmount(() => {
    for (const [name, fn] of listeners) window.removeEventListener(name, fn)
    sync(false)
  })

  return { offset, progress, status, dragging }
}
