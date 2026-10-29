<template>
  <div class="system">
    <div class="toolbar">
      <span
        v-if="loadedAt"
        class="muted"
      >{{ t('admin.system.loadedAt', { time: formatDateTime(loadedAt, locale) }) }}</span>
      <AppButton
        :label="t('admin.system.refresh')"
        icon="pi pi-refresh"
        class="btn-outlined btn-secondary btn-sm"
        :loading="loading"
        @click="load"
      />
    </div>

    <AppSkeleton
      v-if="loading && !data"
      height="480px"
    />
    <EmptyState
      v-else-if="failed && !data"
      variant="error"
      compact
      :level="3"
      :title="t('common.loadErrorTitle')"
      @action="load"
    />

    <div
      v-else-if="data"
      class="grid"
    >
      <!-- Serviço -->
      <section
        class="card"
        aria-labelledby="sys-service"
      >
        <h2 id="sys-service"><i
            class="pi pi-server"
            aria-hidden="true"
          ></i> {{ t('admin.system.service.title') }}</h2>
        <dl>
          <div>
            <dt>{{ t('admin.system.service.backend') }}</dt>
            <dd>{{ t('admin.system.service.since', { date: formatDateTime(data.service.startedAt, locale), uptime: formatDuration(data.service.uptimeSeconds) }) }}</dd>
          </div>
          <div>
            <dt>{{ t('admin.system.service.frontend') }}</dt>
            <dd>{{ t('admin.system.service.built', { date: formatDateTime(buildTime, locale) }) }}</dd>
          </div>
          <div v-if="data.service.version">
            <dt>{{ t('admin.system.service.version') }}</dt>
            <dd class="mono">{{ data.service.version }}</dd>
          </div>
          <div>
            <dt>{{ t('admin.system.service.runtime') }}</dt>
            <dd>Node {{ data.service.node }} · {{ data.service.environment }}</dd>
          </div>
          <div>
            <dt>{{ t('admin.system.service.memory') }}</dt>
            <dd>{{ formatBytes(data.service.memory.rss, locale) }}</dd>
          </div>
          <div>
            <dt>{{ t('admin.system.service.appUrl') }}</dt>
            <dd class="mono">{{ data.config.appUrl || t('admin.system.notSet') }}</dd>
          </div>
          <div>
            <dt>{{ t('admin.system.service.proxy') }}</dt>
            <dd>{{ t('admin.system.service.proxyValue', { trust: data.config.trustProxy ?? t('admin.system.notSet'), secure: data.config.cookieSecure ? t('admin.system.yes') : t('admin.system.no') }) }}</dd>
          </div>
          <div>
            <dt>{{ t('admin.system.service.olContact') }}</dt>
            <dd>{{ data.config.openLibraryContact ? t('admin.system.yes') : t('admin.system.service.olContactMissing') }}</dd>
          </div>
          <div>
            <dt>{{ t('admin.system.service.load') }}</dt>
            <dd>{{ data.service.load.join(' · ') }} <span class="muted">({{ t('admin.system.service.cpus', { n: data.service.cpus }, data.service.cpus) }})</span></dd>
          </div>
        </dl>
      </section>

      <!-- Banco -->
      <section
        class="card"
        aria-labelledby="sys-db"
      >
        <h2 id="sys-db"><i
            class="pi pi-database"
            aria-hidden="true"
          ></i> {{ t('admin.system.db.title') }}</h2>
        <p
          class="status"
          :class="data.database.ok ? 'ok' : 'bad'"
        >
          <i
            :class="data.database.ok ? 'pi pi-check-circle' : 'pi pi-times-circle'"
            aria-hidden="true"
          ></i>
          {{ data.database.ok ? t('admin.system.db.ok', { ms: data.database.latencyMs }) : t('admin.system.db.down', { error: data.database.error }) }}
        </p>
        <dl v-if="data.database.ok">
          <div>
            <dt>{{ t('admin.system.db.version') }}</dt>
            <dd>PostgreSQL {{ data.database.version }}</dd>
          </div>
          <div>
            <dt>{{ t('admin.system.db.size') }}</dt>
            <dd>{{ formatBytes(data.database.size, locale) }}</dd>
          </div>
          <div>
            <dt>{{ t('admin.system.db.connections') }}</dt>
            <dd>{{ t('admin.system.db.pool', { total: data.database.pool.total, idle: data.database.pool.idle, waiting: data.database.pool.waiting, all: data.database.connections }) }}</dd>
          </div>
          <div>
            <dt>{{ t('admin.system.db.migration') }}</dt>
            <dd>
              <span class="mono">{{ data.database.lastMigration?.version || '—' }}</span>
              <span
                v-if="data.database.lastMigration"
                class="muted"
              > · {{ formatDateTime(data.database.lastMigration.appliedAt, locale) }}</span>
            </dd>
          </div>
        </dl>
        <p
          v-if="data.database.ok && data.database.pendingMigrations.length"
          class="status bad"
        >{{ t('admin.system.db.pending', { list: data.database.pendingMigrations.join(', ') }) }}</p>
      </section>

      <!-- Armazenamento -->
      <section
        class="card"
        aria-labelledby="sys-storage"
      >
        <h2 id="sys-storage"><i
            class="pi pi-images"
            aria-hidden="true"
          ></i> {{ t('admin.system.storage.title') }}</h2>
        <dl>
          <div>
            <dt>{{ t('admin.system.storage.covers') }}</dt>
            <dd>{{ data.storage.uploads.files === null ? '—' : t('admin.system.storage.files', { n: formatNumber(data.storage.uploads.files, locale), size: formatBytes(data.storage.uploads.bytes, locale) }) }}</dd>
          </div>
          <div>
            <dt>{{ t('admin.system.storage.disk') }}</dt>
            <dd>{{ data.storage.disk.total === null ? '—' : t('admin.system.storage.free', { free: formatBytes(data.storage.disk.free, locale), total: formatBytes(data.storage.disk.total, locale), p: diskFree }) }}</dd>
          </div>
        </dl>
        <div
          v-if="data.storage.disk.total"
          class="meter"
          :class="{ low: diskFree < 10 }"
          role="img"
          :aria-label="t('admin.system.storage.used', { p: 100 - diskFree })"
        ><span :style="{ width: `${100 - diskFree}%` }"></span></div>
        <p
          v-if="data.storage.disk.total && diskFree < 10"
          class="status bad"
        >{{ t('admin.system.storage.lowDisk') }}</p>
        <p class="hint">{{ t('admin.system.storage.hint') }}</p>
      </section>

      <!-- E-mail -->
      <section
        class="card"
        aria-labelledby="sys-email"
      >
        <h2 id="sys-email"><i
            class="pi pi-envelope"
            aria-hidden="true"
          ></i> {{ t('admin.system.email.title') }}</h2>
        <p
          class="status"
          :class="data.email.configured ? 'ok' : 'warn'"
        >
          <i
            :class="data.email.configured ? 'pi pi-check-circle' : 'pi pi-exclamation-triangle'"
            aria-hidden="true"
          ></i>
          {{ data.email.configured ? t('admin.system.email.configured', { host: `${data.email.host}:${data.email.port}` }) : t('admin.system.email.notConfigured') }}
        </p>
        <dl>
          <div>
            <dt>{{ t('admin.system.email.from') }}</dt>
            <dd>{{ data.email.from }}</dd>
          </div>
          <div>
            <dt>{{ t('admin.system.email.reports') }}</dt>
            <dd>{{ data.email.adminEmail ? t('admin.system.yes') : t('admin.system.email.noAdminEmail') }}</dd>
          </div>
          <div>
            <dt>{{ t('admin.system.email.week') }}</dt>
            <dd>
              {{ t('admin.system.email.sentFailed', { sent: data.email.sent7, failed: data.email.failed7 }) }}
            </dd>
          </div>
          <div>
            <dt>{{ t('admin.system.email.lastOk') }}</dt>
            <dd>{{ data.email.lastSuccessAt ? formatDateTime(data.email.lastSuccessAt, locale) : t('admin.system.sinceBoot') }}</dd>
          </div>
          <div v-if="data.email.lastFailure">
            <dt>{{ t('admin.system.email.lastFailure') }}</dt>
            <dd class="bad-text">{{ formatDateTime(data.email.lastFailure.at, locale) }} — {{ data.email.lastFailure.message }}</dd>
          </div>
        </dl>
        <AppButton
          :label="t('admin.system.email.test')"
          icon="pi pi-send"
          class="btn-outlined btn-sm"
          :loading="testing"
          @click="testEmail"
        />
      </section>

      <!-- Open Library -->
      <section
        class="card wide"
        aria-labelledby="sys-ol"
      >
        <h2 id="sys-ol"><i
            class="pi pi-book"
            aria-hidden="true"
          ></i> Open Library</h2>
        <div class="ol-layout">
          <dl>
            <div>
              <dt>{{ t('admin.system.ol.week') }}</dt>
              <dd>{{ t('admin.system.ol.calls', { ok: data.openLibrary.last7.ok, error: data.openLibrary.last7.error, timeout: data.openLibrary.last7.timeout }) }}</dd>
            </div>
            <div>
              <dt>{{ t('admin.system.ol.errorRate') }}</dt>
              <dd :class="{ 'bad-text': data.openLibrary.errorRate >= 10 }">{{ data.openLibrary.errorRate === null ? '—' : `${data.openLibrary.errorRate}%` }}</dd>
            </div>
            <div>
              <dt>{{ t('admin.system.ol.latency') }}</dt>
              <dd>{{ data.openLibrary.latency.samples ? t('admin.system.ol.ms', { avg: data.openLibrary.latency.avgMs, p95: data.openLibrary.latency.p95Ms }) : t('admin.system.sinceBoot') }}</dd>
            </div>
            <div v-if="data.openLibrary.lastFailure">
              <dt>{{ t('admin.system.ol.lastFailure') }}</dt>
              <dd class="bad-text">{{ formatDateTime(data.openLibrary.lastFailure.at, locale) }} — {{ data.openLibrary.lastFailure.message }}</dd>
            </div>
            <div>
              <dt>{{ t('admin.system.ol.books') }}</dt>
              <dd>{{ t('admin.system.ol.booksDetail', { linked: formatNumber(data.openLibrary.books.linked, locale), linkable: formatNumber(data.openLibrary.books.linkable, locale), unlinked: formatNumber(data.openLibrary.books.unlinked, locale) }) }}</dd>
            </div>
          </dl>
          <div class="chart-wrapper">
            <ChartCanvas
              type="bar"
              :data="olChartData"
              :options="olChartOptions"
              :aria-label="olChartLabel"
            />
          </div>
        </div>
        <p
          v-if="data.openLibrary.books.linkable"
          class="hint"
        >{{ t('admin.system.ol.enrichHint') }}</p>
      </section>

      <!-- Limites de requisição -->
      <section
        class="card"
        aria-labelledby="sys-limits"
      >
        <h2 id="sys-limits"><i
            class="pi pi-shield"
            aria-hidden="true"
          ></i> {{ t('admin.system.limits.title') }}</h2>
        <p
          v-if="!data.rateLimits.last7.length"
          class="muted"
        >{{ t('admin.system.limits.none') }}</p>
        <table v-else>
          <thead>
            <tr>
              <th scope="col">{{ t('admin.system.limits.code') }}</th>
              <th
                scope="col"
                class="num"
              >{{ t('admin.system.limits.today') }}</th>
              <th
                scope="col"
                class="num"
              >{{ t('admin.system.limits.week') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in data.rateLimits.last7"
              :key="row.code"
            >
              <th scope="row">{{ limitName(row.code) }}</th>
              <td class="num">{{ todayLimit(row.code) }}</td>
              <td class="num">{{ row.total }}</td>
            </tr>
          </tbody>
        </table>
        <h3>{{ t('admin.system.limits.ips') }}</h3>
        <p
          v-if="!data.rateLimits.topIps.length"
          class="muted"
        >{{ t('admin.system.limits.noIps') }}</p>
        <ul
          v-else
          class="ips"
        >
          <li
            v-for="row in data.rateLimits.topIps"
            :key="row.ip"
          >
            <span class="mono">{{ row.ip }}</span>
            <span>{{ row.total }}×</span>
            <span class="muted">{{ Object.keys(row.codes).map(limitName).join(', ') }}</span>
          </li>
        </ul>
        <p class="hint">{{ t('admin.system.limits.hint') }}</p>
      </section>

      <!-- Erros 500 -->
      <section
        class="card wide"
        aria-labelledby="sys-errors"
      >
        <h2 id="sys-errors"><i
            class="pi pi-exclamation-triangle"
            aria-hidden="true"
          ></i> {{ t('admin.system.errors.title') }}</h2>
        <p class="muted">{{ t('admin.system.errors.counts', { today: data.errors.today, week: data.errors.last7 }) }}</p>
        <p
          v-if="!data.errors.recent.length"
          class="muted"
        >{{ t('admin.system.errors.none') }}</p>
        <div
          v-else
          class="table-scroll"
        >
          <table>
            <thead>
              <tr>
                <th scope="col">{{ t('admin.system.errors.when') }}</th>
                <th scope="col">{{ t('admin.system.errors.route') }}</th>
                <th scope="col">{{ t('admin.system.errors.context') }}</th>
                <th scope="col">{{ t('admin.system.errors.message') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(row, index) in data.errors.recent"
                :key="index"
              >
                <td class="nowrap">{{ formatDateTime(row.at, locale) }}</td>
                <td class="mono nowrap">{{ row.method }} {{ row.path }}</td>
                <td>{{ row.context }}</td>
                <td class="message">{{ row.message }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="hint">{{ t('admin.system.errors.hint') }}</p>
      </section>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import AppButton from '../ui/AppButton.vue'
import AppSkeleton from '../ui/AppSkeleton.vue'
import EmptyState from '../ui/EmptyState.vue'
import ChartCanvas from '../ui/ChartCanvas.vue'
import api from '../../services/api.js'
import { useToast } from '../../services/toast.js'
import { useTheme, cssVar } from '../../composables/useTheme.js'
import { LockedError, useAdminCall, formatBytes, formatDateTime, formatDayMonth, formatDuration, formatNumber } from './adminCall.js'

const buildTime = typeof __APP_BUILD_TIME__ === 'string' ? __APP_BUILD_TIME__ : null

const { t, te, locale } = useI18n()
const call = useAdminCall()
const toast = useToast()
const { themeVersion } = useTheme()

const data = ref(null)
const loading = ref(true)
const failed = ref(false)
const testing = ref(false)
const loadedAt = ref(null)

const diskFree = computed(() => {
  const disk = data.value?.storage.disk
  return disk?.total ? Math.round((disk.free / disk.total) * 100) : 0
})

function limitName(code) {
  return te(`admin.system.limits.codes.${code}`) ? t(`admin.system.limits.codes.${code}`) : code
}

function todayLimit(code) {
  return data.value.rateLimits.today.find(row => row.code === code)?.total || 0
}

const palette = computed(() => {
  themeVersion.value
  return {
    ok: cssVar('--green') || '#3d7a20',
    error: cssVar('--red') || '#c9283f',
    timeout: cssVar('--orange') || '#b8481f',
    text: cssVar('--text-secondary') || '#a1a1aa',
    grid: cssVar('--border-color') || 'rgba(255,255,255,0.1)'
  }
})

const olChartData = computed(() => {
  const days = data.value.openLibrary.daily
  return {
    labels: days.map(day => formatDayMonth(`${day.day}T12:00:00`, locale.value)),
    datasets: ['ok', 'error', 'timeout'].map(key => ({
      label: t(`admin.system.ol.series.${key}`),
      data: days.map(day => day[key]),
      backgroundColor: palette.value[key],
      borderRadius: 3,
      stack: 'calls'
    }))
  }
})

const olChartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { position: 'bottom', labels: { color: palette.value.text, boxWidth: 12 } } },
  scales: {
    x: { stacked: true, grid: { display: false }, ticks: { color: palette.value.text } },
    y: { stacked: true, beginAtZero: true, grid: { color: palette.value.grid }, ticks: { color: palette.value.text, precision: 0 } }
  }
}))

const olChartLabel = computed(() => t('admin.system.ol.chartLabel', {
  list: data.value.openLibrary.daily.map(day => `${day.day}: ${day.ok}/${day.error}/${day.timeout}`).join('; ')
}))

async function load() {
  loading.value = true
  failed.value = false
  try {
    data.value = await call(() => api.adminSystem())
    loadedAt.value = new Date().toISOString()
  } catch (error) {
    if (!(error instanceof LockedError)) {
      failed.value = true
      if (data.value) toast.add({ severity: 'error', summary: t('common.error'), detail: error.message })
    }
  } finally {
    loading.value = false
  }
}

async function testEmail() {
  testing.value = true
  try {
    const result = await call(() => api.adminEmailTest())
    toast.add(result.smtp
      ? { severity: 'success', summary: t('admin.system.email.testSent', { to: result.to }), life: 5000 }
      : { severity: 'warn', summary: t('admin.system.email.testLogged'), life: 6000 })
    load()
  } catch (error) {
    if (!(error instanceof LockedError)) toast.add({ severity: 'error', summary: t('common.error'), detail: error.message, life: 8000 })
  } finally {
    testing.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.system {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.toolbar {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 0.75rem;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 1rem;
  align-items: start;
}

.card {
  background: var(--bg-panel);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  padding: 1.25rem 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  min-width: 0;
}

.card.wide {
  grid-column: 1 / -1;
}

h2 {
  margin: 0;
  font-size: var(--fs-lg);
  color: var(--text-primary);
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

h2 .pi {
  color: var(--text-secondary);
  font-size: var(--fs-md);
}

h3 {
  margin: 0.5rem 0 0;
  font-size: var(--fs-md);
  color: var(--text-primary);
}

dl {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}

dl div {
  display: grid;
  grid-template-columns: minmax(120px, 40%) 1fr;
  gap: 0.75rem;
  font-size: var(--fs-sm);
}

dt {
  color: var(--text-secondary);
}

dd {
  margin: 0;
  color: var(--text-primary);
  overflow-wrap: anywhere;
}

.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.92em;
}

.muted {
  color: var(--text-secondary);
  font-size: var(--fs-sm);
  margin: 0;
}

.hint {
  margin: 0;
  color: var(--text-muted);
  font-size: var(--fs-xs);
}

.status {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.45rem 0.75rem;
  border-radius: 8px;
  font-size: var(--fs-sm);
  font-weight: 600;
  color: var(--text-primary);
}

.status.ok { background: rgba(var(--green-rgb), 0.14); }
.status.ok .pi { color: var(--green); }
.status.warn { background: rgba(var(--yellow-rgb), 0.18); }
.status.warn .pi { color: var(--yellow); }
.status.bad { background: rgba(var(--red-rgb), 0.14); }
.status.bad .pi { color: var(--red); }

.bad-text {
  color: var(--red);
}

.meter {
  height: 10px;
  border-radius: 999px;
  background: var(--bg-input);
  overflow: hidden;
}

.meter span {
  display: block;
  height: 100%;
  background: var(--main-color);
}

.meter.low span {
  background: var(--red);
}

.ol-layout {
  display: grid;
  grid-template-columns: minmax(280px, 1fr) minmax(0, 1.4fr);
  gap: 1.5rem;
  align-items: center;
}

.chart-wrapper {
  height: 220px;
  min-width: 0;
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--fs-sm);
}

th,
td {
  text-align: left;
  padding: 0.45rem 0.4rem;
  border-bottom: 1px solid var(--border-color);
  color: var(--text-primary);
  font-weight: 400;
  vertical-align: top;
}

thead th {
  color: var(--text-secondary);
  font-weight: 600;
  font-size: var(--fs-xs);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

tbody tr:last-child th,
tbody tr:last-child td {
  border-bottom: none;
}

.num {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.nowrap {
  white-space: nowrap;
}

.message {
  color: var(--text-secondary);
  overflow-wrap: anywhere;
}

.table-scroll {
  position: relative;
  overflow-x: auto;
}

.ips {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  font-size: var(--fs-sm);
}

.ips li {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.empty {
  text-align: center;
  color: var(--text-secondary);
  padding: 2rem 1rem;
}

@media (max-width: 1000px) {
  .ol-layout {
    grid-template-columns: 1fr;
  }
}
</style>
