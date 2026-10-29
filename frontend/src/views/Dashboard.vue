<template>
  <div class="dashboard-container">
    <div class="header-section">
      <div class="welcome-text">
        <h1>{{ $t('dashboard.title') }}</h1>
        <p>{{ $t('dashboard.subtitle') }}</p>
      </div>
      <div class="header-side">
        <router-link
          :to="{ name: 'year', params: { year } }"
          class="year-link"
        >
          <i
            class="pi pi-sparkles"
            aria-hidden="true"
          ></i>
          {{ t('year.title', { year }) }}
        </router-link>
        <label
          class="sr-only"
          for="dashboard-year"
        >{{ t('dashboard.yearLabel') }}</label>
        <AppSelect
          inputId="dashboard-year"
          :modelValue="year"
          :options="yearOptions"
          class="year-dropdown"
          @update:modelValue="changeYear"
        />
      </div>
    </div>

    <div
      v-if="loading"
      class="loading-layout"
    >
      <AppSkeleton
        height="150px"
        class="chart-skeleton"
      />
      <div class="kpi-grid">
        <AppSkeleton
          height="120px"
          class="kpi-skeleton"
          v-for="n in 4"
          :key="n"
        />
      </div>
      <div class="charts-grid">
        <AppSkeleton
          height="350px"
          class="chart-skeleton"
        />
        <AppSkeleton
          height="350px"
          class="chart-skeleton"
        />
      </div>
    </div>

    <EmptyState
      v-else-if="loadError"
      variant="error"
      :title="$t('dashboard.loadError')"
      @action="loadStats"
    />

    <div
      v-else
      class="dashboard-content"
    >
      <router-link
        v-if="stats.invalidIsbn > 0"
        :to="{ name: 'library', query: { isbn: 'invalid' } }"
        class="isbn-notice"
      >
        <i
          class="pi pi-exclamation-triangle"
          aria-hidden="true"
        ></i>
        <span>{{ t('dashboard.invalidIsbn', { n: stats.invalidIsbn }, stats.invalidIsbn) }}</span>
        <i
          class="pi pi-angle-right"
          aria-hidden="true"
        ></i>
      </router-link>

      <!-- Meta do ano -->
      <section
        class="goal-card"
        aria-labelledby="goal-title"
      >
        <div class="goal-head">
          <h2 id="goal-title">{{ t('goal.title', { year }) }}</h2>
          <div
            v-if="!editingGoal"
            class="goal-actions"
          >
            <AppButton
              v-if="stats.goal"
              :label="t('goal.edit')"
              icon="pi pi-pencil"
              class="btn-text btn-sm"
              @click="startEditGoal"
            />
            <AppButton
              v-else
              :label="t('goal.set')"
              icon="pi pi-flag"
              class="btn-sm btn-primary"
              @click="startEditGoal"
            />
          </div>
        </div>

        <form
          v-if="editingGoal"
          class="goal-form"
          @submit.prevent="saveGoal"
        >
          <label for="goal-target">{{ t('goal.question', { year }) }}</label>
          <div class="goal-form-row">
            <NumberField
              v-model="goalDraft"
              inputId="goal-target"
              :min="1"
              :max="1000"
              class="goal-input"
            />
            <AppButton
              type="submit"
              :label="t('goal.save')"
              :loading="goalSaving"
              class="btn-sm btn-primary"
            />
            <AppButton
              type="button"
              :label="t('common.cancel')"
              class="btn-text btn-sm"
              @click="editingGoal = false"
            />
            <AppButton
              v-if="stats.goal"
              type="button"
              :label="t('goal.remove')"
              class="btn-text btn-sm btn-danger"
              :disabled="goalSaving"
              @click="removeGoal"
            />
          </div>
        </form>

        <template v-else-if="stats.goal">
          <p class="goal-numbers">
            <strong>{{ readInYear }}</strong>
            <span>{{ t('goal.ofTarget', { goal: stats.goal }, stats.goal) }}</span>
          </p>
          <div
            class="goal-bar"
            role="progressbar"
            :aria-valuenow="readInYear"
            aria-valuemin="0"
            :aria-valuemax="stats.goal"
            :aria-label="t('goal.title', { year })"
          >
            <span
              class="goal-fill"
              :style="{ width: `${goalPercent}%` }"
            ></span>
            <span
              v-if="paceMarker !== null"
              class="goal-pace"
              :style="{ left: `${paceMarker}%` }"
              :title="t('goal.paceMarker')"
            ></span>
          </div>
          <p
            class="goal-status"
            :class="goalStatus.tone"
          >{{ goalStatus.text }}</p>
        </template>

        <p
          v-else
          class="goal-empty"
        >{{ t('goal.empty', { n: readInYear }, readInYear) }}</p>
      </section>

      <div class="kpi-grid">
        <router-link
          :to="{ name: 'library' }"
          class="kpi-card total"
        >
          <i
            class="pi pi-arrow-up-right kpi-arrow"
            aria-hidden="true"
          ></i>
          <div class="kpi-icon"><i class="pi pi-book" aria-hidden="true"></i></div>
          <div class="kpi-info">
            <span class="label">{{ $t('dashboard.totalBooks') }}</span>
            <span class="value">{{ stats.totalBooks }}</span>
          </div>
        </router-link>

        <router-link
          :to="{ name: 'library', query: { status: 'read' } }"
          class="kpi-card read"
        >
          <i
            class="pi pi-arrow-up-right kpi-arrow"
            aria-hidden="true"
          ></i>
          <div class="kpi-icon"><i class="pi pi-check-circle" aria-hidden="true"></i></div>
          <div class="kpi-info">
            <span class="label">{{ $t('dashboard.readBooks') }}</span>
            <span class="value">{{ stats.readBooks }}</span>
            <span class="sub">{{ t('dashboard.ofShelf', { n: readingRate }) }}</span>
          </div>
        </router-link>

        <router-link
          :to="{ name: 'library', query: { status: 'reading' } }"
          class="kpi-card reading"
        >
          <i
            class="pi pi-arrow-up-right kpi-arrow"
            aria-hidden="true"
          ></i>
          <div class="kpi-icon"><i class="pi pi-eye" aria-hidden="true"></i></div>
          <div class="kpi-info">
            <span class="label">{{ t('dashboard.readingNow') }}</span>
            <span class="value">{{ stats.readingBooks }}</span>
          </div>
        </router-link>

        <router-link
          :to="{ name: 'library', query: { status: 'want' } }"
          class="kpi-card want"
        >
          <i
            class="pi pi-arrow-up-right kpi-arrow"
            aria-hidden="true"
          ></i>
          <div class="kpi-icon"><i class="pi pi-bookmark" aria-hidden="true"></i></div>
          <div class="kpi-info">
            <span class="label">{{ t('dashboard.wantToRead') }}</span>
            <span class="value">{{ stats.wantBooks }}</span>
          </div>
        </router-link>
      </div>

      <div class="charts-grid">
        <div class="chart-card main-chart">
          <h3>{{ t('dashboard.readingByMonth', { year }) }}</h3>
          <p class="chart-hint">{{ t('dashboard.clickHint') }}</p>
          <div class="chart-wrapper flex-center">
            <div
              v-if="readInYear === 0"
              class="no-data"
            >{{ t('dashboard.noMonthData', { year }) }}</div>
            <ChartCanvas
              v-else
              type="bar"
              :data="monthChartData"
              :options="monthChartOptions"
              :aria-label="monthSummary"
              class="h-full"
            />
          </div>
          <ChartDataTable
            v-if="readInYear > 0"
            :caption="t('dashboard.readingByMonth', { year })"
            :label-header="t('dashboard.month')"
            :value-header="t('dashboard.readings')"
            :rows="monthRows"
          />
        </div>

        <div class="chart-card main-chart">
          <h3>{{ $t('dashboard.readingByYear') }}</h3>
          <div class="chart-wrapper flex-center">
            <div
              v-if="stats.readingByYear.length === 0"
              class="no-data"
            >{{ $t('dashboard.noYearData') }}</div>
            <ChartCanvas
              v-else
              type="bar"
              :data="yearChartData"
              :options="yearChartOptions"
              :aria-label="yearSummary"
              class="h-full"
            />
          </div>
          <ChartDataTable
            v-if="stats.readingByYear.length"
            :caption="t('dashboard.readingByYear')"
            :label-header="t('dashboard.year')"
            :value-header="t('dashboard.readings')"
            :rows="yearRows"
          />
        </div>

      </div>

      <div class="charts-grid lower">
        <div class="chart-card">
          <h3>{{ $t('dashboard.favoriteGenres') }}</h3>
          <div class="chart-wrapper flex-center">
            <div
              v-if="stats.topTags.length === 0"
              class="no-data"
            >{{ $t('dashboard.noTagsData') }}</div>
            <ChartCanvas
              v-else-if="stats.topTags.length <= DONUT_MAX"
              type="doughnut"
              :data="tagsChartData"
              :options="doughnutOptions"
              :aria-label="tagsSummary"
              class="h-full w-full"
            />
            <!-- Mais de 5 categorias: barras leem melhor que a rosca (6 cores só) -->
            <ul
              v-else
              class="tag-bars"
            >
              <li
                v-for="tag in stats.topTags"
                :key="tag.name"
              >
                <router-link
                  :to="{ name: 'library', query: { tags: tag.name } }"
                  class="tag-bar-row"
                  :style="{ '--bar-color': colorFor(tag.name), '--bar-width': `${Math.max(4, (tag.count / topTagMax) * 100)}%` }"
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
          </div>
        </div>

        <div class="chart-card authors-list">
          <h3>{{ $t('dashboard.topAuthors') }}</h3>
          <div class="authors-wrapper">
            <div
              v-if="stats.topAuthors.length === 0"
              class="no-data"
            >{{ $t('dashboard.noAuthorsData') }}</div>
            <router-link
              v-for="(author, index) in stats.topAuthors"
              :key="author.name"
              :to="{ name: 'library', query: { author: author.name } }"
              class="author-row"
              :style="{ '--author-color': colorFor(author.name) }"
            >
              <div class="rank">{{ index + 1 }}</div>
              <div class="name">{{ author.name }}</div>
              <div class="count">{{ t('dashboard.booksCount', { n: author.count }, author.count) }}</div>
            </router-link>
          </div>
        </div>

        <div class="chart-card authors-list">
          <h3>{{ t('dashboard.topPublishers') }}</h3>
          <div class="authors-wrapper">
            <div
              v-if="stats.topPublishers.length === 0"
              class="no-data"
            >{{ t('dashboard.noPublishersData') }}</div>
            <router-link
              v-for="(publisher, index) in stats.topPublishers"
              :key="publisher.name"
              :to="{ name: 'library', query: { publisher: publisher.name } }"
              class="author-row"
              :style="{ '--author-color': colorFor(publisher.name) }"
            >
              <div class="rank">{{ index + 1 }}</div>
              <div class="name">{{ publisher.name }}</div>
              <div class="count">{{ t('dashboard.booksCount', { n: publisher.count }, publisher.count) }}</div>
            </router-link>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useToast } from '../services/toast.js'
