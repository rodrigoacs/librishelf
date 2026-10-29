<template>
  <button
    :type="type"
    class="icon-button"
    :class="[`tone-${tone}`, { active }]"
    :aria-label="label"
    :title="title ? label : undefined"
  >
    <i
      :class="icon"
      aria-hidden="true"
    ></i>
  </button>
</template>

<script setup>
/**
 * Botão redondo só de ícone, sempre com rótulo para leitor de tela.
 * 34px no mouse, 44px em tela de toque (mesmo desenho, área maior).
 */
defineProps({
  icon: { type: String, required: true },
  label: { type: String, required: true },
  type: { type: String, default: 'button' },
  tone: { type: String, default: 'plain' }, // plain | overlay
  active: { type: Boolean, default: false },
  title: { type: Boolean, default: false }
})
</script>

<style scoped>
.icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 34px;
  height: 34px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease;
}

.icon-button .pi {
  font-size: var(--fs-md);
}

.icon-button:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.icon-button.tone-overlay {
  background: rgba(0, 0, 0, 0.35);
  color: #ffffff;
}

.icon-button.tone-overlay:hover {
  background: rgba(0, 0, 0, 0.55);
}

.icon-button.active {
  background: var(--main-solid);
  color: var(--on-main);
}

.icon-button:focus-visible {
  outline: var(--focus-ring);
  outline-offset: var(--focus-offset);
}

@media (pointer: coarse) {
  .icon-button {
    width: 44px;
    height: 44px;
  }
}
</style>
