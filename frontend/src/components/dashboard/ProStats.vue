<template>
  <!-- Estatísticas avançadas (Pro: stats_advanced). Nada aqui é guardado, então
       sem Pro só aparece o aviso. -->
  <section
    v-if="plan"
    class="pro-stats"
    aria-labelledby="pro-stats-title"
  >
    <h2
      id="pro-stats-title"
      class="section-title pro-stats-heading"
    >{{ t('proStats.title') }}</h2>

    <ProNotice
      v-if="!canUse('stats_advanced')"
      feature="stats_advanced"
    />

    <div
      v-else
      class="pro-grid"
    >
      <!-- Comparar períodos -->
      <div class="pro-card wide">
        <div class="card-head">
          <h3
            id="pro-compare-title"
            class="section-title"
          >{{ t('proStats.compare.title') }}</h3>
          <AppSelect
            :modelValue="preset"
            :options="presetOptions"
            ariaLabelledby="pro-compare-title"
            class="card-select"
            @update:modelValue="changePreset"
          />
        </div>

        <div
          v-if="preset === 'custom'"
          class="custom-periods"
        >
          <fieldset
            v-for="side in ['a', 'b']"
            :key="side"
            class="period-fields"
          >
            <legend class="period-legend">{{ t(`proStats.compare.period.${side}`) }}</legend>
            <DateField
              :id="`pro-${side}-from`"
              v-model="custom[side].from"
              :label="t('proStats.from')"
            />
            <DateField
              :id="`pro-${side}-to`"
              v-model="custom[side].to"
              :label="t('proStats.to')"
              :minDate="custom[side].from"
            />
          </fieldset>
          <AppButton
            :label="t('proStats.compare.apply')"
            class="btn-sm"
            :disabled="!customReady"
            :loading="compareState.loading"
            @click="loadCompare"
          />
        </div>

        <AppSkeleton
          v-if="compareState.loading && !comparison"
          height="180px"
        />
        <p
          v-else-if="compareState.error"
          class="no-data"
        >{{ compareState.error }}</p>
        <div
          v-else-if="comparison"
          class="table-scroll"
        >
          <table class="compare-table">
            <caption class="sr-only">{{ t('proStats.compare.title') }}</caption>
            <thead>
              <tr>
                <th scope="col"><span class="sr-only">{{ t('proStats.compare.measure') }}</span></th>
                <th scope="col">{{ rangeLabel(comparison.a) }}</th>
                <th scope="col">{{ rangeLabel(comparison.b) }}</th>
                <th scope="col">{{ t('proStats.compare.change') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in compareRows"
                :key="row.key"
              >
                <th scope="row">{{ row.label }}</th>
                <td>{{ row.a }}</td>
                <td>{{ row.b }}</td>
                <td :class="['delta', row.tone]">{{ row.delta }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Ritmo de leitura -->
      <div class="pro-card">
        <h3 class="section-title">{{ t('proStats.pace.title', { year }) }}</h3>
        <AppSkeleton
          v-if="paceState.loading && !pace"
          height="220px"
        />
        <p
          v-else-if="paceState.error"
          class="no-data"
        >{{ paceState.error }}</p>
        <template v-else-if="pace">
          <p
            v-if="!pace.timed"
            class="no-data"
          >{{ t('proStats.pace.empty', { year }) }}</p>
          <template v-else>
            <div class="pace-kpis">
              <div class="pace-kpi">
                <span class="stat-value">{{ num(pace.avgDays, 1) }}</span>
                <span class="stat-label">{{ t('proStats.pace.avgDays') }}</span>
                <span class="stat-note">{{ t('proStats.pace.median', { n: num(pace.medianDays, 1) }) }}</span>
              </div>
              <div class="pace-kpi">
                <span class="stat-value">{{ pace.pagesPerDay === null ? '—' : num(pace.pagesPerDay, 1) }}</span>
                <span class="stat-label">{{ t('proStats.pace.pagesPerDay') }}</span>
              </div>
            </div>
            <dl class="pace-extremes">
              <div v-if="pace.fastest">
                <dt>{{ t('proStats.pace.fastest') }}</dt>
                <dd>{{ pace.fastest.title }} · {{ t('proStats.days', { n: pace.fastest.days }, pace.fastest.days) }}</dd>
              </div>
              <div v-if="pace.slowest">
                <dt>{{ t('proStats.pace.slowest') }}</dt>
                <dd>{{ pace.slowest.title }} · {{ t('proStats.days', { n: pace.slowest.days }, pace.slowest.days) }}</dd>
              </div>
            </dl>
            <div class="chart-box">
              <ChartCanvas
                type="bar"
                :data="paceChartData"
                :options="paceChartOptions"
                :aria-label="t('proStats.pace.chart', { year })"
              />
            </div>
            <ChartDataTable
              :caption="t('proStats.pace.chart', { year })"
              :label-header="t('dashboard.month')"
              :value-header="t('proStats.pace.avgDays')"
              :rows="paceRows"
            />
          </template>

          <div
            v-if="pace.current.length"
            class="pace-current"
          >
            <h4 class="section-title">{{ t('proStats.pace.current') }}</h4>
            <ul>
              <li
                v-for="item in pace.current"
                :key="item.bookId"
              >
                <span class="current-title">{{ item.title }}</span>
                <span class="current-meta">
                  {{ t('proStats.pace.dayN', { n: item.days }) }}<template v-if="item.percent !== null"> · {{ item.percent }}%</template>
                </span>
                <span class="current-eta">{{ item.expectedOn ? t('proStats.pace.expected', { date: shortDate(item.expectedOn) }) : t('proStats.pace.noProgress') }}</span>
              </li>
            </ul>
          </div>
        </template>
      </div>

      <!-- Autores e editoras ao longo dos anos -->
      <div class="pro-card">
        <div class="card-head">
          <h3
            id="pro-years-title"
            class="section-title"
          >{{ t('proStats.overYears.title') }}</h3>
          <AppSelect
            :modelValue="dimension"
            :options="dimensionOptions"
            ariaLabelledby="pro-years-title"
            class="card-select"
            @update:modelValue="changeDimension"
          />
        </div>
        <AppSkeleton
          v-if="yearsState.loading && !overYears"
          height="220px"
        />
        <p
          v-else-if="yearsState.error"
          class="no-data"
        >{{ yearsState.error }}</p>
        <p
          v-else-if="overYears && !overYears.years.length"
          class="no-data"
        >{{ t('proStats.overYears.empty') }}</p>
        <template v-else-if="overYears">
          <div class="chart-box">
            <ChartCanvas
              :type="overYears.years.length > 1 ? 'line' : 'bar'"
              :data="yearsChartData"
              :options="yearsChartOptions"
              :aria-label="yearsSummary"
            />
          </div>
          <ChartDataTable
            :caption="t(`proStats.overYears.discovered.${dimension}`)"
            :label-header="t('dashboard.year')"
            :value-header="t(`proStats.overYears.discovered.${dimension}`)"
            :rows="discoveredRows"
          />
        </template>
      </div>

      <ProChartBuilder class="pro-card wide" />
    </div>
  </section>
</template>

<script setup>
import { computed, reactive, ref, watch, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import api from '../../services/api.js'
import { usePlan } from '../../services/plan.js'
import { useTheme, cssVar } from '../../composables/useTheme.js'
import ProNotice from '../ProNotice.vue'
import AppSelect from '../ui/AppSelect.vue'
import AppButton from '../ui/AppButton.vue'
import AppSkeleton from '../ui/AppSkeleton.vue'
import ChartCanvas from '../ui/ChartCanvas.vue'
import ChartDataTable from '../ui/ChartDataTable.vue'
import DateField from '../form/DateField.vue'
import ProChartBuilder from './ProChartBuilder.vue'
import { COMPARE_PRESETS, comparePeriods, formatRange, change, isoDate, fromIso } from '../../utils/statPeriods.js'

const props = defineProps({
  year: { type: Number, required: true }
})

const { t, locale } = useI18n()
const { plan, canUse } = usePlan()
const { themeVersion } = useTheme()

const dateLocale = computed(() => (locale.value === 'en' ? 'en-US' : 'pt-BR'))
const enabled = computed(() => canUse('stats_advanced'))

const num = (value, decimals = 0) =>
  value === null || value === undefined ? '—' : new Intl.NumberFormat(dateLocale.value, { maximumFractionDigits: decimals }).format(value)
const shortDate = text => fromIso(text).toLocaleDateString(dateLocale.value, { day: 'numeric', month: 'short' })
const rangeLabel = side => formatRange(side.from, side.to, dateLocale.value)

const palette = computed(() => {
  themeVersion.value
  return {
    main: cssVar('--main-color') || '#3a86ff',
    text: cssVar('--text-secondary') || '#a1a1aa',
    grid: cssVar('--border-color') || 'rgba(255,255,255,0.1)',
    series: ['--blue', '--orange', '--green', '--purple', '--red', '--yellow'].map(name => cssVar(name) || '#888')
  }
})

const scales = computed(() => ({
  y: { beginAtZero: true, grid: { color: palette.value.grid }, ticks: { color: palette.value.text, precision: 0 } },
  x: { grid: { display: false }, ticks: { color: palette.value.text, maxRotation: 0 } }
}))

// Cada bloco carrega sozinho: um erro num não derruba os outros
const state = () => reactive({ loading: false, error: '' })
async function run(target, task) {
  target.loading = true
  target.error = ''
  try {
    await task()
  } catch (error) {
    target.error = error.message
  } finally {
    target.loading = false
  }
}

// ---------------------------------------------------------------------------
// Comparar períodos
// ---------------------------------------------------------------------------
const preset = ref('yearToDate')
const comparison = ref(null)
const compareState = state()
const custom = reactive({ a: { from: null, to: null }, b: { from: null, to: null } })

const presetOptions = computed(() =>
  [...COMPARE_PRESETS, 'custom'].map(value => ({ value, label: t(`proStats.compare.presets.${value}`) })))

const customReady = computed(() =>
  ['a', 'b'].every(side => custom[side].from && custom[side].to && custom[side].from <= custom[side].to))

function changePreset(value) {
  preset.value = value
  if (value === 'custom') {
    // Começa do que está na tela, para ajustar em vez de digitar tudo
    const [a, b] = comparison.value ? [comparison.value.a, comparison.value.b] : comparePeriods('yearToDate')
    for (const [side, range] of [['a', a], ['b', b]]) {
      custom[side].from = fromIso(range.from)
      custom[side].to = fromIso(range.to)
    }
    return
  }
  loadCompare()
}

function loadCompare() {
  const [a, b] = preset.value === 'custom'
    ? ['a', 'b'].map(side => ({ from: isoDate(custom[side].from), to: isoDate(custom[side].to) }))
    : comparePeriods(preset.value)
  return run(compareState, async () => {
    comparison.value = await api.getProCompare({ aFrom: a.from, aTo: a.to, bFrom: b.from, bTo: b.to })
  })
}

const topName = list => list?.[0]?.name ?? '—'

const compareRows = computed(() => {
  const { a, b } = comparison.value
  const loc = dateLocale.value
  const rows = [
    { key: 'readings', a: num(a.readings), b: num(b.readings), ...delta(change(a.readings, b.readings, { locale: loc })) },
    { key: 'books', a: num(a.books), b: num(b.books), ...delta(change(a.books, b.books, { locale: loc })) },
    { key: 'pages', a: num(a.pages), b: num(b.pages), ...delta(change(a.pages, b.pages, { locale: loc })) },
    { key: 'avgRating', a: num(a.avgRating, 1), b: num(b.avgRating, 1), ...delta(change(a.avgRating, b.avgRating, { percent: false, decimals: 1, locale: loc })) },
    { key: 'avgDays', a: num(a.avgDays, 1), b: num(b.avgDays, 1), ...delta(change(a.avgDays, b.avgDays, { percent: false, decimals: 1, locale: loc }), { lowerIsBetter: true }) },
    { key: 'rereads', a: num(a.rereads), b: num(b.rereads), delta: '', tone: '' },
    { key: 'topAuthor', a: topName(a.topAuthors), b: topName(b.topAuthors), delta: '', tone: '' },
    { key: 'topPublisher', a: topName(a.topPublishers), b: topName(b.topPublishers), delta: '', tone: '' },
    { key: 'topCategory', a: topName(a.topCategories), b: topName(b.topCategories), delta: '', tone: '' }
  ]
  return rows.map(row => ({ ...row, label: t(`proStats.compare.rows.${row.key}`) }))
})

// Menos dias por livro é ler mais rápido: a cor não segue o sinal
function delta(result, { lowerIsBetter = false } = {}) {
  const flip = { up: 'down', down: 'up' }
  return { delta: result.text, tone: lowerIsBetter ? (flip[result.tone] ?? '') : result.tone }
}

// ---------------------------------------------------------------------------
// Ritmo
// ---------------------------------------------------------------------------
const pace = ref(null)
const paceState = state()

function loadPace() {
  const asked = props.year
  return run(paceState, async () => {
    const result = await api.getProPace(asked)
    if (asked === props.year) pace.value = result
  })
}

const monthLabels = computed(() =>
  Array.from({ length: 12 }, (_, i) => new Date(2000, i, 1).toLocaleDateString(dateLocale.value, { month: 'narrow' })))
const monthNames = computed(() =>
  Array.from({ length: 12 }, (_, i) => new Date(2000, i, 1).toLocaleDateString(dateLocale.value, { month: 'long' })))

const paceChartData = computed(() => ({
  labels: monthLabels.value,
  datasets: [{
    label: t('proStats.pace.avgDays'),
    data: pace.value.byMonth.map(item => item.avgDays),
    backgroundColor: palette.value.main,
    borderRadius: 6
  }]
}))

const paceChartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: false } },
  scales: scales.value
}))

