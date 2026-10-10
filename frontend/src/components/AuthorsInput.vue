<template>
  <div
    class="authors-input"
    :class="{ invalid }"
  >
    <Chips
      :modelValue="modelValue"
      :inputId="inputId"
      :placeholder="modelValue.length ? '' : placeholder"
      :allowDuplicate="false"
      addOnBlur
      :max="maxAuthors"
      :aria-invalid="invalid || undefined"
      :aria-describedby="`${inputId}-hint`"
      @update:modelValue="onUpdate"
    />
    <small
      :id="`${inputId}-hint`"
      class="authors-hint"
    >{{ t('book.authors_hint') }}</small>
  </div>
</template>

<script setup>
import Chips from 'primevue/chips'
import { useI18n } from 'vue-i18n'

/**
 * Lista de autores como etiquetas. Cada autor entra com Enter (ou ao sair do
 * campo), então vírgula faz parte do nome e nunca separa autores.
 */
const props = defineProps({
  modelValue: { type: Array, default: () => [] },
  inputId: { type: String, required: true },
  placeholder: { type: String, default: '' },
  invalid: { type: Boolean, default: false }
})

const emit = defineEmits(['update:modelValue'])
const { t } = useI18n()

// Mesmo limite do backend (utils/nameList.js → MAX_NAMES).
const maxAuthors = 30

function onUpdate(values) {
  const seen = new Set()
  const cleaned = []

  for (const value of values) {
    const name = String(value).trim().replace(/\s+/g, ' ')
    const key = name.toLocaleLowerCase()
    if (!name || seen.has(key)) continue
    seen.add(key)
    cleaned.push(name)
  }

  emit('update:modelValue', cleaned)
}
</script>

<style scoped>
.authors-input {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  width: 100%;
}

.authors-input :deep(.p-chips) {
  width: 100%;
}

.authors-input :deep(.p-chips-multiple-container) {
  width: 100%;
  min-height: 2.75rem;
  background-color: var(--bg-input);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 0.35rem 0.5rem;
  gap: 0.35rem;
  flex-wrap: wrap;
}

.authors-input :deep(.p-chips.p-focus .p-chips-multiple-container) {
  border-color: var(--main-color);
  box-shadow: 0 0 0 2px rgba(var(--main-color-rgb), 0.2);
}

.authors-input.invalid :deep(.p-chips-multiple-container) {
  border-color: var(--red);
}

.authors-input :deep(.p-chips-token) {
  background-color: rgba(var(--main-color-rgb), 0.15);
  color: var(--text-primary);
  border-radius: 999px;
  padding: 0.2rem 0.65rem;
  font-size: 0.9rem;
}

.authors-input :deep(.p-chips-input-token) {
  flex: 1;
  min-width: 8rem;
}

.authors-input :deep(.p-chips-input-token input),
.authors-input :deep(.p-chips-input-token input:focus) {
  width: 100%;
  color: var(--text-primary);
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
  outline: none;
  padding: 0.25rem 0.15rem;
  font-size: 0.95rem;
}

.authors-hint {
  color: var(--text-muted);
  font-size: 0.75rem;
}
</style>
