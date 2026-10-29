<template>
  <div
    :id="id"
    ref="menuEl"
    class="popup-menu"
    role="menu"
    popover="auto"
    @toggle="onToggle"
    @keydown="onKeydown"
  >
    <template
      v-for="(item, index) in items"
      :key="index"
    >
      <hr
        v-if="item.separator"
        class="popup-separator"
        role="separator"
      />
      <button
        v-else
        type="button"
        role="menuitem"
        class="popup-item"
        :class="{ danger: item.danger }"
        tabindex="-1"
        :disabled="item.disabled"
        @click="choose(item)"
      >
        <i
          v-if="item.icon"
          :class="item.icon"
          aria-hidden="true"
        ></i>
        <span>{{ item.label }}</span>
      </button>
    </template>
  </div>
</template>

<script setup>
import { ref } from 'vue'

/**
 * Menu suspenso (no lugar do Menu "popup" do PrimeVue). Usa a Popover API:
 * fica por cima de tudo, fecha clicando fora ou com Esc. Setas do teclado
 * andam entre os itens.
 *
 *   <PopupMenu ref="menu" id="x" :items="[{ label, icon, command, danger? }, { separator: true }]" />
 *   menu.value.toggle(event)
 */
defineProps({
  id: { type: String, required: true },
  items: { type: Array, default: () => [] }
})

const menuEl = ref(null)
let anchor = null

function itemsEls() {
  return [...(menuEl.value?.querySelectorAll('.popup-item:not(:disabled)') || [])]
}

function place() {
  const el = menuEl.value
  if (!el || !anchor) return
  const rect = anchor.getBoundingClientRect()
  const menuRect = el.getBoundingClientRect()
  const below = rect.bottom + 6
  // Sem espaço embaixo (barra de ações presa no rodapé): abre para cima
  const top = below + menuRect.height > window.innerHeight - 8 ? rect.top - menuRect.height - 6 : below
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - menuRect.width - 8))
  el.style.top = `${Math.max(8, top)}px`
  el.style.left = `${left}px`
}

function toggle(event) {
  const el = menuEl.value
  if (!el) return
  if (el.matches(':popover-open')) {
    el.hidePopover()
    return
  }
  anchor = event?.currentTarget || event?.target || null
  el.showPopover()
  place()
  anchor?.setAttribute('aria-expanded', 'true')
  itemsEls()[0]?.focus()
}

function onToggle(event) {
  if (event.newState === 'closed') {
    anchor?.setAttribute('aria-expanded', 'false')
    if (menuEl.value?.contains(document.activeElement) || document.activeElement === document.body) anchor?.focus()
  }
}

function choose(item) {
  menuEl.value?.hidePopover()
  item.command?.()
}

function onKeydown(event) {
  const list = itemsEls()
  const index = list.indexOf(document.activeElement)
  if (event.key === 'ArrowDown') list[(index + 1) % list.length]?.focus()
  else if (event.key === 'ArrowUp') list[(index - 1 + list.length) % list.length]?.focus()
  else if (event.key === 'Home') list[0]?.focus()
  else if (event.key === 'End') list[list.length - 1]?.focus()
  else if (event.key === 'Tab') menuEl.value?.hidePopover()
  else return
  if (event.key !== 'Tab') event.preventDefault()
}

defineExpose({ toggle })
</script>

<style>
.popup-menu {
  position: fixed;
  inset: auto;
  margin: 0;
  min-width: 12rem;
  padding: 0.35rem;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--bg-panel);
  color: var(--text-primary);
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.3);
}

.popup-item {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  width: 100%;
  padding: 0.6rem 0.85rem;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: var(--fs-sm);
  text-align: left;
  cursor: pointer;
}

.popup-item .pi {
  color: var(--text-secondary);
  font-size: var(--fs-sm);
}

.popup-item:hover,
.popup-item:focus-visible {
  background: var(--bg-hover);
  outline: none;
}

/* Ação destrutiva (Excluir) */
.popup-item.danger,
.popup-item.danger .pi {
  color: var(--danger);
}

.popup-item:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.popup-separator {
  margin: 0.3rem 0.4rem;
  border: none;
  border-top: 1px solid var(--border-color);
}

@media (pointer: coarse) {
  .popup-item {
    min-height: 2.75rem;
  }
}
</style>
