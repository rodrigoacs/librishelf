<template>
  <div class="active-filters-bar">
    <div class="filter-label">{{ t('library.filtering_by') }}</div>
    <div class="chips-container">
      <AppChip
        v-for="chip in otherChips"
        :key="chip.key"
        :label="chip.label"
        removable
        class="custom-chip theme-border"
        @remove="chip.remove"
      />
      <AppChip
        v-for="name in filters.author"
        :key="`author-${name}`"
        :label="name"
        removable
        class="custom-chip theme-border"
        @remove="emit('remove', { key: 'author', name })"
      />
      <AppChip
        v-for="name in filters.publisher"
        :key="`publisher-${name}`"
        :label="name"
        removable
        class="custom-chip theme-border"
        @remove="emit('remove', { key: 'publisher', name })"
      />
      <AppChip
        v-for="name in filters.tags"
        :key="`tag-${name}`"
        :label="'#' + name"
        removable
        class="custom-chip tag-chip"
        :style="{ '--tag-color': tagColor(name) }"
        @remove="emit('remove', { key: 'tags', name })"
      />
    </div>
    <AppButton
      :label="t('library.clear_all')"
      class="btn-text btn-sm btn-secondary clear-all-btn"
      @click="emit('reset')"
    />
  </div>
</template>

<script setup>
// Tablet e computador: "Filtrando por" com um chip por filtro ativo.
import { useI18n } from 'vue-i18n'
import AppButton from '../ui/AppButton.vue'
import AppChip from '../ui/AppChip.vue'
import { tagColor } from '../../utils/tagColors.js'

defineProps({
  filters: { type: Object, required: true },
  // Status, período, série, ISBN: [{ key, label, remove }]
  otherChips: { type: Array, required: true }
})

const emit = defineEmits(['remove', 'reset'])

const { t } = useI18n()
</script>

<style scoped>
.active-filters-bar {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  margin-top: var(--space-4);
  padding-top: var(--space-3);
  border-top: 1px solid var(--border-color);
  animation: slideDown 0.2s ease-out;
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.filter-label {
  font-size: var(--fs-sm);
  color: var(--text-muted);
  text-transform: uppercase;
  font-weight: 600;
}

.chips-container {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  flex: 1;
}

.custom-chip {
  background-color: var(--bg-input);
  color: var(--text-primary);
  font-size: var(--fs-sm);
  border: 1px solid var(--border-color);
}

.custom-chip.tag-chip {
  color: color-mix(in srgb, var(--tag-color) var(--tint-text), var(--text-primary));
  background: color-mix(in srgb, var(--tag-color) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--tag-color) 40%, transparent);
}

.custom-chip.theme-border {
  border-color: rgba(var(--main-color-rgb), 0.3);
  background-color: rgba(var(--main-color-rgb), 0.05);
  color: var(--text-primary);
}

.clear-all-btn {
  font-size: var(--fs-sm);
  white-space: nowrap;
}

/* Filtros ativos numa linha só: os chips rolam para o lado e o
   "Limpar tudo" fica sempre à mão no fim. */
@media (max-width: 1023.98px) {
  .active-filters-bar {
    margin-top: var(--space-2);
    gap: var(--space-2);
    flex-wrap: nowrap;
  }

  .filter-label {
    display: none;
  }

  .chips-container {
    flex: 1;
    min-width: 0;
    flex-wrap: nowrap;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .chips-container::-webkit-scrollbar {
    display: none;
  }

  .chips-container .custom-chip {
    flex-shrink: 0;
  }

  .clear-all-btn.btn {
    flex-shrink: 0;
    padding: var(--space-1) var(--space-2);
  }
}
</style>
