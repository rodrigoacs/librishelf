<template>
  <div class="overview">
    <div
      v-if="loading"
      class="kpi-grid"
    >
      <AppSkeleton
        v-for="n in 8"
        :key="n"
        height="104px"
      />
    </div>

    <EmptyState
      v-else-if="failed"
      variant="error"
      compact
      :level="3"
      :title="t('common.loadErrorTitle')"
      @action="load"
    />

    <template v-else-if="stats">
      <div class="kpi-grid">
        <component
          :is="card.tab ? 'button' : 'div'"
          v-for="card in cards"
          :key="card.key"
          :type="card.tab ? 'button' : undefined"
          class="kpi-card"
          :class="[card.key, { clickable: card.tab, alert: card.alert }]"
          @click="card.tab && emit('open-tab', card.tab, card.tabOptions)"
        >
          <i
            v-if="card.tab"
            class="pi pi-arrow-up-right kpi-arrow"
            aria-hidden="true"
          ></i>
          <div class="kpi-icon"><i
              :class="card.icon"
              aria-hidden="true"
            ></i></div>
          <div class="kpi-info">
            <span class="label">{{ card.label }}</span>
            <span class="value">{{ formatNumber(card.value, locale) }}</span>
            <span
              v-if="card.sub"
              class="sub"
            >{{ card.sub }}</span>
          </div>
        </component>
      </div>

      <div class="two-cols">
        <section
          class="chart-card"
          aria-labelledby="admin-funnel-title"
        >
          <h2 id="admin-funnel-title">{{ t('admin.overview.funnel') }}</h2>
          <ol class="funnel">
            <li
              v-for="step in funnel"
              :key="step.key"
            >
              <div class="funnel-row">
                <span class="funnel-label">{{ step.label }}</span>
                <span class="funnel-value">{{ formatNumber(step.value, locale) }} <small>{{ step.percent }}%</small></span>
              </div>
              <div
                class="bar"
                aria-hidden="true"
              ><span :style="{ width: `${step.percent}%` }"></span></div>
            </li>
          </ol>
          <p class="note">{{ t('admin.overview.returned', { n: stats.engagement.returned, total: stats.engagement.olderThanWeek, p: percent(stats.engagement.returned, stats.engagement.olderThanWeek) }) }}</p>
        </section>
        <section
          class="chart-card"
          aria-labelledby="admin-activity-title"
        >
          <h2 id="admin-activity-title">{{ t('admin.overview.activity') }}</h2>
          <dl class="activity">
            <div><dt>{{ t('admin.overview.books7') }}</dt><dd>{{ formatNumber(stats.engagement.books7, locale) }}</dd></div>
            <div><dt>{{ t('admin.overview.books30') }}</dt><dd>{{ formatNumber(stats.engagement.books30, locale) }}</dd></div>
            <div><dt>{{ t('admin.overview.finished30') }}</dt><dd>{{ formatNumber(stats.engagement.finished30, locale) }}</dd></div>
            <div><dt>{{ t('admin.overview.reviews30') }}</dt><dd>{{ formatNumber(stats.engagement.reviews30, locale) }}</dd></div>
          </dl>
        </section>
      </div>

      <div class="chart-card">
        <h2>{{ t('admin.overview.signupsByWeek') }}</h2>
        <div class="chart-wrapper">
          <ChartCanvas
            type="bar"
            :data="chartData"
            :options="chartOptions"
            :aria-label="chartLabel"
          />
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import AppSkeleton from '../ui/AppSkeleton.vue'
import EmptyState from '../ui/EmptyState.vue'
import ChartCanvas from '../ui/ChartCanvas.vue'
import api from '../../services/api.js'
import { useTheme, cssVar } from '../../composables/useTheme.js'
import { LockedError, useAdminCall, formatNumber, formatDayMonth } from './adminCall.js'

const emit = defineEmits(['open-tab', 'loaded'])
const { t, locale } = useI18n()
const call = useAdminCall()
const { themeVersion } = useTheme()

const stats = ref(null)
const loading = ref(true)
const failed = ref(false)

const percent = (part, total) => (total ? Math.round((part / total) * 100) : 0)

