<template>
  <dialog
    v-if="rendered"
    ref="dialogEl"
    class="app-dialog"
    :class="[dialogClass, `size-${size}`, { 'is-drawer': drawer, 'is-sheet': asSheet, 'is-page': asPage }]"
    :aria-label="ariaLabel || undefined"
    :aria-labelledby="ariaLabelledby || (header ? headerId : undefined)"
    @cancel.prevent="onCancel"
    @mousedown.self="pressedBackdrop = true"
    @click.self="onBackdropClick"
    @close="onNativeClose"
  >
    <div
      ref="panelEl"
      class="app-dialog-panel"
      :style="panelStyle"
      @mousedown="pressedBackdrop = false"
    >
      <!-- Folha do celular: alça para arrastar (o gesto vale também no cabeçalho) -->
      <div
        v-if="asSheet"
        class="sheet-grabber"
        aria-hidden="true"
        @pointerdown="drag.onPointerDown"
      >
        <span class="sheet-handle"></span>
      </div>
      <header
        v-if="header"
        class="app-dialog-header"
        @pointerdown="asSheet && drag.onPointerDown($event)"
      >
        <h2 :id="headerId">{{ header }}</h2>
        <button
          v-if="closable"
          type="button"
          class="app-dialog-close"
          :aria-label="t('common.close')"
          @click="requestClose"
        >
          <i
            class="pi pi-times"
            aria-hidden="true"
          ></i>
        </button>
      </header>
      <div
        v-if="header"
        class="app-dialog-content"
      >
        <slot />
      </div>
      <slot v-else />
    </div>
  </dialog>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useIsPhone } from '../../composables/useIsPhone.js'
import { useDrag } from '../../composables/useDrag.js'
import { pushOverlay } from '../../services/backStack.js'
import { MOTION, SPRING, canAnimate, rubberBand, shouldComplete } from '../../utils/motion.js'

/**
 * Janela modal com o <dialog> nativo, no lugar do Dialog do PrimeVue.
 * O navegador cuida do que é difícil: camada superior (fica por cima de
 * tudo), foco preso dentro, Esc e o resto da página inerte para leitores
 * de tela. Aqui só entram rolagem travada, clique fora e devolver o foco.
 *
 *   <AppDialog v-model:visible="open" aria-label="…" dismissable>…</AppDialog>
 *
 * Celular (abaixo de 640 px):
 *   - por padrão vira folha de baixo (sheet): sobe com mola, segue o dedo
 *     pela alça/cabeçalho e fecha puxando para baixo (distância ou puxão
 *     rápido, utils/motion.js → shouldComplete); o fundo escurece junto;
 *   - page: tela cheia (livro aberto);
 *   - o voltar do celular fecha (services/backStack.js), salvo backCloses=false
 *     (quem já vive na URL, como o ?book=).
 * A partir de 640 px nada disso vale: diálogo centrado, como sempre.
 */
const props = defineProps({
  visible: { type: Boolean, default: false },
  ariaLabel: { type: String, default: '' },
  ariaLabelledby: { type: String, default: '' },
  // Fecha clicando fora (no fundo escurecido)
  dismissable: { type: Boolean, default: true },
  closeOnEscape: { type: Boolean, default: true },
  dialogClass: { type: [String, Array, Object], default: '' },
  size: { type: String, default: 'md' }, // sm | md | lg | xl
  // Gaveta presa na lateral direita, na altura toda (filtros)
  drawer: { type: Boolean, default: false },
  // Com título: cabeçalho com o título e o X; sem: o conteúdo desenha tudo
  header: { type: String, default: '' },
  closable: { type: Boolean, default: true },
  panelStyle: { type: [String, Object], default: undefined },
  // Celular: folha de baixo (padrão) ou tela cheia (page). Gaveta (drawer)
  // continua gaveta.
  sheet: { type: Boolean, default: true },
  page: { type: Boolean, default: false },
  // Celular: o voltar do aparelho fecha (desligue se a URL já cuida disso)
  backCloses: { type: Boolean, default: true },
  // Celular: animar o fechamento (desligue quando a troca de tela do router
  // já anima, como no livro aberto pela URL)
  animateClose: { type: Boolean, default: true },
  // Chamada antes de fechar por Esc, clique fora ou X; se devolver false (ou
  // uma Promise de false), o diálogo continua aberto. Ex.: "Descartar alterações?"
  beforeClose: { type: Function, default: null }
})

