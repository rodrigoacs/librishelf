<template>
  <DashboardCard
    :title="t('dashboard.readingByYear')"
    :empty="years.length === 0 ? t('dashboard.noYearData') : ''"
  >
    <ChartCanvas
      type="bar"
      :data="chartData"
      :options="chartOptions"
      :aria-label="summary"
      class="h-full"
    />
    <template #after>
      <ChartDataTable
        v-if="years.length"
        :caption="t('dashboard.readingByYear')"
        :label-header="t('dashboard.year')"
        :value-header="t('dashboard.readings')"
        :rows="rows"
      />
    </template>
  </DashboardCard>
</template>

<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import DashboardCard from './DashboardCard.vue'
import ChartCanvas from '../ui/ChartCanvas.vue'
import ChartDataTable from '../ui/ChartDataTable.vue'
import { useChartPalette, clickableBarOptions } from '../../composables/useChartPalette.js'

/** Leituras por ano; clicar numa coluna abre os lidos daquele ano. */
const props = defineProps({
  // [{ year, count }] em qualquer ordem
  years: { type: Array, required: true }
})

const { t } = useI18n()
const router = useRouter()
const palette = useChartPalette()

const sorted = computed(() => [...props.years].sort((a, b) => a.year - b.year))
const rows = computed(() => sorted.value.map(item => ({ label: String(item.year), value: item.count })))
const summary = computed(() =>
  t('dashboard.yearSummary', { list: rows.value.map(row => `${row.label}: ${row.value}`).join(', ') }))

const chartData = computed(() => ({
  labels: sorted.value.map(item => item.year),
  datasets: [{
    label: t('dashboard.readings'),
    data: sorted.value.map(item => item.count),
    // Cor de destaque em todos os anos
    backgroundColor: palette.value.main,
    borderRadius: 6
  }]
}))

const chartOptions = computed(() => clickableBarOptions(palette.value, index => {
  const item = sorted.value[index]
  if (item) router.push({ name: 'library', query: { status: 'read', year: String(item.year) } })
}))
</script>
