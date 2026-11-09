<template>
  <div class="page dashboard-container">
    <PageHeader
      :title="t('dashboard.title')"
      :subtitle="t('dashboard.subtitle')"
    >
      <template #actions>
      <div class="header-side">
        <router-link
          v-if="!phone"
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
      </template>
    </PageHeader>

    <div
      v-if="loading"
      class="loading-layout"
    >
      <AppSkeleton
        height="150px"
        class="chart-skeleton"
      />
      <KpiGrid loading />
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
        class="notice is-warn isbn-notice"
      >
        <i
          class="pi pi-exclamation-triangle"
          aria-hidden="true"
        ></i>
        <span>{{ t('dashboard.invalidIsbn', { n: stats.invalidIsbn }, stats.invalidIsbn) }}</span>
        <i
          class="pi pi-angle-right notice-arrow"
          aria-hidden="true"
        ></i>
      </router-link>

      <PhoneOverview
        v-if="phone"
        :year="year"
        :months="stats.readingByMonth.map(item => item.count)"
        :read-in-year="readInYear"
        :top-tags="stats.topTags"
        :totals="yearTotals"
        @open-month="month => openLibrary({ status: 'read', year: String(year), month: String(month) })"
        @open-tag="name => openLibrary({ tags: name })"
      >
        <template #month-table>
          <ChartDataTable
            :caption="t('dashboard.readingByMonth', { year })"
            :label-header="t('dashboard.month')"
            :value-header="t('dashboard.readings')"
            :rows="monthRows"
          />
        </template>
      </PhoneOverview>

      <GoalCard
        v-model:goal="stats.goal"
        :year="year"
        :read="readInYear"
      />

      <KpiGrid :stats="stats" />

      <div class="charts-grid">
        <MonthChart
          v-if="!phone"
          class="main-chart"
          :year="year"
          :rows="monthRows"
          :total="readInYear"
        />
        <YearChart
          class="main-chart"
          :years="stats.readingByYear"
        />
      </div>

      <div class="charts-grid lower">
        <TagsChart
          v-if="!phone"
          :tags="stats.topTags"
        />
        <RankingList
          :title="t('dashboard.topAuthors')"
          :empty="t('dashboard.noAuthorsData')"
          :items="stats.topAuthors"
          filter="author"
        />
        <RankingList
          :title="t('dashboard.topPublishers')"
          :empty="t('dashboard.noPublishersData')"
          :items="stats.topPublishers"
          filter="publisher"
        />
      </div>

      <ProStats :year="year" />
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import PageHeader from '../components/ui/PageHeader.vue'
import ChartDataTable from '../components/ui/ChartDataTable.vue'
import AppSkeleton from '../components/ui/AppSkeleton.vue'
import EmptyState from '../components/ui/EmptyState.vue'
import AppSelect from '../components/ui/AppSelect.vue'
import PhoneOverview from '../components/dashboard/PhoneOverview.vue'
import GoalCard from '../components/dashboard/GoalCard.vue'
import KpiGrid from '../components/dashboard/KpiGrid.vue'
import MonthChart from '../components/dashboard/MonthChart.vue'
import YearChart from '../components/dashboard/YearChart.vue'
import TagsChart from '../components/dashboard/TagsChart.vue'
import RankingList from '../components/dashboard/RankingList.vue'
import ProStats from '../components/dashboard/ProStats.vue'
import api from '../services/api.js'
import { useIsPhone } from '../composables/useIsPhone.js'
import { dateTag, monthNames } from '../utils/dates.js'

const { t, locale } = useI18n()
const router = useRouter()
const phone = useIsPhone()

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

// Anos com leitura + o ano atual, do mais novo para o mais antigo.
const yearOptions = computed(() => {
  const years = new Set([CURRENT_YEAR, year.value, ...stats.value.readingByYear.map(item => item.year)])
  return [...years].sort((a, b) => b - a)
})

const readInYear = computed(() =>
  stats.value.readingByMonth.reduce((sum, item) => sum + item.count, 0)
)

// Linhas do mês (nome por extenso): tabela do gráfico e do resumo do celular
const monthRows = computed(() => {
  const names = monthNames(dateTag(locale.value))
  return stats.value.readingByMonth.map((item, i) => ({ label: names[i], value: item.count }))
})

function openLibrary(query) {
  router.push({ name: 'library', query })
}

// Celular: livros, páginas e nota média do ano (os mesmos da Retrospectiva)
const yearTotals = ref(null)

async function loadYearTotals() {
  if (!phone.value) return
  const asked = year.value
  try {
    const story = await api.getYearInBooks(asked)
    if (asked === year.value) yearTotals.value = story.totals || null
  } catch {
    if (asked === year.value) yearTotals.value = null
  }
}

watch(phone, on => { if (on && !yearTotals.value) loadYearTotals() })

async function loadStats() {
  loading.value = true
  loadError.value = false
  yearTotals.value = null
  try {
    const [result] = await Promise.all([api.getDashboardStats(year.value), loadYearTotals()])
    stats.value = result
  } catch {
    loadError.value = true
  } finally {
    loading.value = false
  }
}

// Troca de ano: mostra o carregando (que recria os cartões, fechando o
// formulário da meta) e sai de um erro anterior
async function changeYear(value) {
  year.value = value
  await loadStats()
}

onMounted(loadStats)
</script>

<style scoped>
/* Visual do aviso em main.css (.notice) */
.isbn-notice {
  margin-bottom: var(--space-6);
}

/* Ano + retrospectiva no cabeçalho */
.header-side {
  display: flex;
  align-items: center;
  gap: var(--space-4);
}

.year-link {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-pill);
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

/* Grade dos cartões; --chart-height é a altura do gráfico em DashboardCard */
.charts-grid {
  --chart-height: 280px;
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-6);
}

.main-chart {
  grid-column: 1 / -1;
}

.charts-grid.lower {
  --chart-height: 300px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  margin-top: var(--space-6);
}

.chart-skeleton {
  background-color: var(--bg-panel);
  border-radius: var(--card-radius);
  margin-bottom: var(--space-6);
}

@media (max-width: 1279.98px) {
  .charts-grid.lower {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .charts-grid.lower > :first-child {
    grid-column: 1 / -1;
  }
}

/* .charts-grid.lower segue com 300px (seletor mais específico) */
@media (max-width: 1023.98px) {
  .charts-grid {
    --chart-height: 240px;
  }

  .charts-grid,
  .charts-grid.lower {
    grid-template-columns: 1fr;
  }

  .main-chart {
    grid-column: auto;
  }
}

@media (max-width: 639.98px) {
  .charts-grid {
    gap: var(--space-4);
  }

  .dashboard-container > .page-header :deep(.page-header-actions),
  .header-side {
    width: 100%;
    justify-content: space-between;
  }

  /* A 320 o link da retrospectiva e o ano não cabem lado a lado */
  .header-side {
    flex-wrap: wrap;
    gap: var(--space-2) var(--space-4);
  }
}
</style>