const emit = defineEmits(['update:visible', 'hide', 'show'])
const { t } = useI18n()
const headerId = `app-dialog-title-${Math.random().toString(36).slice(2, 9)}`

const dialogEl = ref(null)
const panelEl = ref(null)
const rendered = ref(props.visible)
const pressedBackdrop = ref(false)
let returnFocus = null

const phone = useIsPhone()
const asPage = computed(() => phone.value && props.page && !props.drawer)
const asSheet = computed(() => phone.value && props.sheet && !props.page && !props.drawer)

// ---------------------------------------------------------------------------
// Voltar do celular
// ---------------------------------------------------------------------------
let releaseBack = null

function watchBack() {
  if (!props.backCloses || !phone.value || releaseBack) return
  releaseBack = pushOverlay(async () => {
    releaseBack = null
    const closed = await requestClose()
    // "Descartar alterações?" → não: continua aberto e o voltar volta a valer
    if (!closed && dialogEl.value?.open) watchBack()
  })
}

function forgetBack() {
  const release = releaseBack
  releaseBack = null
  return release ? release() : Promise.resolve()
}

// ---------------------------------------------------------------------------
// Folha: arrastar para fechar
// ---------------------------------------------------------------------------
let panelAnimation = null
let dragOffset = 0

function panelHeight() {
  return panelEl.value?.getBoundingClientRect().height || window.innerHeight
}

function setDrag(offset) {
  dragOffset = offset
  const panel = panelEl.value
  const dialog = dialogEl.value
  if (!panel || !dialog) return
  panel.style.transform = offset ? `translate3d(0, ${offset}px, 0)` : ''
  // O fundo clareia na mesma proporção em que a folha desce
  dialog.style.setProperty('--sheet-fade', String(Math.max(0, 1 - Math.max(offset, 0) / panelHeight())))
}

function stopPanelAnimation() {
  panelAnimation?.cancel()
  panelAnimation = null
}

function springBack() {
  const panel = panelEl.value
  const from = dragOffset
  setDrag(0)
  dialogEl.value?.style.removeProperty('--sheet-fade')
  if (!panel || !from || !canAnimate()) return
  stopPanelAnimation()
  panelAnimation = panel.animate(
    { transform: [`translate3d(0, ${from}px, 0)`, 'translate3d(0, 0, 0)'] },
    { duration: MOTION.spring, easing: SPRING }
  )
}

const drag = useDrag({
  axis: 'y',
  canStart: event => asSheet.value && props.closable && !event.target.closest?.('button, a, input, textarea, select'),
  onStart: () => stopPanelAnimation(),
  // Para cima: um pouco de borracha; para baixo: segue o dedo
  onMove: distance => setDrag(distance >= 0 ? distance : -rubberBand(-distance, 24)),
  onEnd: async ({ distance, velocity }) => {
    if (shouldComplete({ distance, velocity, size: panelHeight() })) {
      if (!(await requestClose())) springBack()
    } else {
      springBack()
    }
  }
})

// Fechar animado no celular (folha desce, tela cheia esmaece); desktop fecha na hora
function animateOut() {
  const panel = panelEl.value
  const dialog = dialogEl.value
  if (!panel || !dialog || !props.animateClose || !(asSheet.value || asPage.value) || !canAnimate()) return Promise.resolve()
  stopPanelAnimation()
  const from = dragOffset
  const fade = dialog.style.getPropertyValue('--sheet-fade') || '1'
  const keyframes = asSheet.value
    ? { transform: [`translate3d(0, ${from}px, 0)`, 'translate3d(0, 100%, 0)'] }
    : { opacity: [1, 0], transform: ['translate3d(0, 0, 0)', 'translate3d(0, 24px, 0)'] }
  panelAnimation = panel.animate(keyframes, { duration: MOTION.medium, easing: MOTION.easeExit, fill: 'forwards' })
  dialog.animate({ opacity: [Number(fade) || 1, 0] }, { duration: MOTION.medium, easing: MOTION.easeExit, fill: 'forwards', pseudoElement: '::backdrop' })
  const animation = panelAnimation
  return animation.finished.then(() => animation === panelAnimation, () => false)
}

