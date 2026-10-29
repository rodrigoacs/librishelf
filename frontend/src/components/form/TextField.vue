<template>
  <div
    class="text-field"
    :class="{ invalid: Boolean(error), multiline, 'has-suffix': $slots.suffix, large }"
  >
    <div class="field-box">
      <textarea
        v-if="multiline"
        :id="id"
        ref="control"
        class="field-control"
        :value="modelValue ?? ''"
        :rows="rows"
        :maxlength="maxlength"
        placeholder=" "
        :required="required"
        :aria-invalid="error ? 'true' : undefined"
        :aria-describedby="describedBy"
        @input="emit('update:modelValue', $event.target.value)"
      ></textarea>
      <input
        v-else
        :id="id"
        ref="control"
        class="field-control"
        :value="modelValue ?? ''"
        :type="type"
        :inputmode="inputmode"
        :maxlength="maxlength"
        :list="list"
        :autocomplete="autocomplete"
        placeholder=" "
        :required="required"
        :aria-invalid="error ? 'true' : undefined"
        :aria-describedby="describedBy"
        v-bind="inputAttrs"
        @input="emit('update:modelValue', $event.target.value)"
      />
      <label
        :for="id"
        class="field-label"
      >{{ label }}<span
          v-if="required"
          class="required-mark"
          aria-hidden="true"
        > *</span></label>
      <slot name="suffix" />
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
    <small
      v-if="hint"
      :id="`${id}-hint`"
      class="field-hint"
      :aria-live="hintLive ? 'polite' : undefined"
    >{{ hint }}</small>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'

/**
 * Campo de texto com rótulo flutuante: o rótulo fica dentro da caixa e sobe
 * (sem sumir) quando a pessoa digita. Erro e dica ficam embaixo, ligados ao
 * campo por aria-describedby.
 */
const props = defineProps({
  modelValue: { type: [String, Number], default: '' },
  id: { type: String, required: true },
  label: { type: String, required: true },
  hint: { type: String, default: '' },
  hintLive: { type: Boolean, default: false },
  error: { type: String, default: '' },
  type: { type: String, default: 'text' },
  inputmode: { type: String, default: undefined },
  maxlength: { type: [String, Number], default: undefined },
  list: { type: String, default: undefined },
  autocomplete: { type: String, default: 'off' },
  required: { type: Boolean, default: false },
  multiline: { type: Boolean, default: false },
  rows: { type: [String, Number], default: 3 },
  large: { type: Boolean, default: false },
  inputAttrs: { type: Object, default: () => ({}) }
})

const emit = defineEmits(['update:modelValue'])
const control = ref(null)

const describedBy = computed(() => {
  const ids = []
  if (props.error) ids.push(`${props.id}-error`)
  if (props.hint) ids.push(`${props.id}-hint`)
  return ids.join(' ') || undefined
})

defineExpose({ focus: () => control.value?.focus() })
</script>

<style scoped>
.text-field {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  min-width: 0;
}

.field-box {
  position: relative;
  display: flex;
  align-items: center;
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

.invalid .field-box:focus-within {
  box-shadow: 0 0 0 3px rgba(var(--red-rgb), 0.18);
}

.field-control {
  flex: 1;
  min-width: 0;
  width: 100%;
  background: transparent;
  border: none;
  outline: none;
  color: var(--text-primary);
  font: inherit;
  font-size: var(--fs-md);
  padding: 1.45rem 0.9rem 0.5rem;
  border-radius: var(--radius-md);
}

.multiline .field-control {
  resize: vertical;
  min-height: 6rem;
  line-height: 1.5;
}

.large .field-control {
  font-size: var(--fs-lg);
  font-weight: 600;
}

/* O placeholder é um espaço: serve só para o :placeholder-shown saber se o campo está vazio */
.field-control::placeholder {
  color: transparent;
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
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: transform 0.15s ease, color 0.15s ease;
}

.large .field-label {
  top: 1.05rem;
}

.has-suffix .field-label {
  right: 3rem;
}

.field-control:focus + .field-label,
.field-control:not(:placeholder-shown) + .field-label {
  transform: translateY(-0.6rem) scale(0.8);
  font-weight: 600;
}

.field-control:focus + .field-label {
  color: var(--main-color);
}

.invalid .field-label,
.invalid .field-control:focus + .field-label {
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