const paceRows = computed(() => pace.value.byMonth
  .filter(item => item.avgDays !== null)
  .map(item => ({ label: monthNames.value[item.month - 1], value: num(item.avgDays, 1) })))

// ---------------------------------------------------------------------------
// Ao longo dos anos
// ---------------------------------------------------------------------------
const dimension = ref('authors')
const overYears = ref(null)
const yearsState = state()

const dimensionOptions = computed(() =>
  ['authors', 'publishers'].map(value => ({ value, label: t(`proStats.overYears.${value}`) })))

function changeDimension(value) {
  dimension.value = value
  loadOverYears()
}

function loadOverYears() {
  const asked = dimension.value
  return run(yearsState, async () => {
    const result = await api.getProOverYears(asked)
    if (asked === dimension.value) overYears.value = result
  })
}

const yearsChartData = computed(() => ({
  labels: overYears.value.years.map(String),
  datasets: overYears.value.series.map((item, i) => ({
    label: item.name,
    data: item.counts,
    borderColor: palette.value.series[i % palette.value.series.length],
    backgroundColor: palette.value.series[i % palette.value.series.length],
    tension: 0,
    pointRadius: 3
  }))
}))

const yearsChartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: 'index', intersect: false },
  plugins: { legend: { position: 'bottom', labels: { color: palette.value.text, usePointStyle: true, boxWidth: 8 } } },
  scales: scales.value
}))

