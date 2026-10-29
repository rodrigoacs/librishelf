<template>
  <div class="number-field">
    <button
      type="button"
      class="step"
      :aria-label="t('common.decrease')"
      :disabled="modelValue != null && modelValue <= min"
      tabindex="-1"
      @click="step(-1)"
    >
      <i
        class="pi pi-minus"
        aria-hidden="true"
      ></i>
    </button>
    <input
      :id="inputId"
      type="number"
      inputmode="numeric"
      :min="min"
      :max="max"
      :value="modelValue ?? ''"
      @input="onInput"
      @blur="clamp"
    />
    <button
      type="button"
      class="step"
      :aria-label="t('common.increase')"
      :disabled="modelValue != null && modelValue >= max"
      tabindex="-1"
      @click="step(1)"
    >
      <i
        class="pi pi-plus"
        aria-hidden="true"
      ></i>
    </button>
  </div>
</template>

<script setup>
import { useI18n } from 'vue-i18n'

/** Número inteiro com − e + (no lugar do InputNumber). Setas do teclado também funcionam. */
const props = defineProps({
  modelValue: { type: Number, default: null },
  inputId: { type: String, default: undefined },
  min: { type: Number, default: 0 },
  max: { type: Number, default: 9999 }
})

const emit = defineEmits(['update:modelValue'])
const { t } = useI18n()

function limit(value) {
  return Math.min(props.max, Math.max(props.min, value))
}

function onInput(event) {
  const value = event.target.value === '' ? null : Math.trunc(Number(event.target.value))
  emit('update:modelValue', Number.isFinite(value) ? value : null)
}

function clamp() {
  if (props.modelValue != null) emit('update:modelValue', limit(props.modelValue))
}

function step(delta) {
  emit('update:modelValue', limit((props.modelValue ?? props.min) + delta))
}
</script>

<style scoped>
.number-field {
  display: inline-flex;
  align-items: stretch;
  height: 2.75rem;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  background: var(--bg-input);
  overflow: hidden;
}

.number-field:focus-within {
  border-color: var(--main-color);
  box-shadow: var(--focus-glow);
}

input {
  width: 4.5rem;
  border: none;
  background: transparent;
  color: var(--text-primary);
  font: inherit;
  font-size: var(--fs-md);
  font-weight: 600;
  text-align: center;
  outline: none;
  -moz-appearance: textfield;
  appearance: textfield;
}

input::-webkit-inner-spin-button,
input::-webkit-outer-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.step {
  width: 2.5rem;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
}

.step:hover:not(:disabled) {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.step:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
