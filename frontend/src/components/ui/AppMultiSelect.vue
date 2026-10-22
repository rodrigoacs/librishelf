<template>
  <div
    class="app-select app-multiselect"
    :class="{ open: isOpen }"
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
      :popovertarget="panelId"
      @keydown="onTriggerKeydown"
    >
      <span class="app-select-value">
        <span :class="{ placeholder: !modelValue.length }">{{ summary }}</span>
      </span>
      <span
        v-if="modelValue.length"
        class="count-badge"
        aria-hidden="true"
      >{{ modelValue.length }}</span>
      <i
        class="pi pi-chevron-down app-select-chevron"
        aria-hidden="true"
      ></i>
    </button>

    <div
      :id="panelId"
      ref="panelEl"
      class="app-select-panel app-multiselect-panel"
      popover="auto"
      @toggle="onToggle"
      @keydown="onPanelKeydown"
    >
      <div
        v-if="filter"
        class="ms-search"
      >
        <i
          class="pi pi-search"
          aria-hidden="true"
        ></i>
        <input
          ref="searchEl"
          v-model="query"
          type="search"
          :placeholder="t('common.search')"
          :aria-label="t('common.search')"
          :aria-controls="listId"
          autocomplete="off"
        />
      </div>

      <div
        :id="listId"
        class="ms-list"
        role="listbox"
        aria-multiselectable="true"
        :aria-label="ariaLabel || undefined"
      >
        <button
          v-for="option in visibleOptions"
          :key="valueOf(option)"
          type="button"
          role="option"
          class="app-select-option ms-option"
          :aria-selected="isSelected(option) ? 'true' : 'false'"
          tabindex="-1"
          @click="toggleOption(option)"
        >
          <span
            class="ms-check"
            :class="{ on: isSelected(option) }"
            aria-hidden="true"
          ><i class="pi pi-check"></i></span>
          <span class="ms-label">{{ labelOf(option) }}</span>
        </button>
        <p
          v-if="!visibleOptions.length"
          class="ms-empty"
        >{{ t('common.noResults') }}</p>
        <p
          v-else-if="hiddenCount > 0"
          class="ms-empty"
        >{{ t('common.typeToSeeMore', { n: hiddenCount }) }}</p>
      </div>

      <div
        v-if="modelValue.length"
        class="ms-footer"
      >
        <button
          type="button"
          class="ms-clear"
          @click="emit('update:modelValue', [])"
        >{{ t('common.clearSelection') }}</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFloatingPanel } from '../../composables/useFloatingPanel.js'

/**
 * Escolha de vários itens com busca (no lugar do MultiSelect do PrimeVue).
 * Listas grandes (milhares de autores) mostram só os primeiros resultados;
 * os já marcados vêm sempre no topo.
 */
const props = defineProps({
  modelValue: { type: Array, default: () => [] },
  options: { type: Array, default: () => [] },
  optionLabel: { type: String, default: 'label' },
  optionValue: { type: String, default: 'value' },
  placeholder: { type: String, default: '' },
  // "{n} selecionados" quando passa de maxLabels
  selectedLabel: { type: String, default: '' },
  maxLabels: { type: Number, default: 2 },
  filter: { type: Boolean, default: false },
  inputId: { type: String, default: undefined },
  ariaLabel: { type: String, default: '' }
})

const emit = defineEmits(['update:modelValue'])
const { t, locale } = useI18n()
const uid = Math.random().toString(36).slice(2, 9)
const panelId = `app-ms-panel-${uid}`
const listId = `app-ms-list-${uid}`
const SHOWN = 120

const query = ref('')
const searchEl = ref(null)

const { triggerEl, panelEl, isOpen, open, onToggle } = useFloatingPanel({
  onOpen: async () => {
    await nextTick()
    if (props.filter) searchEl.value?.focus()
    else panelEl.value?.querySelector('.ms-option')?.focus()
  },
  onClose: () => {
    query.value = ''
    if (panelEl.value?.contains(document.activeElement) || document.activeElement === document.body) triggerEl.value?.focus()
  }
})