import ChartCanvas from '../components/ui/ChartCanvas.vue'
import ChartDataTable from '../components/ui/ChartDataTable.vue'
import AppSkeleton from '../components/ui/AppSkeleton.vue'
import EmptyState from '../components/ui/EmptyState.vue'
import AppButton from '../components/ui/AppButton.vue'
import AppSelect from '../components/ui/AppSelect.vue'
import NumberField from '../components/ui/NumberField.vue'
import api from '../services/api.js'
import { useTheme, cssVar } from '../composables/useTheme.js'
import { colorFor, tagColorName } from '../utils/tagColors.js'

const { t, locale } = useI18n()
const router = useRouter()
const toast = useToast()
const { themeVersion } = useTheme()

const CURRENT_YEAR = new Date().getFullYear()

const loading = ref(true)
const loadError = ref(false)
const year = ref(CURRENT_YEAR)
const stats = ref({
  totalBooks: 0,
  readBooks: 0,
  readingBooks: 0,
  wantBooks: 0,
  goal: null,
  readingByYear: [],
  readingByMonth: [],
  topAuthors: [],
  topTags: [],
  topPublishers: []
})

const dateLocale = computed(() => (locale.value === 'en' ? 'en-US' : 'pt-BR'))

// Anos com leitura + o ano atual, do mais novo para o mais antigo.
const yearOptions = computed(() => {
  const years = new Set([CURRENT_YEAR, year.value, ...stats.value.readingByYear.map(item => item.year)])
  return [...years].sort((a, b) => b - a)
})