const cards = computed(() => {
  const s = stats.value
  return [
    { key: 'users', icon: 'pi pi-users', label: t('admin.overview.users'), value: s.users.total,
      sub: t('admin.overview.verified', { n: percent(s.users.verified, s.users.total) }), tab: 'accounts' },
    { key: 'active', icon: 'pi pi-bolt', label: t('admin.overview.active30'), value: s.users.active30,
      sub: t('admin.overview.active7', { n: s.users.active7, p: percent(s.users.active30, s.users.total) }) },
    { key: 'signups', icon: 'pi pi-user-plus', label: t('admin.overview.signups7'), value: s.users.signups7,
      sub: t('admin.overview.signups30', { n: s.users.signups30 }) },
    { key: 'public', icon: 'pi pi-globe', label: t('admin.overview.publicLibraries'), value: s.community.publicLibraries,
      sub: t('admin.overview.inCommunity', { n: s.community.members }) },
    { key: 'books', icon: 'pi pi-book', label: t('admin.overview.books'), value: s.content.books },
    { key: 'reviews', icon: 'pi pi-comment', label: t('admin.overview.reviews'), value: s.content.reviews,
      sub: t('admin.overview.hiddenReviews', { n: s.content.hiddenReviews }) },
    { key: 'lists', icon: 'pi pi-list', label: t('admin.overview.lists'), value: s.content.lists },
    { key: 'stale', icon: 'pi pi-envelope', label: t('admin.overview.staleSignups'), value: s.users.staleSignups,
      sub: t('admin.overview.staleHint'), tab: 'accounts', tabOptions: { status: 'unverified' }, alert: s.users.staleSignups > 0 },
    { key: 'reports', icon: 'pi pi-flag', label: t('admin.overview.openReports'), value: s.moderation.openReports,
      sub: t('admin.overview.suspended', { n: s.users.suspended }, s.users.suspended), tab: 'moderation', alert: s.moderation.openReports > 0 }
  ]
})

const funnel = computed(() => {
  const f = stats.value.engagement.funnel
  return [
    { key: 'signedUp', label: t('admin.overview.funnelSteps.signedUp'), value: f.signedUp },
    { key: 'verified', label: t('admin.overview.funnelSteps.verified'), value: f.verified },
    { key: 'withBook', label: t('admin.overview.funnelSteps.withBook'), value: f.withBook },
    { key: 'with10Books', label: t('admin.overview.funnelSteps.with10Books'), value: f.with10Books }
  ].map(step => ({ ...step, percent: percent(step.value, f.signedUp) }))
})

const palette = computed(() => {
  themeVersion.value // redesenha quando o tema muda
  return {
    main: cssVar('--main-color') || '#3a86ff',
    text: cssVar('--text-secondary') || '#a1a1aa',
    grid: cssVar('--border-color') || 'rgba(255,255,255,0.1)'
  }
})

const weekLabels = computed(() => (stats.value?.signupsByWeek || []).map(item =>
  formatDayMonth(`${item.week}T12:00:00`, locale.value)))

const chartData = computed(() => ({
  labels: weekLabels.value,
  datasets: [{
    label: t('admin.overview.signupsLabel'),
    data: stats.value.signupsByWeek.map(item => item.total),
    backgroundColor: palette.value.main,
    borderRadius: 6
  }]
}))

const chartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: false } },
  scales: {
    y: { beginAtZero: true, grid: { color: palette.value.grid }, ticks: { color: palette.value.text, precision: 0 } },
    x: { grid: { display: false }, ticks: { color: palette.value.text } }
  }
}))

const chartLabel = computed(() => t('admin.overview.chartLabel', {
  list: stats.value.signupsByWeek.map((item, index) => `${weekLabels.value[index]}: ${item.total}`).join('; ')
}))

