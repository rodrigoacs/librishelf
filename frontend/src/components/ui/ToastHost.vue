<template>
  <div
    ref="hostEl"
    class="toast-host"
    popover="manual"
  >
    <TransitionGroup
      name="toast"
      tag="div"
      class="toast-stack"
    >
      <div
        v-for="item in toasts"
        :key="item.id"
        class="toast"
        :class="`toast-${item.severity}`"
        :role="item.severity === 'error' ? 'alert' : 'status'"
        @mouseenter="pause(item.id)"
        @mouseleave="resume(item)"
        @focusin="pause(item.id)"
        @focusout="resume(item)"
      >
        <i
          class="pi toast-icon"
          :class="ICONS[item.severity] || ICONS.info"
          aria-hidden="true"
        ></i>
        <div class="toast-text">
          <!-- Só a frase: sem título genérico ("Sucesso"/"Erro"); o título
               aparece quando diz algo além da frase (ex.: "Link copiado" + link) -->
          <p class="toast-summary">{{ item.summary || item.detail }}</p>
          <p
            v-if="item.summary && item.detail"
            class="toast-detail"
          >{{ item.detail }}</p>
        </div>
        <button
          v-if="item.action"
          type="button"
          class="toast-action"
          @click="runAction(item)"
        >{{ item.action.label }}</button>
        <button
          type="button"
          class="toast-close"
          :aria-label="t('common.close')"
          @click="removeToast(item.id)"
        >
          <i
            class="pi pi-times"
            aria-hidden="true"
          ></i>
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>

<script setup>
import { onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toasts, removeToast } from '../../services/toast.js'

/**
 * Mostra os avisos de services/toast.js. Fica num popover (camada superior)
 * para aparecer também por cima de um diálogo aberto.
 */
const { t } = useI18n()
const hostEl = ref(null)
const ICONS = { success: 'pi-check-circle', info: 'pi-info-circle', warn: 'pi-exclamation-triangle', error: 'pi-times-circle' }

const timers = new Map()

function schedule(item) {
  if (!item.life || timers.has(item.id)) return
  timers.set(item.id, setTimeout(() => {
    timers.delete(item.id)
    removeToast(item.id)
  }, item.life))
}

function pause(id) {
  clearTimeout(timers.get(id))
  timers.delete(id)
}

function resume(item) {
  schedule(item)
}

function runAction(item) {
  pause(item.id)
  removeToast(item.id)
  item.action?.onClick?.()
}

// Reabre o popover a cada aviso novo: assim ele fica acima de um diálogo
// que tenha aberto depois dele.
function bringToFront() {
  const el = hostEl.value
  if (!el?.showPopover) return
  try {
    if (el.matches(':popover-open')) el.hidePopover()
    if (toasts.length) el.showPopover()
  } catch {
    // navegador sem Popover API: o CSS deixa o host fixo na tela
  }
}

watch(() => toasts.length, (length, previous) => {
  toasts.forEach(schedule)
  if (length > (previous ?? 0) || length === 0) bringToFront()
})

onMounted(bringToFront)
</script>

<style>
.toast-host {
  position: fixed;
  inset: auto 1rem 1rem auto;
  margin: 0;
  padding: 0;
  border: none;
  background: transparent;
  overflow: visible;
  width: min(380px, calc(100vw - 2rem));
  z-index: 2000;
}

/* Sem Popover API o host continua visível */
.toast-host:not([popover]),
.toast-host:popover-open {
  display: block;
}

.toast-stack {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.toast {
  --toast-color: var(--blue);
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 0.85rem 0.9rem;
  border-radius: var(--radius-md);
  background: var(--bg-panel);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-left: 4px solid var(--toast-color);
  box-shadow: var(--shadow-3);
}

.toast-success {
  --toast-color: var(--green);
}

.toast-warn {
  --toast-color: var(--yellow);
}

.toast-error {
  --toast-color: var(--red);
}

.toast-icon {
  color: var(--toast-color);
  font-size: var(--fs-lg);
  margin-top: 0.05rem;
}

.toast-text {
  flex: 1;
  min-width: 0;
}

.toast-summary {
  margin: 0;
  font-weight: 700;
  font-size: var(--fs-sm);
}

.toast-detail {
  margin: 0.15rem 0 0;
  font-size: var(--fs-sm);
  color: var(--text-secondary);
  overflow-wrap: anywhere;
}

.toast-action {
  flex-shrink: 0;
  align-self: center;
  min-height: 2rem;
  padding: 0.3rem 0.6rem;
  border: none;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--main-color);
  font: inherit;
  font-size: var(--fs-sm);
  font-weight: 700;
  cursor: pointer;
}

.toast-action:hover {
  background: var(--bg-hover);
}

.toast-action:focus-visible {
  outline: var(--focus-ring);
}

@media (pointer: coarse) {
  .toast-action {
    min-height: 44px;
  }
}

.toast-close {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
}

.toast-close:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.toast-close:focus-visible {
  outline: var(--focus-ring);
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

.toast-enter-active,
.toast-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

/* Celular: pílula no centro de baixo, como o "✓ Imagem salva" do trailer.
   Fica acima do botão flutuante e do rodapé das folhas (72 px) e entra com
   mola. Cores cheias por tipo, com texto branco (≥ 4,5:1). */
@media (max-width: 639.98px) {
  .toast-host {
    inset: auto 1rem calc(var(--space-4) + 72px + env(safe-area-inset-bottom)) 1rem;
    width: auto;
  }

  .toast-stack {
    align-items: center;
  }

  .toast {
    --toast-bg: var(--bg-panel);
    --toast-fg: var(--text-primary);
    align-items: center;
    gap: var(--space-2);
    max-width: 100%;
    padding: 0.4rem 0.4rem 0.4rem 1rem;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-pill);
    background: var(--toast-bg);
    color: var(--toast-fg);
    box-shadow: var(--shadow-3);
  }

  .toast-success {
    --toast-bg: #15803d;
    --toast-fg: #ffffff;
  }

  .toast-error {
    --toast-bg: #b91c1c;
    --toast-fg: #ffffff;
  }

  .toast-warn {
    --toast-bg: #8f5a00;
    --toast-fg: #ffffff;
  }

  .toast-success,
  .toast-error,
  .toast-warn {
    border-color: transparent;
  }

  .toast-icon {
    color: inherit;
    font-size: var(--fs-md);
    margin-top: 0;
  }

  .toast-detail {
    color: inherit;
    opacity: 0.9;
  }

  .toast-success .toast-action,
  .toast-error .toast-action,
  .toast-warn .toast-action {
    color: inherit;
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  .toast-close {
    width: 36px;
    height: 36px;
    color: inherit;
    opacity: 0.85;
  }

  .toast-enter-from {
    opacity: 0;
    transform: translate3d(0, 16px, 0) scale(0.9);
  }

  .toast-leave-to {
    opacity: 0;
    transform: translate3d(0, 8px, 0) scale(0.96);
  }

  .toast-enter-active {
    transition: opacity var(--dur-medium) var(--ease-enter), transform var(--dur-spring) var(--ease-spring);
  }

  .toast-leave-active {
    transition: opacity var(--dur-short) var(--ease-exit), transform var(--dur-short) var(--ease-exit);
  }
}

@media (max-width: 639.98px) and (prefers-reduced-motion: reduce) {
  .toast-enter-active,
  .toast-leave-active {
    transition: none;
  }
}
</style>