const readingRate = computed(() => {
  if (!stats.value.totalBooks) return 0
  return Math.round((stats.value.readBooks / stats.value.totalBooks) * 100)
})

const readInYear = computed(() =>
  stats.value.readingByMonth.reduce((sum, item) => sum + item.count, 0)
)

// ---------------------------------------------------------------------------
// Meta anual
// ---------------------------------------------------------------------------
const editingGoal = ref(false)
const goalDraft = ref(12)
const goalSaving = ref(false)

const goalPercent = computed(() => {
  if (!stats.value.goal) return 0
  return Math.min(100, Math.round((readInYear.value / stats.value.goal) * 100))
})

// Fração do ano que já passou (só no ano atual): onde o leitor "deveria" estar.
const yearFraction = computed(() => {
  if (year.value !== CURRENT_YEAR) return null
  const now = new Date()
  const start = new Date(CURRENT_YEAR, 0, 1)
  const end = new Date(CURRENT_YEAR + 1, 0, 1)
  return (now - start) / (end - start)
})

const paceMarker = computed(() => (yearFraction.value === null ? null : Math.round(yearFraction.value * 100)))

const goalStatus = computed(() => {
  const goal = stats.value.goal
  const read = readInYear.value
  if (!goal) return { text: '', tone: '' }
  if (read >= goal) return { text: t('goal.done'), tone: 'good' }

  if (yearFraction.value === null) {
    return year.value < CURRENT_YEAR
      ? { text: t('goal.missed', { n: goal - read }, goal - read), tone: 'muted' }
      : { text: t('goal.future'), tone: 'muted' }
  }

  const expected = Math.floor(goal * yearFraction.value)
  const diff = read - expected
  if (diff > 0) return { text: t('goal.ahead', { n: diff }, diff), tone: 'good' }
  if (diff < 0) return { text: t('goal.behind', { n: -diff }, -diff), tone: 'warn' }
  return { text: t('goal.onTrack'), tone: 'good' }
})

