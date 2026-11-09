<template>
  <DashboardCard
    :title="t('dashboard.readingByMonth', { year })"
    :hint="t('dashboard.clickHint')"
    :empty="total === 0 ? t('dashboard.noMonthData', { year }) : ''"
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
        v-if="total > 0"
        :caption="t('dashboard.readingByMonth', { year })"
        :label-header="t('dashboard.month')"
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
import { useIsPhone } from '../../composables/useIsPhone.js'
import { dateTag, monthNames } from '../../utils/dates.js'

/** Leituras por mês do ano; clicar numa coluna abre a biblioteca filtrada. */
const props = defineProps({
  year: { type: Number, required: true },
  // [{ label: nome do mês, value: leituras }] × 12
  rows: { type: Array, required: true },
  total: { type: Number, required: true }
})

const { t, locale } = useI18n()
const router = useRouter()
const palette = useChartPalette()

// Celular: iniciais dos meses, retas (antes o Chart.js girava "jan.", "fev."… em 45°)
const phone = useIsPhone()
const labels = computed(() => monthNames(dateTag(locale.value), phone.value ? 'narrow' : 'short'))

// Texto alternativo (o canvas não tem conteúdo para leitor de tela)
const summary = computed(() => {
  const top = props.rows.reduce((best, row, i) => (row.value > best.count ? { count: row.value, i } : best), { count: 0, i: 0 })
  return t('dashboard.monthSummary', { n: props.total, year: props.year, month: props.rows[top.i]?.label, top: top.count }, props.total)
})

const chartData = computed(() => ({
  labels: labels.value,
  datasets: [{
    // Conta leituras (releitura conta de novo), não livros
    label: t('dashboard.readings'),
    data: props.rows.map(row => row.value),
    // Cor de destaque, como na Retrospectiva
    backgroundColor: palette.value.main,
    borderRadius: 6
  }]
}))

const chartOptions = computed(() => clickableBarOptions(palette.value, index => {
  if (!props.rows[index]?.value) return
  router.push({ name: 'library', query: { status: 'read', year: String(props.year), month: String(index + 1) } })
}))
</script>
