import { onBeforeUnmount } from 'vue'
import { GESTURE, velocityFrom } from '../utils/motion.js'

/**
 * Arrastar com Pointer Events num eixo, para folha, gaveta e puxar para
 * atualizar. Não decide nada sozinho: avisa start/move/end com a distância
 * no eixo e a velocidade ao soltar (px/ms); quem usa decide com
 * shouldComplete() (utils/motion.js).
 *
 *   const drag = useDrag({ axis: 'y', canStart, onStart, onMove, onEnd })
 *   drag.bind(el)  // ou @pointerdown="drag.onPointerDown"
 *
 * canStart(event) → false ignora o toque (ex.: só da borda, só no topo da lista).
 * Só começa depois de GESTURE.slop px no eixo certo: um toque continua clique
 * e um movimento no outro eixo (rolar) desiste do gesto.
 */
export function useDrag({ axis = 'y', canStart = () => true, onStart, onMove, onEnd } = {}) {
  let state = null

  function point(event) {
    return axis === 'y' ? event.clientY : event.clientX
  }

  function cross(event) {
    return axis === 'y' ? event.clientX : event.clientY
  }

  function cleanup() {
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', onPointerUp)
    window.removeEventListener('pointercancel', onPointerCancel)
    state = null
  }

  function onPointerDown(event) {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    if (state || !canStart(event)) return
    state = { id: event.pointerId, start: point(event), startCross: cross(event), active: false, samples: [], target: event.currentTarget }
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerCancel)
  }

  function onPointerMove(event) {
    if (!state || event.pointerId !== state.id) return
    const delta = point(event) - state.start
    if (!state.active) {
      const off = Math.abs(cross(event) - state.startCross)
      if (off > GESTURE.slop && off > Math.abs(delta)) return cleanup()
      if (Math.abs(delta) < GESTURE.slop) return
      state.active = true
      state.start = point(event)
      try { state.target?.setPointerCapture?.(event.pointerId) } catch { /* já solto */ }
      onStart?.(event)
    }
    const distance = point(event) - state.start
    state.samples.push({ t: event.timeStamp, v: distance })
    if (state.samples.length > 12) state.samples.shift()
    if (event.cancelable) event.preventDefault()
    onMove?.(distance, event)
  }

  function finish(event, cancelled) {
    if (!state || event.pointerId !== state.id) return
    const { active, samples } = state
    const distance = samples.length ? samples[samples.length - 1].v : 0
    const velocity = velocityFrom(samples)
    cleanup()
    if (active) onEnd?.({ distance, velocity, cancelled })
  }

  function onPointerUp(event) {
    finish(event, false)
  }

  function onPointerCancel(event) {
    finish(event, true)
  }

  function bind(el) {
    el?.addEventListener('pointerdown', onPointerDown)
    return () => el?.removeEventListener('pointerdown', onPointerDown)
  }

  onBeforeUnmount(cleanup)

  return { onPointerDown, bind, isDragging: () => Boolean(state?.active) }
}
