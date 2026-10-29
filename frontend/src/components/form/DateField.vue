<template>
  <div
    class="date-field"
    :class="{ invalid: Boolean(error), floated: focused || Boolean(modelValue) }"
  >
    <div class="field-box">
      <input
        :id="id"
        type="date"
        class="field-control native"
        :value="toApiDate(modelValue) || ''"
        :min="minDate ? toApiDate(minDate) : undefined"
        :max="maxDate ? toApiDate(maxDate) : undefined"
        :aria-invalid="error ? 'true' : undefined"
        :aria-describedby="describedBy"
        @input="onNativeInput"
        @focus="focused = true"
        @blur="focused = false"
      />
      <label
        :for="id"
        class="field-label"
      >{{ label }}</label>
      <i
        class="pi pi-calendar field-icon"
        aria-hidden="true"
      ></i>
    </div>
    <small
      v-if="error"
      :id="`${id}-error`"
      class="field-error"
    >
      <i
        class="pi pi-exclamation-circle"
        aria-hidden="true"
      ></i>
      {{ error }}
    </small>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { toApiDate } from '../../utils/dates.js'

/**
 * Data com rótulo flutuante, no seletor nativo do navegador
 * (<input type="date">): calendário do sistema no celular e digitação
 * dia/mês/ano no computador.
 */
const props = defineProps({
  modelValue: { type: Date, default: null },
  id: { type: String, required: true },
  label: { type: String, required: true },
  error: { type: String, default: '' },
  minDate: { type: Date, default: null },
  maxDate: { type: Date, default: null }
})

const emit = defineEmits(['update:modelValue'])
const focused = ref(false)


const describedBy = computed(() => (props.error ? `${props.id}-error` : undefined))

function onNativeInput(event) {
  const value = event.target.value
  if (!value) return emit('update:modelValue', null)
  const [year, month, day] = value.split('-').map(Number)
  emit('update:modelValue', new Date(year, month - 1, day))
}
</script>

<style scoped>
.date-field {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  min-width: 0;
}

.field-box {
  position: relative;
  background-color: var(--bg-input);
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.field-box:focus-within {
  border-color: var(--main-color);
  box-shadow: var(--focus-glow);
}

.invalid .field-box {
  border-color: var(--red);
}

.field-control {
  width: 100%;
  min-height: 3.25rem;
  background: transparent;
  border: none;
  outline: none;
  box-shadow: none;
  color: var(--text-primary);
  font: inherit;
  font-size: var(--fs-md);
  padding: 1.45rem 2.5rem 0.5rem 0.9rem;
  border-radius: var(--radius-md);
}



/* Vazio e sem foco, o texto do seletor nativo (dd/mm/aaaa) fica escondido atrás do rótulo */
.date-field:not(.floated) .native {
  color: transparent;
}

.native::-webkit-calendar-picker-indicator {
  opacity: 0;
  position: absolute;
  inset: 0;
  width: auto;
  height: auto;
  cursor: pointer;
}

.field-label {
  position: absolute;
  left: 0.9rem;
  right: 2.5rem;
  top: 1rem;
  color: var(--text-secondary);
  font-size: var(--fs-md);
  line-height: 1.2;
  pointer-events: none;
  transform-origin: left top;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
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

.field-icon {
  position: absolute;
  right: 0.9rem;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-muted);
  pointer-events: none;
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

@media (prefers-reduced-motion: reduce) {
  .field-label {
    transition: none;
  }
}
</style>