const yearsSummary = computed(() => t('proStats.overYears.summary', {
  list: overYears.value.series.map(item => `${item.name}: ${item.total}`).join(', ')
}))

const discoveredRows = computed(() =>
  overYears.value.years.map((year, i) => ({ label: String(year), value: overYears.value.discovered[i] })))

// ---------------------------------------------------------------------------

function loadAll() {
  if (!enabled.value) return
  loadCompare()
  loadPace()
  loadOverYears()
}

watch(() => props.year, () => { if (enabled.value) loadPace() })
watch(enabled, on => { if (on && !pace.value) loadAll() })
onMounted(loadAll)
</script>

<style scoped>
.pro-stats {
  margin-top: var(--space-7);
}

.pro-stats-heading {
  margin: 0 0 var(--space-4);
}

.pro-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: start;
  gap: var(--space-6);
}

.pro-card {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: var(--card-pad);
  border: 1px solid var(--border-color);
  border-radius: var(--card-radius);
  background: var(--bg-panel);
}

.pro-card.wide {
  grid-column: 1 / -1;
}

.pro-card h3,
.pro-card h4 {
  margin: 0;
}

.card-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}

.card-select {
  min-width: 12rem;
}

.custom-periods {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: var(--space-4);
}

.period-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(9rem, 1fr));
  gap: var(--space-3);
  margin: 0;
  padding: 0;
  border: 0;
}

