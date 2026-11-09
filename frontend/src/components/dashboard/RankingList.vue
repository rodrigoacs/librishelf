<template>
  <DashboardCard
    :title="title"
    :empty="items.length === 0 ? empty : ''"
    list
  >
    <router-link
      v-for="(item, index) in items"
      :key="item.name"
      :to="{ name: 'library', query: { [filter]: item.name } }"
      class="rank-row"
      :style="{ '--rank-color': colorFor(item.name) }"
    >
      <div class="rank">{{ index + 1 }}</div>
      <div class="name">{{ item.name }}</div>
      <div class="count">{{ t('dashboard.booksCount', { n: item.count }, item.count) }}</div>
    </router-link>
  </DashboardCard>
</template>

<script setup>
import { useI18n } from 'vue-i18n'
import DashboardCard from './DashboardCard.vue'
import { colorFor } from '../../utils/tagColors.js'

/** Ranking do Painel (autores, editoras): cada linha abre a biblioteca filtrada. */
defineProps({
  title: { type: String, required: true },
  empty: { type: String, required: true },
  // [{ name, count }]
  items: { type: Array, required: true },
  // Filtro da biblioteca: 'author' | 'publisher'
  filter: { type: String, required: true }
})

const { t } = useI18n()
</script>

<style scoped>
.rank-row {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  position: relative;
  padding: var(--space-2) var(--space-2);
  margin: 0 -0.5rem;
  border-radius: var(--radius-md);
  text-decoration: none;
  color: inherit;
}

.rank-row:hover {
  background: var(--bg-hover);
}

.rank-row:focus-visible {
  outline: var(--focus-ring);
  outline-offset: var(--focus-offset);
}

.rank {
  color: var(--rank-color);
  font-weight: bold;
  width: 20px;
}

.name {
  color: var(--text-primary);
  font-weight: 500;
  z-index: 2;
  width: 150px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.count {
  color: var(--text-secondary);
  font-size: var(--fs-md);
  margin-left: auto;
  z-index: 2;
}
</style>
