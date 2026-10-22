<template>
  <dialog
    v-if="rendered"
    ref="dialogEl"
    class="app-dialog"
    :class="[dialogClass, `size-${size}`]"
    :aria-label="ariaLabel || undefined"
    :aria-labelledby="ariaLabelledby || undefined"
    @cancel.prevent="onCancel"
    @mousedown.self="pressedBackdrop = true"
    @click.self="onBackdropClick"
    @close="onNativeClose"
  >
    <div
      class="app-dialog-panel"
      :style="panelStyle"
      @mousedown="pressedBackdrop = false"
    >
      <slot />
    </div>
  </dialog>
</template>

<script setup>
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'

/**
 * Janela modal com o <dialog> nativo, no lugar do Dialog do PrimeVue.
 * O navegador cuida do que é difícil: camada superior (fica por cima de
 * tudo), foco preso dentro, Esc e o resto da página inerte para leitores
 * de tela. Aqui só entram rolagem travada, clique fora e devolver o foco.
 *
 *   <AppDialog v-model:visible="open" aria-label="…" dismissable>…</AppDialog>
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
  panelStyle: { type: [String, Object], default: undefined }
})

const emit = defineEmits(['update:visible', 'hide', 'show'])

const dialogEl = ref(null)
const rendered = ref(props.visible)
const pressedBackdrop = ref(false)
let returnFocus = null

function lockScroll(lock) {
  document.documentElement.classList.toggle('dialog-open', lock || document.querySelectorAll('dialog.app-dialog[open]').length > 0)
}

async function open() {
  rendered.value = true
  await nextTick()
  const el = dialogEl.value
  if (!el || el.open) return
  returnFocus = document.activeElement
  el.showModal()
  lockScroll(true)
  emit('show')
}

function close() {
  const el = dialogEl.value
  if (el?.open) el.close()
}

function onNativeClose() {
  lockScroll(false)
  rendered.value = false
  if (props.visible) emit('update:visible', false)
  emit('hide')
  if (returnFocus && document.contains(returnFocus)) returnFocus.focus({ preventScroll: true })
  returnFocus = null
}

function onCancel() {
  if (props.closeOnEscape) emit('update:visible', false)
}

function onBackdropClick() {
  // Só fecha se o clique começou e terminou fora (arrastar seleção de texto não fecha)
  if (props.dismissable && pressedBackdrop.value) emit('update:visible', false)
  pressedBackdrop.value = false
}

watch(() => props.visible, value => (value ? open() : close()), { immediate: true })

onBeforeUnmount(() => {
  close()
  lockScroll(false)
})

defineExpose({ close: () => emit('update:visible', false) })
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
  border-radius: 16px;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
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

@media (prefers-reduced-motion: reduce) {
  .app-dialog[open],
  .app-dialog[open]::backdrop {
    animation: none;
  }
}
</style>
