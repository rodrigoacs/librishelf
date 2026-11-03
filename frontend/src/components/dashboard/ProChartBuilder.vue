<template>
  <!-- Gráfico personalizado (Pro). A escolha fica só neste aparelho. -->
  <div class="chart-builder">
    <h3
      id="pro-chart-title"
      class="section-title"
    >{{ t('proStats.chart.title') }}</h3>

    <div class="builder-controls">
      <div
        v-for="control in controls"
        :key="control.key"
        class="builder-field"
      >
        <span
          :id="`pro-chart-${control.key}`"
          class="builder-label"
        >{{ t(`proStats.chart.fields.${control.key}`) }}</span>
        <AppSelect
          :modelValue="config[control.key]"
          :options="control.options"
          :ariaLabelledby="`pro-chart-${control.key}`"
          @update:modelValue="value => set(control.key, value)"
        />
      </div>
    </div>

    <div
      v-if="config.period === 'custom'"
      class="builder-custom"
    >
      <DateField
        id="pro-chart-from"
        v-model="customFrom"
        :label="t('proStats.from')"
      />
      <DateField
        id="pro-chart-to"
        v-model="customTo"
        :label="t('proStats.to')"
        :minDate="customFrom"
      />
      <AppButton
        :label="t('proStats.compare.apply')"
        class="btn-sm"
        :disabled="!customFrom || !customTo || customFrom > customTo"
        :loading="loading"
        @click="load"
      />
    </div>

    <AppSkeleton
      v-if="loading && !result"
      height="260px"
    />
    <p
      v-else-if="error"
      class="no-data"
    >{{ error }}</p>
    <template v-else-if="result">
      <p
        v-if="!hasData"
        class="no-data"
      >{{ t('proStats.chart.empty') }}</p>
      <template v-else>
        <div class="chart-box">
          <ChartCanvas
            :type="chartType"
            :data="chartData"
            :options="chartOptions"
            :aria-label="summary"
          />
        </div>
        <ChartDataTable
          :caption="summary"
          :label-header="t(`proStats.chart.groups.${result.group}`)"
          :value-header="t(`proStats.chart.metrics.${result.metric}`)"
          :rows="rows"
        />
      </template>
    </template>
  </div>
</template>

<script setup>
import { computed, reactive, ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import api from '../../services/api.js'
import { useTheme, cssVar } from '../../composables/useTheme.js'
import AppSelect from '../ui/AppSelect.vue'
import AppButton from '../ui/AppButton.vue'
import AppSkeleton from '../ui/AppSkeleton.vue'
import ChartCanvas from '../ui/ChartCanvas.vue'
import ChartDataTable from '../ui/ChartDataTable.vue'
import DateField from '../form/DateField.vue'
import { CHART_PERIODS, chartPeriod, isoDate, fromIso } from '../../utils/statPeriods.js'

const METRICS = ['readings', 'pages', 'rating', 'days']
const GROUPS = ['month', 'year', 'weekday', 'author', 'publisher', 'category', 'rating', 'length']
const TYPES = ['bar', 'line', 'doughnut']
const TIME_GROUPS = new Set(['month', 'year', 'weekday'])
const STORAGE_KEY = 'librishelf:pro-chart'

const { t, locale } = useI18n()
const { themeVersion } = useTheme()
const dateLocale = computed(() => (locale.value === 'en' ? 'en-US' : 'pt-BR'))

const DEFAULTS = { metric: 'readings', group: 'month', type: 'bar', period: 'last12' }

// localStorage pode não existir (modo privado): volta para o padrão
function restore() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
    return {
      metric: METRICS.includes(saved.metric) ? saved.metric : DEFAULTS.metric,
      group: GROUPS.includes(saved.group) ? saved.group : DEFAULTS.group,
      type: TYPES.includes(saved.type) ? saved.type : DEFAULTS.type,
      period: [...CHART_PERIODS, 'custom'].includes(saved.period) ? saved.period : DEFAULTS.period,
      from: typeof saved.from === 'string' ? saved.from : null,
      to: typeof saved.to === 'string' ? saved.to : null
    }
  } catch {
    return { ...DEFAULTS, from: null, to: null }
  }
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...config,
      from: customFrom.value ? isoDate(customFrom.value) : null,
      to: customTo.value ? isoDate(customTo.value) : null
    }))
  } catch { /* modo privado */ }
}

const saved = restore()
const config = reactive({ metric: saved.metric, group: saved.group, type: saved.type, period: saved.period })
const customFrom = ref(saved.from ? fromIso(saved.from) : null)
const customTo = ref(saved.to ? fromIso(saved.to) : null)

const result = ref(null)
const loading = ref(false)
const error = ref('')

const options = (list, text) => list.map(value => ({ value, label: text(value) }))

const controls = computed(() => [
  { key: 'metric', options: options(METRICS, v => t(`proStats.chart.metrics.${v}`)) },
  { key: 'group', options: options(GROUPS, v => t(`proStats.chart.groups.${v}`)) },
  { key: 'type', options: options(TYPES, v => t(`proStats.chart.types.${v}`)) },
  { key: 'period', options: options([...CHART_PERIODS, 'custom'], v => t(`proStats.chart.periods.${v}`)) }
])