function startEditGoal() {
  goalDraft.value = stats.value.goal || Math.max(12, readInYear.value)
  editingGoal.value = true
}

async function saveGoal() {
  if (!goalDraft.value) return
  goalSaving.value = true
  try {
    const saved = await api.setReadingGoal(year.value, goalDraft.value)
    stats.value.goal = saved.target
    editingGoal.value = false
  } catch (error) {
    toast.add({ severity: 'error', detail: error.message, life: 4000 })
  } finally {
    goalSaving.value = false
  }
}

async function removeGoal() {
  goalSaving.value = true
  try {
    await api.deleteReadingGoal(year.value)
    stats.value.goal = null
    editingGoal.value = false
  } catch (error) {
    toast.add({ severity: 'error', detail: error.message, life: 4000 })
  } finally {
    goalSaving.value = false
  }
}

// ---------------------------------------------------------------------------
// Gráficos (clicar leva para a biblioteca já filtrada)
// ---------------------------------------------------------------------------

// O chart.js não entende var(--x): lê os valores resolvidos e recalcula quando
// o tema ou a cor de destaque mudam.
const palette = computed(() => {
  themeVersion.value // dependência reativa: muda quando o tema muda
  return {
    main: cssVar('--main-color') || '#3a86ff',
    text: cssVar('--text-secondary') || '#a1a1aa',
    grid: cssVar('--border-color') || 'rgba(255,255,255,0.1)',
    series: ['--red', '--green', '--blue', '--purple', '--yellow', '--orange'].map(name => cssVar(name))
  }
})

function openLibrary(query) {
  router.push({ name: 'library', query })
}

// Mãozinha sobre barras/fatias clicáveis.
function pointerOnHover(event, elements) {
  const canvas = event?.native?.target
  if (canvas) canvas.style.cursor = elements.length ? 'pointer' : 'default'
}

const monthLabels = computed(() =>
  Array.from({ length: 12 }, (_, i) =>
    new Date(2000, i, 1).toLocaleDateString(dateLocale.value, { month: 'short' }).replace('.', ''))
)

// Texto alternativo dos gráficos (o canvas não tem conteúdo para leitor de tela)
const monthNames = computed(() =>
  Array.from({ length: 12 }, (_, i) => new Date(2000, i, 1).toLocaleDateString(dateLocale.value, { month: 'long' })))

const monthRows = computed(() =>
  stats.value.readingByMonth.map((item, i) => ({ label: monthNames.value[i], value: item.count })))

const monthSummary = computed(() => {
  const n = readInYear.value
  const top = stats.value.readingByMonth.reduce((best, item, i) => (item.count > best.count ? { count: item.count, i } : best), { count: 0, i: 0 })
  return t('dashboard.monthSummary', { n, year: year.value, month: monthNames.value[top.i], top: top.count }, n)
})