function lockScroll(lock) {
  document.documentElement.classList.toggle('dialog-open', lock || document.querySelectorAll('dialog.app-dialog[open]').length > 0)
}

async function open() {
  rendered.value = true
  await nextTick()
  const el = dialogEl.value
  if (!el) return
  if (el.open) {
    // Reaberto no meio da animação de fechar: interrompe e fica
    if (panelAnimation) {
      stopPanelAnimation()
      el.getAnimations({ subtree: true }).forEach(animation => animation.cancel())
      setDrag(0)
      el.style.removeProperty('--sheet-fade')
    }
    return
  }
  returnFocus = document.activeElement
  el.showModal()
  lockScroll(true)
  watchBack()
  emit('show')
}

let closingAnimation = false
async function close() {
  const el = dialogEl.value
  if (!el?.open || closingAnimation) return
  closingAnimation = true
  try {
    const finished = await animateOut()
    // Reaberto durante a animação (open() cancelou): não fecha
    if (finished === false && props.visible) return
  } finally {
    closingAnimation = false
  }
  if (props.visible) return
  stopPanelAnimation()
  el.getAnimations?.({ subtree: true }).forEach(animation => animation.cancel())
  if (el.open) el.close()
}

function onNativeClose() {
  dragOffset = 0
  dialogEl.value?.style.removeProperty('--sheet-fade')
  if (panelEl.value) panelEl.value.style.transform = ''
  forgetBack()
  lockScroll(false)
  rendered.value = false
  if (props.visible) emit('update:visible', false)
  emit('hide')
  if (returnFocus && document.contains(returnFocus)) returnFocus.focus({ preventScroll: true })
  returnFocus = null
}

let closing = false
/** Pede para fechar (passa pelo beforeClose). Resolve true se vai fechar. */
async function requestClose() {
  if (closing) return false
  if (props.beforeClose) {
    closing = true
    try {
      if ((await props.beforeClose()) === false) return false
    } finally {
      closing = false
    }
  }
  emit('update:visible', false)
  return true
}

function onCancel() {
  if (props.closeOnEscape && props.closable) requestClose()
}

function onBackdropClick() {
  // Só fecha se o clique começou e terminou fora (arrastar seleção de texto não fecha)
  if (props.dismissable && props.closable && pressedBackdrop.value) requestClose()
  pressedBackdrop.value = false
}

watch(() => props.visible, value => (value ? open() : close()), { immediate: true })

onBeforeUnmount(() => {
  stopPanelAnimation()
  forgetBack()
  if (dialogEl.value?.open) dialogEl.value.close()
  lockScroll(false)
  // Desmontado antes do evento "close": devolve o foco aqui mesmo
  if (returnFocus && document.contains(returnFocus)) returnFocus.focus({ preventScroll: true })
  returnFocus = null
})

defineExpose({ close: () => emit('update:visible', false), requestClose })
</script>

<style>
/* Página atrás do diálogo não rola */
html.dialog-open {
  overflow: hidden;
}

.app-dialog {
  padding: 0;
  border: none;
  background: transparent;
  color: var(--text-primary);
  max-width: calc(100vw - 2rem);
  max-height: calc(100dvh - 2rem);
  overflow: visible;
}

.app-dialog::backdrop {
  background: var(--bg-overlay);
  backdrop-filter: blur(4px);
}

.app-dialog[open] {
  animation: app-dialog-in 0.18s ease-out;
}

.app-dialog[open]::backdrop {
  animation: app-dialog-fade 0.18s ease-out;
}

.app-dialog-panel {
  display: flex;
  flex-direction: column;
  max-height: calc(100dvh - 2rem);
  background: var(--bg-panel);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-3);
  overflow: hidden;
}

.app-dialog.size-sm .app-dialog-panel {
  width: 420px;
}

.app-dialog.size-md .app-dialog-panel {
  width: 560px;
}

.app-dialog.size-lg .app-dialog-panel {
  width: 900px;
}

.app-dialog.size-xl .app-dialog-panel {
  width: 960px;
}

.app-dialog-panel {
  max-width: 100%;
}

