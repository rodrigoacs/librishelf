<template>
  <button
    type="button"
    class="pill-button"
    :class="{ active, 'icon-only': !$slots.default && !label }"
    :aria-pressed="pressable ? active : undefined"
    :disabled="disabled"
  >
    <i
      v-if="icon"
      :class="icon"
      aria-hidden="true"
    ></i>
    <span v-if="label">{{ label }}</span>
    <slot />
  </button>
</template>

<script setup>
/**
 * Botão redondo de alternar (status de leitura, filtros, grade/lista).
 * Ativo = fundo na cor de destaque com texto branco.
 */
defineProps({
  active: { type: Boolean, default: false },
  icon: { type: String, default: '' },
  label: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
  pressable: { type: Boolean, default: true }
})
</script>

<style scoped>
.pill-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  min-height: 2.25rem;
  padding: 0.4rem 0.9rem;
  border-radius: 999px;
  border: 1px solid var(--border-color);
  background: transparent;
  color: var(--text-secondary);
  font: inherit;
  font-size: var(--fs-sm);
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease;
}

.pill-button.icon-only {
  width: 2.25rem;
  padding: 0;
}

.pill-button .pi {
  font-size: var(--fs-sm);
}

.pill-button:hover:not(:disabled) {
  border-color: var(--main-color);
  color: var(--text-primary);
}

.pill-button.active {
  background: var(--main-solid);
  border-color: var(--main-solid);
  color: var(--on-main);
}

.pill-button.active:hover:not(:disabled) {
  color: var(--on-main);
}

.pill-button:disabled {
  opacity: 0.6;
  cursor: progress;
}

.pill-button:focus-visible {
  outline: 2px solid var(--main-color);
  outline-offset: 2px;
}

@media (pointer: coarse) {
  .pill-button {
    min-height: 2.75rem;
  }

  .pill-button.icon-only {
    width: 2.75rem;
  }
}
</style>