const yearRows = computed(() => sortedYears.value.map(item => ({ label: String(item.year), value: item.count })))
const yearSummary = computed(() =>
  t('dashboard.yearSummary', { list: yearRows.value.map(row => `${row.label}: ${row.value}`).join(', ') }))

const tagsSummary = computed(() =>
  t('dashboard.tagsSummary', { list: stats.value.topTags.map(tag => `${tag.name}: ${tag.count}`).join(', ') }))

const monthChartData = computed(() => ({
  labels: monthLabels.value,
  datasets: [{
    // Conta leituras (releitura conta de novo), não livros
    label: t('dashboard.readings'),
    data: stats.value.readingByMonth.map(item => item.count),
    backgroundColor: cssVar(`--${tagColorName(String(year.value))}`) || palette.value.main,
    borderRadius: 6
  }]
}))

const barScales = computed(() => ({
  y: { grid: { color: palette.value.grid }, ticks: { color: palette.value.text, precision: 0 } },
  x: { grid: { display: false }, ticks: { color: palette.value.text } }
}))

const monthChartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: false } },
  scales: barScales.value,
  // A coluna inteira é clicável (barras baixas são difíceis de acertar).
  interaction: { mode: 'index', intersect: false },
  onHover: pointerOnHover,
  onClick: (_, elements) => {
    if (!elements.length) return
    const month = elements[0].index + 1
    if (!stats.value.readingByMonth[month - 1]?.count) return
    openLibrary({ status: 'read', year: String(year.value), month: String(month) })
  }
}))

const sortedYears = computed(() => [...stats.value.readingByYear].sort((a, b) => a.year - b.year))

const yearChartData = computed(() => ({
  labels: sortedYears.value.map(item => item.year),
  datasets: [{
    label: t('dashboard.readings'),
    data: sortedYears.value.map(item => item.count),
    // Cada ano com a sua cor — a mesma das barras do perfil público.
    backgroundColor: sortedYears.value.map(item => cssVar(`--${tagColorName(String(item.year))}`) || palette.value.main),
    borderRadius: 6
  }]
}))

const yearChartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: false } },
  scales: barScales.value,
  // A coluna inteira é clicável (barras baixas são difíceis de acertar).
  interaction: { mode: 'index', intersect: false },
  onHover: pointerOnHover,
  onClick: (_, elements) => {
    if (!elements.length) return
    const item = sortedYears.value[elements[0].index]
    if (item) openLibrary({ status: 'read', year: String(item.year) })
  }
}))

const tagsChartData = computed(() => ({
  labels: stats.value.topTags.map(tag => tag.name),
  datasets: [{
    data: stats.value.topTags.map(tag => tag.count),
    // Mesma cor da categoria no resto do app.
    backgroundColor: stats.value.topTags.map(tag => cssVar(`--${tagColorName(tag.name)}`) || palette.value.main),
    borderWidth: 0,
    hoverOffset: 10
  }]
}))

// Até 5 categorias a rosca funciona; acima disso vira lista com barras
const DONUT_MAX = 5
const topTagMax = computed(() => Math.max(1, ...stats.value.topTags.map(tag => tag.count)))

const doughnutOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { position: 'bottom', labels: { color: palette.value.text, usePointStyle: true, boxWidth: 8 } }
  },
  onHover: pointerOnHover,
  onClick: (_, elements) => {
    if (!elements.length) return
    const tag = stats.value.topTags[elements[0].index]
    if (tag) openLibrary({ tags: tag.name })
  }
}))

async function loadStats() {
  loading.value = true
  loadError.value = false
  try {
    stats.value = await api.getDashboardStats(year.value)
  } catch (error) {
    loadError.value = true
  } finally {
    loading.value = false
  }
}

// Troca de ano: mostra o carregando e sai de um erro anterior (antes a tela
// de erro ficava e a troca não dava sinal nenhum)
async function changeYear(value) {
  year.value = value
  editingGoal.value = false
  await loadStats()
}

onMounted(loadStats)
</script>

<style scoped>
.isbn-notice {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.85rem 1.1rem;
  margin-bottom: 1.5rem;
  border-radius: 10px;
  border: 1px solid color-mix(in srgb, var(--warning) 40%, transparent);
  background: color-mix(in srgb, var(--warning) 8%, transparent);
  color: var(--text-primary);
  text-decoration: none;
  font-size: var(--fs-md);
}

