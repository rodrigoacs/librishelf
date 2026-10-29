<template>
  <span class="app-chip">
    <span class="app-chip-label">{{ label }}</span>
    <button
      v-if="removable"
      type="button"
      class="app-chip-remove"
      :aria-label="t('common.removeItem', { name: label })"
      @click="emit('remove')"
    >
      <i
        class="pi pi-times"
        aria-hidden="true"
      ></i>
    </button>
  </span>
</template>

<script setup>
import { useI18n } from 'vue-i18n'

/** Etiqueta com botão de tirar (filtros ativos da Biblioteca). */
defineProps({
  label: { type: String, required: true },
  removable: { type: Boolean, default: false }
})

const emit = defineEmits(['remove'])
const { t } = useI18n()
</script>

<style scoped>
.app-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  max-width: 100%;
  min-height: 1.9rem;
  padding: 0.15rem 0.3rem 0.15rem 0.75rem;
  border-radius: 999px;
  font-size: var(--fs-sm);
  line-height: 1.2;
}

.app-chip-label {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.app-chip-remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 1.5rem;
  height: 1.5rem;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: inherit;
  opacity: 0.7;
  cursor: pointer;
}

.app-chip-remove .pi {
  font-size: var(--fs-2xs);
}

.app-chip-remove:hover {
  opacity: 1;
  background: rgba(127, 127, 127, 0.2);
}

.app-chip-remove:focus-visible {
  outline: var(--focus-ring);
}
</style>
