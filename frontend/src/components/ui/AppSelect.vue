<template>
  <div
    class="app-select"
    :class="{ open: isOpen, disabled }"
  >
    <button
      :id="inputId"
      ref="triggerEl"
      type="button"
      class="app-select-trigger"
      role="combobox"
      aria-haspopup="listbox"
      :aria-expanded="isOpen ? 'true' : 'false'"
      :aria-controls="listId"
      :aria-label="ariaLabel || undefined"
      :aria-labelledby="ariaLabelledby || undefined"
      :disabled="disabled"
      :popovertarget="listId"
      @keydown="onTriggerKeydown"
    >
      <span class="app-select-value">
        <slot
          name="value"
          :option="selected"
          :label="selectedLabel"
        >
          <span :class="{ placeholder: !selected }">{{ selected ? selectedLabel : placeholder }}</span>
        </slot>
      </span>
      <i
        class="pi pi-chevron-down app-select-chevron"
        aria-hidden="true"
      ></i>
    </button>

    <div
      :id="listId"
      ref="panelEl"
      class="app-select-panel"
      :class="panelClass"
      popover="auto"
      role="listbox"
      :aria-label="ariaLabel || undefined"
      :aria-labelledby="ariaLabelledby || undefined"
      @toggle="onToggle"
      @keydown="onListKeydown"
    >
      <button
        v-for="(option, index) in options"
        :key="valueOf(option)"
        type="button"
        role="option"
        class="app-select-option"
        :class="{ selected: valueOf(option) === modelValue }"
        :aria-selected="valueOf(option) === modelValue ? 'true' : 'false'"
        :data-index="index"
        tabindex="-1"
        @click="choose(option)"
      >
        <span>{{ labelOf(option) }}</span>
        <i
          v-if="valueOf(option) === modelValue"
          class="pi pi-check"
          aria-hidden="true"
        ></i>
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick } from 'vue'
import { useFloatingPanel } from '../../composables/useFloatingPanel.js'

/**
 * Lista de escolha única (no lugar do Dropdown do PrimeVue). Botão com
 * role="combobox" e lista num popover: setas, Home/End, Enter e Esc.
 *
 *   <AppSelect v-model="x" :options="[{ label, value }]" option-label="label" option-value="value" />
 */
const props = defineProps({
  modelValue: { type: [String, Number, Boolean], default: null },
  options: { type: Array, default: () => [] },
  optionLabel: { type: String, default: 'label' },
  optionValue: { type: String, default: 'value' },
  placeholder: { type: String, default: '' },
  inputId: { type: String, default: undefined },
  ariaLabel: { type: String, default: '' },
  ariaLabelledby: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
  panelClass: { type: [String, Array, Object], default: '' }
})

const emit = defineEmits(['update:modelValue'])
const listId = `app-select-${Math.random().toString(36).slice(2, 9)}`

const { triggerEl, panelEl, isOpen, open, close, onToggle } = useFloatingPanel({
  onOpen: () => focusOption(Math.max(0, selectedIndex.value)),
  onClose: () => {
    if (panelEl.value?.contains(document.activeElement) || document.activeElement === document.body) triggerEl.value?.focus()
  }
})

const valueOf = option => (option && typeof option === 'object' ? option[props.optionValue] : option)
const labelOf = option => (option && typeof option === 'object' ? option[props.optionLabel] : String(option))

const selectedIndex = computed(() => props.options.findIndex(option => valueOf(option) === props.modelValue))
const selected = computed(() => props.options[selectedIndex.value] ?? null)
const selectedLabel = computed(() => (selected.value ? labelOf(selected.value) : ''))

function optionEls() {
  return [...(panelEl.value?.querySelectorAll('.app-select-option') || [])]
}

async function focusOption(index) {
  await nextTick()
  const list = optionEls()
  const el = list[Math.min(Math.max(index, 0), list.length - 1)]
  el?.focus({ preventScroll: true })
  el?.scrollIntoView({ block: 'nearest' })
}

function choose(option) {
  emit('update:modelValue', valueOf(option))
  close()
}

function onTriggerKeydown(event) {
  if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
    event.preventDefault()
    open()
  }
}

function onListKeydown(event) {
  const list = optionEls()
  const index = list.indexOf(document.activeElement)
  if (event.key === 'ArrowDown') focusOption(index + 1)
  else if (event.key === 'ArrowUp') focusOption(index - 1)
  else if (event.key === 'Home') focusOption(0)
  else if (event.key === 'End') focusOption(list.length - 1)
  else if (event.key === 'Tab') {
    close()
    return
  } else return
  event.preventDefault()
}
</script>

<style>
.app-select {
  position: relative;
  display: inline-flex;
  min-width: 0;
}

.app-select.w-full {
  display: flex;
  width: 100%;
}

.app-select-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
  width: 100%;
  min-height: 2.75rem;
  padding: 0 0.85rem 0 1rem;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-input);
  color: var(--text-primary);
  font: inherit;
  font-size: var(--fs-md);
  text-align: left;
  cursor: pointer;
}

.app-select-trigger:hover:not(:disabled) {
  border-color: var(--border-hover);
}

.app-select-trigger:focus-visible,
.app-select.open .app-select-trigger {
  outline: none;
  border-color: var(--main-color);
  box-shadow: 0 0 0 2px rgba(var(--main-color-rgb), 0.2);
}

.app-select-trigger:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.app-select-value {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.app-select-value .placeholder {
  color: var(--text-muted);
}

.app-select-chevron {
  flex-shrink: 0;
  font-size: var(--fs-xs);
  color: var(--text-secondary);
  transition: transform 0.15s ease;
}

.app-select.open .app-select-chevron {
  transform: rotate(180deg);
}

.app-select-panel {
  position: fixed;
  inset: auto;
  margin: 0;
  max-height: min(22rem, 60vh);
  overflow-y: auto;
  padding: 0.35rem;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--bg-panel);
  color: var(--text-primary);
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.3);
}

.app-select-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
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

.app-select-option:hover,
.app-select-option:focus-visible {
  background: var(--bg-hover);
  outline: none;
}

.app-select-option.selected {
  color: var(--main-color);
  background: rgba(var(--main-color-rgb), 0.1);
  font-weight: 600;
}

.app-select-option .pi {
  font-size: var(--fs-xs);
}

@media (pointer: coarse) {
  .app-select-option {
    min-height: 2.75rem;
  }
}
</style>
