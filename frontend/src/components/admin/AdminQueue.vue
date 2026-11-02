<template>
  <div class="queue">
    <AppSkeleton
      v-if="loading && !data"
      height="280px"
    />
    <EmptyState
      v-else-if="failed && !data"
      variant="error"
      compact
      :level="3"
      :title="t('common.loadErrorTitle')"
      @action="loadJobs"
    />

    <template v-else-if="data">
      <section
        class="card"
        aria-labelledby="admin-queue-email"
      >
        <h2
          id="admin-queue-email"
          class="section-title"
        >{{ t('admin.queue.email') }}</h2>
        <p class="hint">{{ t('admin.queue.emailHint', { queue: data.email.queue, reserve: data.email.reserve }) }}</p>
        <div
          class="meter"
          role="meter"
          :aria-valuenow="data.email.last24h"
          aria-valuemin="0"
          :aria-valuemax="data.email.daily"
          :aria-label="t('admin.queue.email')"
        >
          <span :style="{ width: `${emailPercent}%` }"></span>
        </div>
        <p class="meter-label">{{ t('admin.queue.emailUsage', { used: data.email.last24h, daily: data.email.daily }) }}</p>
      </section>

      <section
        class="card"
        aria-labelledby="admin-queue-jobs"
      >
        <h2
          id="admin-queue-jobs"
          class="section-title"
        >{{ t('admin.queue.jobs') }}</h2>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">{{ t('admin.queue.cols.type') }}</th>
                <th
                  scope="col"
                  class="num"
                >{{ t('admin.queue.cols.pending') }}</th>
                <th
                  scope="col"
                  class="num"
                >{{ t('admin.queue.cols.failed') }}</th>
                <th scope="col">{{ t('admin.queue.cols.lastDone') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in data.types"
                :key="row.type"
              >
                <th scope="row"><code>{{ row.type }}</code></th>
                <td class="num">{{ row.pending }}</td>
                <td
                  class="num"
                  :class="{ warn: row.failed }"
                >{{ row.failed }}</td>
                <td class="muted">{{ formatDateTime(row.lastDoneAt, locale) || '—' }}</td>
              </tr>
            </tbody>
          </table>
          <p
            v-if="data.types.length === 0"
            class="empty-note"
          >{{ t('admin.queue.noJobs') }}</p>
        </div>

        <template v-if="data.failed.length">
          <h3 class="section-title sub">{{ t('admin.queue.failed') }}</h3>
          <ul class="failures">
            <li
              v-for="job in data.failed"
              :key="job.id"
            >
              <span class="strong"><code>{{ job.type }}</code> #{{ job.id }}</span>
              <span class="muted">{{ formatDateTime(job.failedAt, locale) }} · {{ t('admin.queue.attempts', { n: job.attempts, max: job.maxAttempts }) }}</span>
              <span class="error-text">{{ job.lastError }}</span>
            </li>
          </ul>
        </template>
      </section>

      <section
        class="card"
        aria-labelledby="admin-queue-webhooks"
      >
        <div class="head">
          <h2
            id="admin-queue-webhooks"
            class="section-title"
          >{{ t('admin.queue.webhooks') }}</h2>
          <div
            class="filters"
            role="radiogroup"
            :aria-label="t('admin.queue.webhooksFilter')"
          >
            <button
              v-for="option in WEBHOOK_FILTERS"
              :key="option"
              type="button"
              role="radio"
              class="filter"
              :class="{ active: filter === option }"
              :aria-checked="filter === option"
              @click="setFilter(option)"
            >{{ t(`admin.queue.filters.${option}`) }}</button>
          </div>
        </div>
        <p class="hint">{{ t('admin.queue.webhooksHint') }}</p>
        <div class="table-wrap">
          <table :aria-busy="webhooksLoading ? 'true' : 'false'">
            <thead>
              <tr>
                <th scope="col">{{ t('admin.queue.cols.received') }}</th>
                <th scope="col">{{ t('admin.queue.cols.topic') }}</th>
                <th
                  scope="col"
                  class="num"
                >{{ t('admin.queue.cols.attempts') }}</th>
                <th scope="col">{{ t('admin.queue.cols.error') }}</th>
                <th scope="col"><span class="sr-only">{{ t('admin.queue.reprocess') }}</span></th>
              </tr>
            </thead>
            <tbody v-if="webhooks.length">
              <tr
                v-for="hook in webhooks"
                :key="hook.id"
              >
                <td class="when">{{ formatDateTime(hook.receivedAt, locale) }}</td>
                <td><code>{{ hook.topic }}</code><span class="small block">{{ hook.resourceId }}</span></td>
                <td class="num">{{ hook.attempts }}</td>
                <td>
                  <span
                    v-if="hook.error"
                    class="error-text"
                  >{{ hook.error }}</span>
                  <span
                    v-else-if="hook.processedAt"
                    class="muted"
                  >{{ t('admin.queue.processed') }}</span>
                  <span
                    v-else
                    class="muted"
                  >{{ t('admin.queue.waiting') }}</span>
                </td>
                <td class="num">
                  <AppButton
                    :label="t('admin.queue.reprocess')"
                    icon="pi pi-refresh"
                    class="btn-outlined btn-sm btn-secondary"
                    :loading="busyId === hook.id"
                    @click="reprocess(hook)"
                  />
                </td>
              </tr>
            </tbody>
          </table>
          <p
            v-if="webhooksLoading"
            class="empty-note"
            role="status"
          >{{ t('common.loading') }}</p>
          <p
            v-else-if="webhooks.length === 0"
            class="empty-note"
          >{{ t(`admin.queue.empty.${filter}`) }}</p>
        </div>
      </section>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import AppButton from '../ui/AppButton.vue'
import AppSkeleton from '../ui/AppSkeleton.vue'
import EmptyState from '../ui/EmptyState.vue'
import api from '../../services/api.js'
import { useToast } from '../../services/toast.js'
import { LockedError, useAdminCall, formatDateTime } from './adminCall.js'

/**
 * Aba Fila: jobs por tipo e falhas recentes, o limite de envio da caixa de
 * e-mail e as notificações do Mercado Pago (reprocessar as que falharam).
 */
const { t, locale } = useI18n()
const call = useAdminCall()
const toast = useToast()

const WEBHOOK_FILTERS = ['error', 'pending', 'all']
const data = ref(null)
const loading = ref(true)
const failed = ref(false)
const webhooks = ref([])
const filter = ref('error')
const webhooksLoading = ref(true)
const busyId = ref(null)

const emailPercent = computed(() => {
  const email = data.value?.email
  return email?.daily ? Math.min(100, Math.round((email.last24h / email.daily) * 100)) : 0
})

async function loadJobs() {
  loading.value = true
  failed.value = false
  try {
    data.value = await call(() => api.adminJobs())
  } catch (error) {
    if (!(error instanceof LockedError)) failed.value = true
  } finally {
    loading.value = false
  }
}

async function loadWebhooks() {
  webhooksLoading.value = true
  try {
    webhooks.value = (await call(() => api.adminWebhooks({ filter: filter.value, limit: 50 }))).webhooks
  } catch (error) {
    if (!(error instanceof LockedError)) toast.add({ severity: 'error', detail: error.message })
  } finally {
    webhooksLoading.value = false
  }
}

function setFilter(value) {
  filter.value = value
  loadWebhooks()
}

async function reprocess(hook) {
  busyId.value = hook.id
  try {
    await call(() => api.adminReprocessWebhook(hook.id))
    toast.add({ severity: 'success', detail: t('admin.queue.requeued') })
    loadWebhooks()
    loadJobs()
  } catch (error) {
    if (!(error instanceof LockedError)) toast.add({ severity: 'error', detail: error.message })
  } finally {
    busyId.value = null
  }
}

onMounted(() => {
  loadJobs()
  loadWebhooks()
})
</script>

<style scoped>
.queue {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.card {
  background: var(--bg-panel);
  border: 1px solid var(--border-color);
  border-radius: var(--card-radius);
  padding: var(--card-pad);
  min-width: 0;
}

h2 {
  margin: 0;
}

.sub {
  margin: var(--space-5) 0 var(--space-2);
}

.head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}

.hint {
  margin: var(--space-1) 0 var(--space-4);
  color: var(--text-secondary);
  font-size: var(--fs-sm);
}

.meter {
  height: 10px;
  border-radius: var(--radius-pill);
  background: var(--bg-input);
  overflow: hidden;
}

.meter span {
  display: block;
  height: 100%;
  background: var(--main-color);
}

.meter-label {
  margin: var(--space-2) 0 0;
  font-size: var(--fs-sm);
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}

.table-wrap {
  max-width: 100%;
  overflow-x: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--fs-sm);
}

th,
td {
  text-align: left;
  padding: var(--space-2);
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
  white-space: nowrap;
}

.warn {
  color: var(--orange);
  font-weight: 600;
}

.when {
  white-space: nowrap;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}

.muted,
.small {
  color: var(--text-secondary);
}

.small {
  font-size: var(--fs-xs);
}

.block {
  display: block;
}

.strong {
  font-weight: 600;
  color: var(--text-primary);
}

.error-text {
  color: var(--red);
  font-size: var(--fs-xs);
  overflow-wrap: anywhere;
}

.failures {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  font-size: var(--fs-sm);
}

.failures li {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.empty-note {
  margin: 0;
  padding: var(--space-4) var(--space-2);
  color: var(--text-secondary);
  font-size: var(--fs-sm);
}

.filters {
  display: inline-flex;
  background: var(--bg-panel);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-pill);
  padding: 0.2rem;
  gap: 0.2rem;
}

.filter {
  border: none;
  background: none;
  font: inherit;
  font-size: var(--fs-sm);
  color: var(--text-secondary);
  padding: var(--space-1) var(--space-3);
  border-radius: var(--radius-pill);
  cursor: pointer;
}

.filter.active {
  background: rgba(var(--main-color-rgb), 0.16);
  color: var(--text-primary);
  font-weight: 600;
}

.filter:focus-visible {
  outline: var(--focus-ring);
  outline-offset: 1px;
}
</style>