.period-legend {
  grid-column: 1 / -1;
  margin-bottom: var(--space-1);
  color: var(--text-secondary);
  font-size: var(--fs-sm);
  font-weight: 600;
}

.table-scroll {
  overflow-x: auto;
}

.compare-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--fs-sm);
}

.compare-table th,
.compare-table td {
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--border-color);
  text-align: right;
  white-space: nowrap;
}

.compare-table th[scope='row'],
.compare-table thead th:first-child {
  text-align: left;
  color: var(--text-secondary);
  font-weight: 500;
}

.compare-table thead th {
  color: var(--text-secondary);
  font-size: var(--fs-xs);
  font-weight: 600;
}

.compare-table tbody tr:last-child th,
.compare-table tbody tr:last-child td {
  border-bottom: 0;
}

.compare-table td {
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}

.delta.up {
  color: var(--green);
}

.delta.down {
  color: var(--red);
}

.pace-kpis {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-6);
}

.pace-kpi {
  display: flex;
  flex-direction: column;
}

.pace-extremes {
  display: grid;
  gap: var(--space-2);
  margin: 0;
  font-size: var(--fs-sm);
}

.pace-extremes dt {
  color: var(--text-secondary);
}

.pace-extremes dd {
  margin: 0;
  color: var(--text-primary);
}

