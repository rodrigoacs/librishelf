<template>
  <div
    class="authors-input"
    :class="{ invalid: Boolean(error), floated: focused || modelValue.length > 0 || draft !== '' }"
  >
    <div class="field-box">
      <div
        class="chips-box"
        @click="inputEl?.focus()"
      >
        <span
          v-for="(name, index) in modelValue"
          :key="name"
          class="author-chip"
        >
          {{ name }}
          <button
            type="button"
            class="author-chip-remove"
            :aria-label="t('common.removeItem', { name })"
            @click.stop="removeAt(index)"
          >
            <i
              class="pi pi-times"
              aria-hidden="true"
            ></i>
          </button>
        </span>
        <input
          :id="inputId"
          ref="inputEl"
          v-model="draft"
          class="chips-input"
          autocomplete="off"
          :aria-invalid="error ? 'true' : undefined"
          :aria-describedby="describedBy"
          :disabled="modelValue.length >= maxAuthors"
          @keydown.enter.prevent="commit"
          @keydown.backspace="onBackspace"
          @focus="focused = true"
          @blur="onBlur"
        />
      </div>
      <label
        :for="inputId"
        class="field-label"
      >{{ label }}<span
          v-if="required"
          class="required-mark"
          aria-hidden="true"
        > *</span></label>
    </div>
    <small
      v-if="error"
      :id="`${inputId}-error`"
      class="field-error"
    >
      <i
        class="pi pi-exclamation-circle"
        aria-hidden="true"
      ></i>
      {{ error }}
    </small>
    <small
      :id="`${inputId}-hint`"
      class="field-hint"
    >{{ t('book.authors_hint') }}</small>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

/**
 * Lista de autores como etiquetas, com rótulo flutuante igual ao TextField.
 * Cada autor entra com Enter (ou ao sair do campo), então vírgula faz parte
 * do nome e nunca separa autores.
 */
const props = defineProps({
  modelValue: { type: Array, default: () => [] },
  inputId: { type: String, required: true },
  label: { type: String, default: '' },
  error: { type: String, default: '' },
  required: { type: Boolean, default: false }
})

const emit = defineEmits(['update:modelValue'])
const { t } = useI18n()
const focused = ref(false)
const draft = ref('')
const inputEl = ref(null)

// Mesmo limite do backend (utils/nameList.js → MAX_NAMES).
const maxAuthors = 30

const describedBy = computed(() => [props.error ? `${props.inputId}-error` : '', `${props.inputId}-hint`].filter(Boolean).join(' '))

// Enter (ou sair do campo) põe o nome digitado na lista
function commit() {
  if (!draft.value.trim()) return
  onUpdate([...props.modelValue, draft.value])
  draft.value = ''
}

function onBlur() {
  focused.value = false
  commit()
}

// Backspace com o campo vazio tira o último autor
function onBackspace() {
  if (draft.value === '' && props.modelValue.length) removeAt(props.modelValue.length - 1)
}

function removeAt(index) {
  onUpdate(props.modelValue.filter((_, i) => i !== index))
}

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
  gap: 0.3rem;
  width: 100%;
  min-width: 0;
}

.field-box {
  position: relative;
  background-color: var(--bg-input);
  border: 1px solid transparent;
  border-radius: 10px;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.field-box:focus-within {
  border-color: var(--main-color);
  box-shadow: 0 0 0 3px rgba(var(--main-color-rgb), 0.18);
}

.invalid .field-box {
  border-color: var(--red);
}

.chips-box {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
  min-height: 3.25rem;
  padding: 1.4rem 0.6rem 0.4rem;
  cursor: text;
}

.author-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  padding: 0.15rem 0.2rem 0.15rem 0.65rem;
  border-radius: 999px;
  background-color: rgba(var(--main-color-rgb), 0.15);
  color: var(--text-primary);
  font-size: var(--fs-sm);
}

.author-chip-remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.4rem;
  height: 1.4rem;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: inherit;
  opacity: 0.7;
  cursor: pointer;
}

.author-chip-remove .pi {
  font-size: 0.65rem;
}

.author-chip-remove:hover,
.author-chip-remove:focus-visible {
  opacity: 1;
  background: rgba(127, 127, 127, 0.25);
  outline: none;
}

.chips-input {
  flex: 1;
  min-width: 8rem;
  padding: 0.1rem 0.3rem;
  border: none;
  background: transparent;
  color: var(--text-primary);
  font: inherit;
  font-size: var(--fs-md);
  outline: none;
}

.field-label {
  position: absolute;
  left: 0.9rem;
  right: 0.9rem;
  top: 1rem;
  color: var(--text-secondary);
  font-size: var(--fs-md);
  line-height: 1.2;
  pointer-events: none;
  transform-origin: left top;
  transition: transform 0.15s ease, color 0.15s ease;
}

.floated .field-label {
  transform: translateY(-0.6rem) scale(0.8);
  font-weight: 600;
}

.field-box:focus-within .field-label {
  color: var(--main-color);
}

.invalid .field-label {
  color: var(--red);
}

.required-mark {
  color: var(--text-muted);
}

.field-error {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  color: var(--red);
  font-size: var(--fs-xs);
  font-weight: 500;
}

.field-error .pi {
  font-size: var(--fs-xs);
}

.field-hint {
  color: var(--text-muted);
  font-size: var(--fs-xs);
}

@media (prefers-reduced-motion: reduce) {
  .field-label {
    transition: none;
  }
}
</style>
