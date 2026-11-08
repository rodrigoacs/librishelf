<template>
  <div
    class="check-field"
    :class="{ invalid: Boolean(error) }"
  >
    <label
      class="check-label"
      :for="id"
    >
      <input
        :id="id"
        ref="control"
        type="checkbox"
        :checked="modelValue"
        :aria-invalid="error ? 'true' : undefined"
        :aria-describedby="error ? `${id}-error` : undefined"
        @change="emit('update:modelValue', $event.target.checked)"
      />
      <span class="check-text"><slot /></span>
    </label>
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
import { ref } from 'vue'

/** Caixa de marcar com texto livre (slot) e erro embaixo, como o TextField. */
defineProps({
  id: { type: String, required: true },
  modelValue: { type: Boolean, default: false },
  error: { type: String, default: '' }
})

const emit = defineEmits(['update:modelValue'])
const control = ref(null)

defineExpose({ focus: () => control.value?.focus() })
</script>

<style scoped>
.check-field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.check-label {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  min-height: 2.75rem;
  cursor: pointer;
  color: var(--text-secondary);
  font-size: var(--fs-sm);
  line-height: 1.5;
}

.check-label input {
  flex: none;
  width: 1.15rem;
  height: 1.15rem;
  margin: 0.15rem 0 0;
  accent-color: var(--main-solid);
}

.check-label input:focus-visible {
  outline: var(--focus-ring);
  outline-offset: var(--focus-offset);
}

.check-text :deep(a) {
  color: var(--main-color);
  font-weight: 600;
}

.invalid .check-label input {
  outline: 2px solid var(--red);
  outline-offset: 1px;
}

.field-error {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  color: var(--red);
  font-size: var(--fs-xs);
  font-weight: 500;
}

.field-error .pi {
  font-size: var(--fs-xs);
}
</style>
