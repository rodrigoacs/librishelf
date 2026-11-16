<template>
  <!-- Opção grande de escolha única (ícone, título e explicação) -->
  <button
    type="button"
    role="radio"
    class="onb-choice"
    :class="{ active }"
    :aria-checked="active ? 'true' : 'false'"
    :disabled="disabled"
    @click="emit('select')"
  >
    <i
      :class="icon"
      aria-hidden="true"
    ></i>
    <span class="onb-choice-text">
      <span class="onb-choice-title">{{ title }}</span>
      <span class="onb-choice-desc">{{ text }}</span>
    </span>
  </button>
</template>

<script setup>
defineProps({
  icon: { type: String, required: true },
  title: { type: String, required: true },
  text: { type: String, default: '' },
  active: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false }
})
const emit = defineEmits(['select'])
</script>

<style scoped>
.onb-choice {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  width: 100%;
  padding: var(--space-4);
  border: 1px solid var(--border-color);
  border-radius: var(--card-radius);
  background: var(--bg-panel);
  color: var(--text-primary);
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: border-color var(--dur-short) var(--ease-standard);
}

.onb-choice:hover:not(:disabled),
.onb-choice.active {
  border-color: var(--main-color);
}

.onb-choice:focus-visible {
  outline: var(--focus-ring);
  outline-offset: var(--focus-offset);
}

.onb-choice > .pi {
  margin-top: 0.15rem;
  color: var(--main-color);
  font-size: var(--fs-xl);
}

.onb-choice-text {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  min-width: 0;
}

.onb-choice-title {
  font-weight: 600;
}

.onb-choice-desc {
  color: var(--text-secondary);
  font-size: var(--fs-sm);
  line-height: 1.4;
}
</style>