const valueOf = option => (option && typeof option === 'object' ? option[props.optionValue] : option)
const labelOf = option => (option && typeof option === 'object' ? option[props.optionLabel] : String(option))
const selectedSet = computed(() => new Set(props.modelValue))
const isSelected = option => selectedSet.value.has(valueOf(option))

const normalize = text => String(text).toLocaleLowerCase(locale.value).normalize('NFD').replace(/[̀-ͯ]/g, '')

const matches = computed(() => {
  const term = normalize(query.value.trim())
  const list = term ? props.options.filter(option => normalize(labelOf(option)).includes(term)) : props.options
  const chosen = list.filter(isSelected)
  const rest = list.filter(option => !isSelected(option))
  return [...chosen, ...rest]
})

const visibleOptions = computed(() => matches.value.slice(0, SHOWN))
const hiddenCount = computed(() => Math.max(0, matches.value.length - SHOWN))

const summary = computed(() => {
  const count = props.modelValue.length
  if (!count) return props.placeholder
  if (count > props.maxLabels) return props.selectedLabel.replace('{0}', count)
  return props.modelValue.join(', ')
})

function toggleOption(option) {
  const value = valueOf(option)
  const next = isSelected(option) ? props.modelValue.filter(item => item !== value) : [...props.modelValue, value]
  emit('update:modelValue', next)
}

function onTriggerKeydown(event) {
  if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
    event.preventDefault()
    open()
  }
}

function onPanelKeydown(event) {
  const list = [...(panelEl.value?.querySelectorAll('.ms-option') || [])]
  const index = list.indexOf(document.activeElement)
  if (event.key === 'ArrowDown') {
    list[Math.min(index + 1, list.length - 1)]?.focus()
  } else if (event.key === 'ArrowUp') {
    if (index <= 0 && props.filter) searchEl.value?.focus()
    else list[Math.max(index - 1, 0)]?.focus()
  } else return
  event.preventDefault()
}
</script>

<style>
.app-multiselect .count-badge {
  flex-shrink: 0;
  min-width: 1.4rem;
  padding: 0.05rem 0.4rem;
  border-radius: 999px;
  background: var(--main-solid);
  color: var(--on-main);
  font-size: var(--fs-xs);
  font-weight: 700;
  text-align: center;
}

.app-multiselect-panel {
  display: flex;
  flex-direction: column;
  padding: 0;
  overflow: hidden;
  width: min(22rem, calc(100vw - 2rem));
}

.app-multiselect-panel:not(:popover-open) {
  display: none;
}

.ms-search {
  position: relative;
  padding: 0.5rem;
  border-bottom: 1px solid var(--border-color);
}

.ms-search .pi {
  position: absolute;
  left: 1.25rem;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-muted);
  font-size: var(--fs-sm);
}

.ms-search input {
  width: 100%;
  height: 2.5rem;
  padding: 0 0.75rem 0 2.2rem;
  border: 1px solid transparent;
  border-radius: 8px;
  background: var(--bg-input);
  color: var(--text-primary);
  font: inherit;
  font-size: var(--fs-sm);
  outline: none;
}

.ms-search input:focus {
  border-color: var(--main-color);
}

.ms-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0.35rem;
}

.app-select-option.ms-option {
  justify-content: flex-start;
}

.ms-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ms-check {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 1.15rem;
  height: 1.15rem;
  border: 2px solid var(--text-muted);
  border-radius: 5px;
  color: transparent;
}

.ms-check .pi {
  font-size: 0.65rem;
}

.ms-check.on {
  border-color: var(--main-solid);
  background: var(--main-solid);
  color: var(--on-main);
}

.ms-empty {
  margin: 0;
  padding: 0.75rem 0.85rem;
  color: var(--text-muted);
  font-size: var(--fs-xs);
}

.ms-footer {
  padding: 0.4rem 0.5rem;
  border-top: 1px solid var(--border-color);
}

.ms-clear {
  border: none;
  background: transparent;
  color: var(--main-color);
  font: inherit;
  font-size: var(--fs-sm);
  font-weight: 600;
  padding: 0.4rem 0.5rem;
  border-radius: 6px;
  cursor: pointer;
}

.ms-clear:hover {
  background: rgba(var(--main-color-rgb), 0.1);
}
</style>
