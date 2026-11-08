<template>
  <div
    class="filters"
    role="radiogroup"
    :aria-label="label"
  >
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      role="radio"
      class="filter"
      :class="{ active: modelValue === option.value }"
      :aria-checked="modelValue === option.value"
      @click="emit('update:modelValue', option.value)"
    >{{ option.label }}</button>
  </div>
</template>

<script setup>
/** Filtro em pílulas das listas do Admin: v-model com o valor escolhido. */
defineProps({
  modelValue: { type: String, required: true },
  options: { type: Array, required: true }, // [{ value, label }]
  label: { type: String, required: true }
})
const emit = defineEmits(['update:modelValue'])
</script>

<style scoped>
/* No celular, rola na horizontal em vez de quebrar dentro da pílula */
.filters {
  display: inline-flex;
  max-width: 100%;
  overflow-x: auto;
  scrollbar-width: none;
  background: var(--bg-panel);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-pill);
  padding: var(--space-1);
  gap: var(--space-1);
}

.filter {
  border: none;
  background: none;
  font: inherit;
  font-size: var(--fs-sm);
  color: var(--text-secondary);
  padding: var(--space-1) var(--space-3);
  border-radius: var(--radius-pill);
  cursor: pointer;
  white-space: nowrap;
  flex: none;
}

.filter.active {
  background: rgba(var(--main-color-rgb), 0.16);
  color: var(--text-primary);
  font-weight: 600;
}

.filter:focus-visible {
  outline: var(--focus-ring);
  outline-offset: 1px;
}
</style>
