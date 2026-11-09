<template>
  <div class="kpi-grid">
    <template v-if="loading">
      <AppSkeleton
        v-for="n in cards.length"
        :key="n"
        height="120px"
        class="kpi-skeleton"
      />
    </template>
    <router-link
      v-for="card in cards"
      v-else
      :key="card.key"
      :to="{ name: 'library', query: card.query }"
      class="kpi-card"
      :class="card.key"
    >
      <i
        class="pi pi-arrow-up-right kpi-arrow"
        aria-hidden="true"
      ></i>
      <div class="kpi-info">
        <span class="stat-value">{{ stats[card.stat] }}</span>
        <span class="stat-label">{{ t(card.label) }}</span>
        <span
          v-if="card.key === 'read'"
          class="stat-note"
        >{{ t('dashboard.ofShelf', { n: readingRate }) }}</span>
      </div>
    </router-link>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import AppSkeleton from '../ui/AppSkeleton.vue'

/** Os quatro números do Painel; cada cartão abre a biblioteca filtrada. */
const props = defineProps({
  // { totalBooks, readBooks, readingBooks, wantBooks }; dispensável com loading
  stats: { type: Object, default: null },
  loading: { type: Boolean, default: false }
})

const { t } = useI18n()

const cards = [
  { key: 'total', stat: 'totalBooks', label: 'dashboard.totalBooks', query: {} },
  { key: 'read', stat: 'readBooks', label: 'dashboard.readBooks', query: { status: 'read' } },
  { key: 'reading', stat: 'readingBooks', label: 'dashboard.readingNow', query: { status: 'reading' } },
  { key: 'want', stat: 'wantBooks', label: 'dashboard.wantToRead', query: { status: 'want' } }
]

const readingRate = computed(() => {
  if (!props.stats?.totalBooks) return 0
  return Math.round((props.stats.readBooks / props.stats.totalBooks) * 100)
})
</script>

<style scoped>
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--space-6);
  margin-bottom: var(--space-7);
}

.kpi-card {
  --kpi-color: var(--main-color);
  position: relative;
  background-color: var(--bg-panel);
  border: 1px solid var(--border-color);
  border-radius: var(--card-radius);
  padding: var(--card-pad);
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-1);
  cursor: pointer;
  text-decoration: none;
  color: inherit;
  transition: transform 0.2s, border-color 0.2s;
}

.kpi-card:hover {
  transform: translateY(-3px);
  border-color: var(--border-hover);
}

.kpi-card:focus-visible {
  outline: var(--focus-ring);
  outline-offset: var(--focus-offset);
}

.kpi-card.total {
  --kpi-color: var(--green);
}

.kpi-card.read {
  --kpi-color: var(--red);
}

.kpi-card.reading {
  --kpi-color: var(--blue);
}

.kpi-card.want {
  --kpi-color: var(--purple);
}

/* Seta discreta: o cartão leva para a biblioteca filtrada */
.kpi-arrow {
  position: absolute;
  top: 0.85rem;
  right: 0.85rem;
  font-size: var(--fs-xs);
  color: var(--text-muted);
  transition: color 0.2s, transform 0.2s;
}

.kpi-card:hover .kpi-arrow,
.kpi-card:focus-visible .kpi-arrow {
  color: var(--kpi-color);
  transform: translate(2px, -2px);
}

.kpi-info {
  display: flex;
  flex-direction: column;
}

.kpi-skeleton {
  background-color: var(--bg-panel);
  border-radius: var(--card-radius);
}

@media (max-width: 1279.98px) {
  .kpi-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

/* Celular: dois por linha, os quatro números cabem na primeira tela */
@media (max-width: 639.98px) {
  .kpi-grid {
    gap: var(--space-3);
    margin-bottom: var(--space-5);
  }
}
</style>
