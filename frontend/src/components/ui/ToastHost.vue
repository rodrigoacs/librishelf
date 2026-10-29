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
  border-radius: 12px;
  background: var(--bg-panel);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-left: 4px solid var(--toast-color);
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.3);
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
  outline: 2px solid var(--main-color);
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

@media (max-width: 640px) {
  .toast-host {
    inset: auto 1rem calc(1rem + env(safe-area-inset-bottom)) 1rem;
    width: auto;
  }
}
</style>