function set(key, value) {
  config[key] = value
  if (key === 'period' && value === 'custom') {
    if (!customFrom.value || !customTo.value) {
      const range = chartPeriod('last12')
      customFrom.value = fromIso(range.from)
      customTo.value = fromIso(range.to)
    }
    persist()
    return
  }
  persist()
  // Trocar só o tipo não precisa ir ao servidor
  if (key !== 'type') load()
}

async function load() {
  const range = config.period === 'custom'
    ? { from: isoDate(customFrom.value), to: isoDate(customTo.value) }
    : chartPeriod(config.period)
  persist()
  loading.value = true
  error.value = ''
  try {
    result.value = await api.getProChart({ metric: config.metric, group: config.group, ...range })
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

// Contagens (leituras, páginas) não têm casa decimal no eixo
const counting = computed(() => ['readings', 'pages'].includes(result.value.metric))

const hasData = computed(() => result.value.points.some(point => point.value))

// Rosca não serve para série no tempo nem para média: vira barra
const chartType = computed(() => {
  if (config.type !== 'doughnut') return config.type
  const additive = result.value.metric === 'readings' || result.value.metric === 'pages'
  return additive && !TIME_GROUPS.has(result.value.group) ? 'doughnut' : 'bar'
})

function label(key) {
  const group = result.value.group
  if (group === 'month') {
    const [y, m] = key.split('-').map(Number)
    return new Date(y, m - 1, 1).toLocaleDateString(dateLocale.value, { month: 'short', year: '2-digit' }).replace('.', '')
  }
  if (group === 'weekday') {
    // 2024-01-01 foi uma segunda-feira (ISO: 1 = segunda)
    return new Date(2024, 0, Number(key)).toLocaleDateString(dateLocale.value, { weekday: 'short' }).replace('.', '')
  }
  if (group === 'rating') return t('proStats.chart.stars', { n: Number(key) }, Number(key))
  if (group === 'length') return t(`proStats.length.${key}`)
  return key
}

const valueText = value => (value === null ? '—' : new Intl.NumberFormat(dateLocale.value, { maximumFractionDigits: 2 }).format(value))

const palette = computed(() => {
  themeVersion.value
  return {
    main: cssVar('--main-color') || '#3a86ff',
    text: cssVar('--text-secondary') || '#a1a1aa',
    grid: cssVar('--border-color') || 'rgba(255,255,255,0.1)',
    series: ['--blue', '--orange', '--green', '--purple', '--red', '--yellow'].map(name => cssVar(name) || '#888')
  }
})

const chartData = computed(() => {
  const points = result.value.points
  const round = chartType.value === 'doughnut'
  return {
    labels: points.map(point => label(point.key)),
    datasets: [{
      label: t(`proStats.chart.metrics.${result.value.metric}`),
      data: points.map(point => point.value),
      backgroundColor: round ? points.map((_, i) => palette.value.series[i % palette.value.series.length]) : palette.value.main,
      borderColor: palette.value.main,
      borderRadius: round ? 0 : 6,
      borderWidth: round ? 0 : 2,
      tension: 0,
      spanGaps: true
    }]
  }
})

const chartOptions = computed(() => {
  const base = { responsive: true, maintainAspectRatio: false }
  if (chartType.value === 'doughnut') {
    return { ...base, plugins: { legend: { position: 'bottom', labels: { color: palette.value.text, usePointStyle: true, boxWidth: 8 } } } }
  }
  return {
    ...base,
    plugins: { legend: { display: false } },
    // Muitas categorias: barras deitadas leem melhor no celular
    indexAxis: chartType.value === 'bar' && !TIME_GROUPS.has(result.value.group) && result.value.points.length > 6 ? 'y' : 'x',
    scales: {
      y: { beginAtZero: true, grid: { color: palette.value.grid }, ticks: { color: palette.value.text, precision: counting.value ? 0 : undefined } },
      x: { beginAtZero: true, grid: { display: false }, ticks: { color: palette.value.text, maxRotation: 0, autoSkip: true, precision: counting.value ? 0 : undefined } }
    }
  }
})

const rows = computed(() => result.value.points.map(point => ({ label: label(point.key), value: valueText(point.value) })))

const summary = computed(() => t('proStats.chart.summary', {
  metric: t(`proStats.chart.metrics.${result.value.metric}`),
  group: t(`proStats.chart.groups.${result.value.group}`)
}))

onMounted(() => {
  if (config.period === 'custom' && (!customFrom.value || !customTo.value)) config.period = DEFAULTS.period
  load()
})
</script>

<style scoped>
.chart-builder h3 {
  margin: 0;
}

.builder-controls {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--space-3);
}

.builder-field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  min-width: 0;
}

.builder-label {
  color: var(--text-secondary);
  font-size: var(--fs-sm);
  font-weight: 600;
}

.builder-custom {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: var(--space-3);
}

.chart-box {
  position: relative;
  height: 300px;
}

.chart-box > .chart-canvas {
  position: relative;
  width: 100%;
  height: 100%;
}

.no-data {
  margin: 0;
  color: var(--text-secondary);
  font-style: italic;
}

@media (max-width: 639.98px) {
  .builder-controls {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
