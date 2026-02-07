<template>
  <div class="dashboard-container">
    <div class="header-section">
      <div class="welcome-text">
        <h1>{{ $t('dashboard.title') }}</h1>
        <p>{{ $t('dashboard.subtitle') }}</p>
      </div>
      <div class="date-display">{{ currentDate }}</div>
    </div>

    <div
      v-if="loading"
      class="loading-layout"
    >
      <div class="kpi-grid">
        <Skeleton
          height="120px"
          class="kpi-skeleton"
          v-for="n in 4"
          :key="n"
        />
      </div>
      <div class="charts-grid">
        <Skeleton
          height="350px"
          class="chart-skeleton"
        />
        <Skeleton
          height="350px"
          class="chart-skeleton"
        />
      </div>
    </div>

    <div
      v-else
      class="dashboard-content"
    >
      <div class="kpi-grid">
        <div class="kpi-card total">
          <div class="kpi-icon"><i class="pi pi-book"></i></div>
          <div class="kpi-info">
            <span class="label">{{ $t('dashboard.totalBooks') }}</span>
            <span class="value">{{ stats.totalBooks }}</span>
          </div>
        </div>

        <div class="kpi-card read">
          <div class="kpi-icon"><i class="pi pi-check-circle"></i></div>
          <div class="kpi-info">
            <span class="label">{{ $t('dashboard.readBooks') }}</span>
            <span class="value">{{ stats.readBooks }}</span>
          </div>
        </div>

        <div class="kpi-card unread">
          <div class="kpi-icon"><i class="pi pi-bookmark"></i></div>
          <div class="kpi-info">
            <span class="label">{{ $t('dashboard.unreadBooks') }}</span>
            <span class="value">{{ unreadBooks }}</span>
          </div>
        </div>

        <div class="kpi-card rate">
          <div class="kpi-icon"><i class="pi pi-percentage"></i></div>
          <div class="kpi-info">
            <span class="label">{{ $t('dashboard.readingRate') }}</span>
            <span class="value">{{ readingRate }}%</span>
          </div>
        </div>
      </div>

      <div class="charts-grid">
        <div class="chart-card main-chart">
          <h3>{{ $t('dashboard.readingByYear') }}</h3>
          <div class="chart-wrapper">
            <Chart
              type="bar"
              :data="yearChartData"
              :options="yearChartOptions"
              class="h-full"
            />
          </div>
        </div>

        <div class="chart-card">
          <h3>{{ $t('dashboard.favoriteGenres') }}</h3>
          <div class="chart-wrapper flex-center">
            <div
              v-if="stats.topTags.length === 0"
              class="no-data"
            >{{ $t('dashboard.noTagsData') }}</div>
            <Chart
              v-else
              type="doughnut"
              :data="tagsChartData"
              :options="doughnutOptions"
              class="h-full w-full"
            />
          </div>
        </div>

        <div class="chart-card authors-list">
          <h3>{{ $t('dashboard.topAuthors') }}</h3>
          <div class="authors-wrapper">
            <div
              v-if="stats.topAuthors.length === 0"
              class="no-data"
            >{{ $t('dashboard.noAuthorsData') }}</div>
            <div
              v-for="(author, index) in stats.topAuthors"
              :key="author.name"
              class="author-row"
            >
              <div class="rank">{{ index + 1 }}</div>
              <div class="name">{{ author.name }}</div>
              <div class="count">{{ author.count }} {{ $t('dashboard.books') }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import Chart from 'primevue/chart'
import Skeleton from 'primevue/skeleton'
import api from '../services/api.js'

const { t, locale } = useI18n() 

const loading = ref(true)
const stats = ref({
  totalBooks: 0,
  readBooks: 0,
  readingByYear: [],
  topAuthors: [],
  topTags: []
})

const currentDate = computed(() => {
  const dateLocale = locale.value === 'pt' ? 'pt-BR' : 'en-US'
  return new Date().toLocaleDateString(dateLocale, {
    weekday: 'long', day: 'numeric', month: 'long'
  })
})

const readingRate = computed(() => {
  if (!stats.value.totalBooks) return 0
  return Math.round((stats.value.readBooks / stats.value.totalBooks) * 100)
})

const unreadBooks = computed(() => {
  return stats.value.totalBooks - stats.value.readBooks
})

const mainColor = '#3a86ff'
const gridColor = 'rgba(255,255,255,0.1)'
const textColor = '#a1a1aa'

const yearChartData = computed(() => {
  const sorted = [...stats.value.readingByYear].sort((a, b) => a.year - b.year)
  return {
    labels: sorted.map(i => i.year),
    datasets: [{
      label: t('dashboard.readBooks'),
      data: sorted.map(i => i.count),
      backgroundColor: mainColor,
      borderRadius: 6
    }]
  }
})

const yearChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: false } },
  scales: {
    y: { grid: { color: gridColor }, ticks: { color: textColor, precision: 0 } },
    x: { grid: { display: false }, ticks: { color: textColor } }
  }
}