.isbn-notice .pi-exclamation-triangle {
  color: var(--warning);
}

.isbn-notice .pi-angle-right {
  margin-left: auto;
  color: var(--text-secondary);
}

.isbn-notice:hover {
  background: color-mix(in srgb, var(--warning) 14%, transparent);
}

.dashboard-container {
  padding: 2rem;
  min-height: 100vh;
  min-height: 100dvh;
  background-color: var(--bg-app);
  /* Sem width, como filho de flex encolhia até o esqueleto e esticava ao
     carregar (tudo pulava para o lado) */
  width: 100%;
  max-width: 1100px;
  margin: 0 auto;
  box-sizing: border-box;
}

.header-section {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  margin-bottom: 2rem;
}

.welcome-text h1 {
  margin: 0;
  font-size: var(--fs-2xl);
  color: var(--text-primary);
  font-family: var(--font-display);
}

.welcome-text p {
  margin: 0.5rem 0 0;
  color: var(--text-secondary);
}

.kpi-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1.5rem;
  margin-bottom: 2rem;
}

.kpi-card {
  position: relative;
  background-color: var(--bg-panel);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  padding: 1.5rem;
  display: flex;
  align-items: center;
  gap: 1rem;
  cursor: pointer;
  transition: transform 0.2s, border-color 0.2s;
}

.kpi-card:hover {
  transform: translateY(-3px);
  border-color: var(--border-hover);
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
  gap: 0.75rem;
  padding: 0.4rem 0.5rem;
  margin: 0 -0.5rem;
  border-radius: 8px;
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
  border-radius: 999px;
  background: var(--bg-input);
  overflow: hidden;
}

.tag-bar-fill {
  display: block;
  height: 100%;
  width: var(--bar-width);
  border-radius: 999px;
  background: var(--bar-color);
}

.tag-bar-count {
  color: var(--text-secondary);
  font-size: var(--fs-sm);
  text-align: right;
}

.kpi-icon {
  width: 50px;
  height: 50px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--fs-xl);
  flex-shrink: 0;
}