.chart-box {
  position: relative;
  height: 240px;
}

.chart-box > .chart-canvas {
  position: relative;
  width: 100%;
  height: 100%;
}

.pace-current ul {
  display: grid;
  gap: var(--space-2);
  margin: var(--space-2) 0 0;
  padding: 0;
  list-style: none;
}

.pace-current li {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 0 var(--space-3);
  font-size: var(--fs-sm);
}

.current-title {
  overflow: hidden;
  color: var(--text-primary);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.current-meta {
  color: var(--text-secondary);
  text-align: right;
}

.current-eta {
  grid-column: 1 / -1;
  color: var(--text-secondary);
  font-size: var(--fs-xs);
}

.no-data {
  margin: 0;
  color: var(--text-secondary);
  font-style: italic;
}

@media (max-width: 1023.98px) {
  .pro-grid {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-4);
  }
}

@media (max-width: 639.98px) {
  .period-fields {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    width: 100%;
  }

  .card-select {
    min-width: 0;
    width: 100%;
  }

  /* As quatro colunas cabem quebrando o texto, sem rolagem lateral */
  .compare-table {
    table-layout: fixed;
    font-size: var(--fs-xs);
  }

  .compare-table th,
  .compare-table td {
    padding: var(--space-2) var(--space-1);
    white-space: normal;
    overflow-wrap: anywhere;
  }

  .compare-table thead th:first-child {
    width: 30%;
  }

  .compare-table thead th:last-child {
    width: 18%;
  }
}
</style>