.app-dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1.1rem 1.25rem 0.5rem 1.5rem;
}

.app-dialog-header h2 {
  margin: 0;
  font-size: var(--fs-lg);
  font-weight: 700;
}

.app-dialog-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 34px;
  height: 34px;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
}

.app-dialog-close:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.app-dialog-close:focus-visible {
  outline: var(--focus-ring);
}

.app-dialog-content {
  padding: 0.5rem 1.5rem 1.5rem;
  overflow-y: auto;
}

/* Gaveta lateral */
.app-dialog.is-drawer {
  margin: 0 0 0 auto;
  height: 100dvh;
  max-height: 100dvh;
  max-width: 100vw;
}

.app-dialog.is-drawer .app-dialog-panel {
  width: 420px;
  height: 100%;
  max-height: 100dvh;
  border-radius: 0;
  border-width: 0 0 0 1px;
}

.app-dialog.is-drawer[open] {
  animation: app-drawer-in 0.22s ease-out;
}

@keyframes app-drawer-in {
  from {
    transform: translateX(100%);
  }
}

@media (max-width: 1023.98px) {
  .app-dialog.is-drawer .app-dialog-panel {
    width: 90vw;
  }
}

@keyframes app-dialog-in {
  from {
    opacity: 0;
    transform: translateY(8px) scale(0.98);
  }
}

@keyframes app-dialog-fade {
  from {
    opacity: 0;
  }
}

/* ---------------------------------------------------------------- celular
 * Folha de baixo e tela cheia. Só abaixo de 640 px: as classes is-sheet e
 * is-page nem aparecem acima disso (computed no script).
 */
.sheet-grabber {
  display: flex;
  justify-content: center;
  flex: none;
  padding: var(--space-2) 0 var(--space-1);
  touch-action: none;
  cursor: grab;
}

.sheet-handle {
  width: 36px;
  height: 5px;
  border-radius: var(--radius-pill);
  background: var(--border-hover);
}

.app-dialog.is-sheet {
  margin: auto 0 0;
  width: 100%;
  max-width: 100%;
  max-height: calc(100dvh - var(--safe-top, 0px) - var(--space-4));
}

.app-dialog.is-sheet .app-dialog-panel {
  width: 100%;
  max-height: inherit;
  border-width: 1px 0 0;
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  padding-bottom: var(--safe-bottom, 0px);
  overscroll-behavior: contain;
  will-change: transform;
}

.app-dialog.is-sheet .app-dialog-header {
  padding-top: var(--space-1);
  touch-action: none;
}

.app-dialog.is-sheet .app-dialog-content,
.app-dialog.is-page .app-dialog-panel {
  overscroll-behavior: contain;
}

.app-dialog.is-sheet::backdrop,
.app-dialog.is-page::backdrop {
  opacity: var(--sheet-fade, 1);
}

.app-dialog.is-sheet[open] {
  animation: none;
}

.app-dialog.is-sheet[open] .app-dialog-panel {
  animation: app-sheet-in var(--dur-spring) var(--ease-spring);
}

.app-dialog.is-sheet[open]::backdrop {
  animation: app-dialog-fade var(--dur-medium) var(--ease-enter);
}

.app-dialog.is-page {
  margin: 0;
  width: 100%;
  max-width: 100%;
  height: 100dvh;
  max-height: 100dvh;
}

.app-dialog.is-page .app-dialog-panel {
  width: 100%;
  height: 100%;
  max-height: 100dvh;
  border: none;
  border-radius: 0;
  box-shadow: none;
}

.app-dialog.is-page[open] {
  animation: app-page-in var(--dur-medium) var(--ease-enter);
}

/* Durante a troca de tela (View Transition) quem anima é ela */
html[data-nav] .app-dialog.is-page[open] {
  animation: none;
}

@keyframes app-sheet-in {
  from {
    transform: translate3d(0, 100%, 0);
  }
}

@keyframes app-page-in {
  from {
    opacity: 0;
    transform: translate3d(0, 16px, 0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .app-dialog.is-sheet[open] .app-dialog-panel,
  .app-dialog.is-page[open] {
    animation: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .app-dialog[open],
  .app-dialog.is-drawer[open],
  .app-dialog[open]::backdrop {
    animation: none;
  }
}
</style>