.kpi-card {
  --kpi-color: var(--main-color);
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

a.kpi-card {
  text-decoration: none;
  color: inherit;
}

a.kpi-card:focus-visible,
a.author-row:focus-visible {
  outline: var(--focus-ring);
  outline-offset: var(--focus-offset);
}

.kpi-icon {
  background: color-mix(in srgb, var(--kpi-color) 14%, transparent);
  color: var(--kpi-color);
}







.kpi-info {
  display: flex;
  flex-direction: column;
}

.kpi-info .label {
  color: var(--text-secondary);
  font-size: var(--fs-sm);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.kpi-info .value {
  color: var(--text-primary);
  font-size: var(--fs-2xl);
  font-weight: 700;
}

.kpi-info .sub {
  color: var(--text-secondary);
  font-size: var(--fs-xs);
}

/* Ano + data no cabeçalho */
.header-side {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.year-link {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.55rem 0.95rem;
  border-radius: 999px;
  background: rgba(var(--main-color-rgb), 0.12);
  color: color-mix(in srgb, var(--main-color) var(--tint-text), var(--text-primary));
  font-size: var(--fs-sm);
  font-weight: 600;
  text-decoration: none;
  white-space: nowrap;
}

.year-link:hover {
  background: rgba(var(--main-color-rgb), 0.2);
}

.year-link:focus-visible {
  outline: var(--focus-ring);
  outline-offset: var(--focus-offset);
}

.year-dropdown {
  min-width: 7.5rem;
}

/* Meta anual */
.goal-card {
  background: var(--bg-panel);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  padding: 1.5rem;
  margin-bottom: 1.5rem;
}

.goal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 0.75rem;
}

.goal-head h2 {
  margin: 0;
  font-size: var(--fs-lg);
  font-weight: 600;
  color: var(--text-primary);
}

.goal-numbers {
  margin: 0 0 0.75rem;
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  color: var(--text-secondary);
}

.goal-numbers strong {
  font-family: var(--font-display);
  font-size: var(--fs-3xl);
  line-height: 1;
  color: var(--text-primary);
}

.goal-bar {
  position: relative;
  height: 12px;
  border-radius: 999px;
  background: var(--bg-hover);
  overflow: visible;
}

.goal-fill {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: var(--main-color);
  transition: width 0.4s ease;
}

/* Onde deveria estar hoje para bater a meta no fim do ano. */
.goal-pace {
  position: absolute;
  top: -4px;
  width: 2px;
  height: 20px;
  margin-left: -1px;
  background: var(--text-primary);
  opacity: 0.55;
  border-radius: 1px;
}

.goal-status {
  margin: 0.75rem 0 0;
  font-size: var(--fs-md);
  color: var(--text-secondary);
}

.goal-status.good {
  color: var(--green);
}

.goal-status.warn {
  color: var(--orange);
}

.goal-empty {
  margin: 0;
  color: var(--text-secondary);
}

.goal-form {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.goal-form label {
  color: var(--text-secondary);
  font-size: var(--fs-md);
}

.goal-form-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.chart-hint {
  margin: -1rem 0 1rem;
  color: var(--text-secondary);
  font-size: var(--fs-sm);
}

.charts-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1.5rem;
}

.chart-card {
  min-width: 0;
  background-color: var(--bg-panel);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
}

.main-chart {
  grid-column: 1 / -1;
}

.chart-card h3 {
  margin: 0 0 1.5rem 0;
  color: var(--text-primary);
  font-size: var(--fs-lg);
  font-weight: 600;
}

.chart-wrapper {
  flex: 0 0 auto;
  position: relative;
  height: 280px;
  min-height: 0;
}

.chart-wrapper > .chart-canvas {
  position: relative;
  width: 100%;
  height: 100%;
}

.charts-grid.lower {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  margin-top: 1.5rem;
}

.charts-grid.lower .chart-wrapper {
  height: 300px;
}

.flex-center {
  display: flex;
  align-items: center;
  justify-content: center;
}

.no-data {
  color: var(--text-secondary);
  font-style: italic;
}

.authors-wrapper {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.author-row {
  display: flex;
  align-items: center;
  gap: 1rem;
  position: relative;
  padding: 0.5rem 0.5rem;
  margin: 0 -0.5rem;
  border-radius: 8px;
  text-decoration: none;
  color: inherit;
}

a.author-row:hover {
  background: var(--bg-hover);
}

.author-row .rank {
  color: var(--author-color);
  font-weight: bold;
  width: 20px;
}

.author-row .name {
  color: var(--text-primary);
  font-weight: 500;
  z-index: 2;
  width: 150px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.author-row .count {
  color: var(--text-secondary);
  font-size: var(--fs-md);
  margin-left: auto;
  z-index: 2;
}

.bar-visual {
  position: absolute;
  left: 30px;
  top: 10%;
  height: 80%;
  background-color: color-mix(in srgb, var(--success) 15%, transparent);
  border-radius: 4px;
  z-index: 1;
}

.kpi-skeleton {
  background-color: var(--bg-panel);
  border-radius: 16px;
}

.chart-skeleton {
  background-color: var(--bg-panel);
  border-radius: 16px;
  margin-bottom: 1.5rem;
}

@media (max-width: 1100px) {
  .kpi-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 1100px) {
  .charts-grid.lower {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .charts-grid.lower > :first-child {
    grid-column: 1 / -1;
  }
}

@media (max-width: 900px) {
  .charts-grid,
  .charts-grid.lower {
    grid-template-columns: 1fr;
  }

  .chart-wrapper {
    height: 240px;
  }

  .main-chart {
    grid-column: auto;
  }
}

@media (max-width: 600px) {
  .dashboard-container {
    padding: 1.25rem 1rem;
  }

  /* Dois por linha: os quatro números cabem na primeira tela. */
  .kpi-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.75rem;
    margin-bottom: 1.25rem;
  }

  .kpi-card {
    padding: 1rem;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.6rem;
  }

  .kpi-icon {
    width: 36px;
    height: 36px;
    font-size: var(--fs-lg);
    border-radius: 10px;
  }

  .kpi-info .label {
    font-size: var(--fs-xs);
  }

  .kpi-info .value {
    font-size: var(--fs-xl);
  }

  .charts-grid {
    gap: 1rem;
  }

  .chart-card {
    padding: 1.1rem;
  }

  .header-section {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.5rem;
  }

  .header-side {
    width: 100%;
    justify-content: space-between;
  }

  .goal-card {
    padding: 1.1rem;
    margin-bottom: 1rem;
  }
}</style>
