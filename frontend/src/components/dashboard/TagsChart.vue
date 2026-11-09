<template>
  <DashboardCard
    :title="t('dashboard.favoriteGenres')"
    :empty="tags.length === 0 ? t('dashboard.noTagsData') : ''"
  >
    <ChartCanvas
      v-if="tags.length <= DONUT_MAX"
      type="doughnut"
      :data="chartData"
      :options="chartOptions"
      :aria-label="summary"
      class="h-full w-full"
    />
    <!-- Mais de 5 categorias: barras leem melhor que a rosca (6 cores só) -->
    <ul
      v-else
      class="tag-bars"
    >
      <li
        v-for="tag in tags"
        :key="tag.name"
      >
        <router-link
          :to="{ name: 'library', query: { tags: tag.name } }"
          class="tag-bar-row"
          :style="{ '--bar-color': colorFor(tag.name), '--bar-width': `${Math.max(4, (tag.count / topCount) * 100)}%` }"
        >
          <span class="tag-bar-name">{{ tag.name }}</span>
          <span
            class="tag-bar-track"
            aria-hidden="true"
          ><span class="tag-bar-fill"></span></span>
          <span class="tag-bar-count">{{ tag.count }}</span>
        </router-link>
      </li>
    </ul>
  </DashboardCard>
</template>

<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import DashboardCard from './DashboardCard.vue'
import ChartCanvas from '../ui/ChartCanvas.vue'
import { useChartPalette, pointerOnHover } from '../../composables/useChartPalette.js'
import { cssVar } from '../../composables/useTheme.js'
import { colorFor, tagColorName } from '../../utils/tagColors.js'

/** Categorias mais lidas: rosca até 5, lista com barras acima disso. */
const props = defineProps({
  // [{ name, count }], da mais lida para a menos
  tags: { type: Array, required: true }
})

const DONUT_MAX = 5

const { t } = useI18n()
const router = useRouter()
const palette = useChartPalette()

const topCount = computed(() => Math.max(1, ...props.tags.map(tag => tag.count)))
const summary = computed(() =>
  t('dashboard.tagsSummary', { list: props.tags.map(tag => `${tag.name}: ${tag.count}`).join(', ') }))

const chartData = computed(() => ({
  labels: props.tags.map(tag => tag.name),
  datasets: [{
    data: props.tags.map(tag => tag.count),
    // Mesma cor da categoria no resto do app
    backgroundColor: props.tags.map(tag => cssVar(`--${tagColorName(tag.name)}`) || palette.value.main),
    borderWidth: 0,
    hoverOffset: 10
  }]
}))

const chartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { position: 'bottom', labels: { color: palette.value.text, usePointStyle: true, boxWidth: 8 } }
  },
  onHover: pointerOnHover,
  onClick: (_, elements) => {
    const tag = elements.length ? props.tags[elements[0].index] : null
    if (tag) router.push({ name: 'library', query: { tags: tag.name } })
  }
}))
</script>

<style scoped>
.tag-bars {
  list-style: none;
  margin: 0;
  padding: 0;
  width: 100%;
  align-self: stretch;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  overflow-y: auto;
}

.tag-bar-row {
  display: grid;
  grid-template-columns: minmax(0, 8rem) minmax(0, 1fr) 2.5rem;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-2);
  margin: 0 -0.5rem;
  border-radius: var(--radius-md);
  color: inherit;
  text-decoration: none;
}

.tag-bar-row:hover {
  background: var(--bg-hover);
}

.tag-bar-row:focus-visible {
  outline: var(--focus-ring);
  outline-offset: var(--focus-offset);
}

.tag-bar-name {
  color: var(--text-primary);
  font-size: var(--fs-sm);
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tag-bar-track {
  height: 0.6rem;
  border-radius: var(--radius-pill);
  background: var(--bg-input);
  overflow: hidden;
}

.tag-bar-fill {
  display: block;
  height: 100%;
  width: var(--bar-width);
  border-radius: var(--radius-pill);
  background: var(--bar-color);
}

.tag-bar-count {
  color: var(--text-secondary);
  font-size: var(--fs-sm);
  text-align: right;
}
</style>