const tagsChartData = computed(() => {
  return {
    labels: stats.value.topTags.map(t => t.name),
    datasets: [{
      data: stats.value.topTags.map(t => t.count),
      backgroundColor: ['#ff4b78', '#a9ff54', '#4ed3fc', '#8d78fa', '#fdd457', '#ff8a50'],
      borderWidth: 0,
      hoverOffset: 10
    }]
  }
})

const doughnutOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { position: 'right', labels: { color: textColor, usePointStyle: true } }
  }
}

onMounted(async () => {
  try {
    const data = await api.getDashboardStats()
    stats.value = data
  } catch (error) {
    console.error('Dashboard load failed:', error)
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.dashboard-container {
  padding: 2rem;
  min-height: 100vh;
  background-color: var(--bg-app);
  margin: 0 10vw;
}

.header-section {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  margin-bottom: 2rem;
}

.welcome-text h1 {
  margin: 0;
  font-size: 2rem;
  color: var(--text-primary);
  font-family: 'Georgia', serif;
}

.welcome-text p {
  margin: 0.5rem 0 0;
  color: var(--text-secondary);
}

.date-display {
  color: var(--main-color);
  font-weight: 600;
  text-transform: capitalize;
}

.kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 1.5rem;
  margin-bottom: 2rem;
}

.kpi-card {
  background-color: var(--bg-panel);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  padding: 1.5rem;
  display: flex;
  align-items: center;
  gap: 1rem;
  transition: transform 0.2s;
}

.kpi-card:hover {
  transform: translateY(-3px);
  border-color: var(--border-hover);
}

.kpi-icon {
  width: 50px;
  height: 50px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5rem;
  flex-shrink: 0;
}

.kpi-card.total .kpi-icon {
  background: rgba(59, 246, 68, 0.1);
  color: #a9ff54;
}

.kpi-card.read .kpi-icon {
  background: rgba(175, 76, 76, 0.1);
  color: #ff4b78;
}

.kpi-card.unread .kpi-icon {
  background: rgba(139, 92, 246, 0.1);
  color: #8d78fa;
}

.kpi-card.rate .kpi-icon {
  background: rgba(245, 158, 11, 0.1);
  color: #f59e0b;
}

.kpi-info {
  display: flex;
  flex-direction: column;
}

.kpi-info .label {
  color: var(--text-secondary);
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.kpi-info .value {
  color: var(--text-primary);
  font-size: 1.8rem;
  font-weight: 700;
}

.charts-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1.5rem;
}

.chart-card {
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
  font-size: 1.1rem;
  font-weight: 600;
}

.chart-wrapper {
  flex: 1;
  position: relative;
  min-height: 0;
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
  gap: 1rem;
  height: 100%;
  justify-content: center;
}

.author-row {
  display: flex;
  align-items: center;
  gap: 1rem;
  position: relative;
  padding: 0.5rem 0;
}

.author-row .rank {
  font-weight: bold;
  color: var(--text-secondary);
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
  font-size: 0.9rem;
  margin-left: auto;
  z-index: 2;
}

.bar-visual {
  position: absolute;
  left: 30px;
  top: 10%;
  height: 80%;
  background-color: rgba(76, 175, 80, 0.15);
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

@media (max-width: 900px) {
  .charts-grid {
    grid-template-columns: 1fr;
  }

  .main-chart {
    grid-column: auto;
  }
}

@media (max-width: 600px) {
  .dashboard-container {
    padding: 1rem;
  }

  .kpi-grid {
    grid-template-columns: 1fr;
  }

  .header-section {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.5rem;
  }
}
</style>
