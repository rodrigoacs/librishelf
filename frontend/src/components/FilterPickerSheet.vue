<template>
  <AppDialog
    :visible="visible"
    size="sm"
    :header="title"
    dialog-class="filter-picker"
    @update:visible="value => emit('update:visible', value)"
  >
    <div class="picker-body">
      <div
        v-if="options.length > 8"
        class="picker-search"
      >
        <i
          class="pi pi-search"
          aria-hidden="true"
        ></i>
        <label
          :for="`${uid}-q`"
          class="sr-only"
        >{{ t('library.pickerSearch', { name: title }) }}</label>
        <input
          :id="`${uid}-q`"
          v-model="query"
          type="search"
          autocomplete="off"
          :placeholder="t('library.pickerSearch', { name: title })"
        />
      </div>
      <ul
        class="picker-list"
        :aria-label="title"
      >
        <li
          v-for="option in shown"
          :key="option.name"
        >
          <button
            type="button"
            class="picker-option"
            :aria-pressed="selected.includes(option.name)"
            data-press
            @click="toggle(option.name)"
          >
            <span class="picker-name">{{ option.name }}</span>
            <span
              v-if="option.count != null"
              class="picker-count"
            >{{ option.count }}</span>
            <i
              class="pi pi-check picker-check"
              aria-hidden="true"
            ></i>
          </button>
        </li>
      </ul>
      <p
        v-if="!shown.length"
        class="picker-empty"
      >{{ t('library.pickerEmpty') }}</p>
    </div>
  </AppDialog>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import AppDialog from './ui/AppDialog.vue'

/**
 * Escolher autores, editoras ou categorias pelos chips da Biblioteca no
 * celular: folha de baixo com a lista; cada toque liga/desliga na hora.
 */
const props = defineProps({
  visible: { type: Boolean, default: false },
  title: { type: String, required: true },
  options: { type: Array, default: () => [] },
  selected: { type: Array, default: () => [] }
})
const emit = defineEmits(['update:visible', 'update:selected'])
const { t } = useI18n()
const uid = `picker-${Math.random().toString(36).slice(2, 8)}`
const query = ref('')

watch(() => props.visible, open => { if (open) query.value = '' })

const normalize = text => String(text).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

// Selecionados primeiro; depois a ordem que veio do servidor
const shown = computed(() => {
  const q = normalize(query.value.trim())
  const list = q ? props.options.filter(option => normalize(option.name).includes(q)) : props.options
  return [...list].sort((a, b) => Number(props.selected.includes(b.name)) - Number(props.selected.includes(a.name)) || 0)
})

function toggle(name) {
  const next = props.selected.includes(name)
    ? props.selected.filter(item => item !== name)
    : [...props.selected, name]
  emit('update:selected', next)
}

</script>

<style scoped>
.picker-body {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  min-height: 0;
}

.picker-search {
  position: relative;
}

.picker-search .pi {
  position: absolute;
  left: var(--space-3);
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-muted);
}

.picker-search input {
  width: 100%;
  min-height: 44px;
  padding: 0 var(--space-3) 0 2.25rem;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  background: var(--bg-input);
  color: var(--text-primary);
  font: inherit;
  font-size: var(--fs-md);
}

.picker-search input:focus {
  outline: none;
  border-color: var(--main-color);
  box-shadow: var(--focus-glow);
}

.picker-list {
  list-style: none;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  max-height: 55dvh;
}

.picker-option {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  min-height: 48px;
  padding: 0 var(--space-2);
  border: none;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--text-primary);
  font: inherit;
  font-size: var(--fs-md);
  text-align: left;
  cursor: pointer;
}

.picker-option:focus-visible {
  outline: var(--focus-ring);
  outline-offset: -2px;
}

.picker-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.picker-count {
  color: var(--text-muted);
  font-size: var(--fs-sm);
}

.picker-check {
  color: var(--main-color);
  opacity: 0;
  transform: scale(0.6);
  transition: opacity var(--dur-short) linear, transform var(--dur-medium) var(--ease-spring);
}

.picker-option[aria-pressed="true"] {
  background: rgba(var(--main-color-rgb), 0.12);
  font-weight: 600;
}

.picker-option[aria-pressed="true"] .picker-check {
  opacity: 1;
  transform: none;
}

.picker-empty {
  margin: var(--space-4) 0;
  color: var(--text-muted);
  text-align: center;
}
</style>