async function load() {
  loading.value = true
  failed.value = false
  try {
    stats.value = await call(() => api.adminStats())
    emit('loaded', stats.value)
  } catch (error) {
    if (!(error instanceof LockedError)) failed.value = true
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.overview {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
  gap: 1rem;
}

.kpi-card {
  --kpi-color: var(--main-color);
  position: relative;
  background-color: var(--bg-panel);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  padding: 1.25rem;
  display: flex;
  align-items: center;
  gap: 1rem;
  text-align: left;
  font: inherit;
  color: inherit;
}

.kpi-card.clickable {
  cursor: pointer;
  transition: transform 0.2s, border-color 0.2s;
}

.kpi-card.clickable:hover {
  transform: translateY(-3px);
  border-color: var(--border-hover);
}

.kpi-card.clickable:focus-visible {
  outline: var(--focus-ring);
  outline-offset: var(--focus-offset);
}

.kpi-arrow {
  position: absolute;
  top: 0.85rem;
  right: 0.85rem;
  font-size: var(--fs-xs);
  color: var(--text-muted);
}

.kpi-icon {
  width: 2.75rem;
  height: 2.75rem;
  flex-shrink: 0;
  border-radius: 12px;
  display: grid;
  place-items: center;
  background: rgba(var(--kpi-rgb, var(--main-color-rgb)), 0.14);
  color: var(--kpi-color);
  font-size: var(--fs-lg);
}

.kpi-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.kpi-info .label {
  color: var(--text-secondary);
  font-size: var(--fs-sm);
}

.kpi-info .value {
  color: var(--text-primary);
  font-size: var(--fs-2xl);
  font-weight: 700;
  line-height: 1.2;
}

.kpi-info .sub {
  color: var(--text-muted);
  font-size: var(--fs-xs);
}

.kpi-card.users { --kpi-color: var(--blue); --kpi-rgb: var(--blue-rgb); }
.kpi-card.active { --kpi-color: var(--green); --kpi-rgb: var(--green-rgb); }
.kpi-card.signups { --kpi-color: var(--purple); --kpi-rgb: var(--purple-rgb); }
.kpi-card.public { --kpi-color: var(--yellow); --kpi-rgb: var(--yellow-rgb); }
.kpi-card.books { --kpi-color: var(--green); --kpi-rgb: var(--green-rgb); }
.kpi-card.reviews { --kpi-color: var(--blue); --kpi-rgb: var(--blue-rgb); }
.kpi-card.lists { --kpi-color: var(--purple); --kpi-rgb: var(--purple-rgb); }
.kpi-card.stale { --kpi-color: var(--text-secondary); --kpi-rgb: 128, 128, 128; }
.kpi-card.stale.alert { --kpi-color: var(--yellow); --kpi-rgb: var(--yellow-rgb); }
.kpi-card.reports { --kpi-color: var(--text-secondary); --kpi-rgb: 128, 128, 128; }
.kpi-card.reports.alert { --kpi-color: var(--orange); --kpi-rgb: var(--orange-rgb); border-color: rgba(var(--orange-rgb), 0.45); }

.chart-card {
  background: var(--bg-panel);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  padding: 1.25rem 1.5rem;
}

.chart-card h2 {
  margin: 0 0 1rem;
  font-size: var(--fs-lg);
  color: var(--text-primary);
}

.chart-wrapper {
  height: 260px;
}

.two-cols {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 1rem;
}

.funnel {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.funnel-row {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
  font-size: var(--fs-sm);
  margin-bottom: 0.3rem;
}

.funnel-label {
  color: var(--text-secondary);
}

.funnel-value {
  color: var(--text-primary);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.funnel-value small {
  color: var(--text-muted);
  font-weight: 500;
  margin-left: 0.25rem;
}

.bar {
  height: 8px;
  border-radius: 999px;
  background: var(--bg-input);
  overflow: hidden;
}

.bar span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--main-color);
}

.note {
  margin: 1rem 0 0;
  color: var(--text-secondary);
  font-size: var(--fs-sm);
}

.activity {
  margin: 0;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}

.activity div {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.activity dt {
  color: var(--text-secondary);
  font-size: var(--fs-sm);
}

.activity dd {
  margin: 0;
  color: var(--text-primary);
  font-size: var(--fs-xl);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.empty {
  text-align: center;
  color: var(--text-secondary);
  padding: 2rem 1rem;
}
</style>
