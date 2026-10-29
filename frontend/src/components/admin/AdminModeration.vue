<template>
  <div class="moderation">
    <div
      class="filters"
      role="radiogroup"
      :aria-label="t('admin.moderation.filter')"
    >
      <button
        v-for="option in filters"
        :key="option.value"
        type="button"
        role="radio"
        class="filter"
        :class="{ active: status === option.value }"
        :aria-checked="status === option.value"
        @click="setStatus(option.value)"
      >{{ option.label }}</button>
    </div>

    <details
      v-if="insights"
      class="insights"
    >
      <summary>
        <i
          class="pi pi-chart-bar"
          aria-hidden="true"
        ></i>
        {{ t('admin.moderation.insights.title') }}
        <span class="muted">{{ t('admin.moderation.insights.summary', { serial: insights.serialReporters.length, fresh: insights.newAccountsReported.length }) }}</span>
      </summary>
      <div class="insight-grid">
        <section
          v-for="group in insightGroups"
          :key="group.key"
          :aria-labelledby="`ins-${group.key}`"
        >
          <h2 :id="`ins-${group.key}`">{{ t(`admin.moderation.insights.${group.key}`) }}</h2>
          <p class="hint">{{ t(`admin.moderation.insights.${group.key}Hint`) }}</p>
          <p
            v-if="!group.rows.length"
            class="muted"
          >{{ t('admin.moderation.insights.none') }}</p>
          <ul v-else>
            <li
              v-for="row in group.rows"
              :key="row.id"
            >
              <button
                type="button"
                class="person"
                @click="emit('open-user', row.id)"
              >@{{ row.username }}</button>
              <span
                v-if="!row.active"
                class="state-tag hidden"
              >{{ t('admin.accounts.suspendedTag') }}</span>
              <span class="muted">{{ group.describe(row) }}</span>
            </li>
          </ul>
        </section>
      </div>
    </details>

    <div class="layout">
      <section
        class="queue"
        :aria-label="t('admin.moderation.queue')"
        :aria-busy="loading ? 'true' : 'false'"
      >
        <template v-if="loading">
          <AppSkeleton
            v-for="n in 4"
            :key="n"
            height="96px"
          />
        </template>
        <EmptyState
          v-else-if="failed"
          variant="error"
          compact
          :level="3"
          :title="t('common.loadErrorTitle')"
          @action="loadQueue"
        />
        <p
          v-else-if="items.length === 0"
          class="empty"
        >
          <i
            class="pi pi-check-circle"
            aria-hidden="true"
          ></i>
          {{ t(`admin.moderation.empty.${status}`) }}
        </p>
        <ul
          v-else
          class="queue-list"
        >
          <li
            v-for="item in items"
            :key="item.id"
          >
            <button
              type="button"
              class="queue-item"
              :class="{ selected: selectedId === item.id }"
              :aria-current="selectedId === item.id ? 'true' : undefined"
              @click="select(item.id)"
            >
              <span class="queue-head">
                <span class="queue-book">{{ item.book.title }}</span>
                <span
                  class="state-tag"
                  :class="item.hidden ? 'hidden' : 'visible'"
                >{{ item.hidden ? t('admin.moderation.hidden') : t('admin.moderation.visible') }}</span>
              </span>
              <span class="queue-excerpt">{{ item.excerpt }}</span>
              <span class="queue-meta">
                <span>@{{ item.author.username }}<template v-if="!item.author.active"> · {{ t('admin.accounts.suspendedTag') }}</template></span>
                <span
                  v-if="item.reports.open"
                  class="count open"
                >{{ t('admin.moderation.openCount', { n: item.reports.open }, item.reports.open) }}</span>
                <span
                  v-else
                  class="count"
                >{{ t('admin.moderation.totalCount', { n: item.reports.total }, item.reports.total) }}</span>
                <span>{{ item.reports.reasons.map(reason => t(`review.reasons.${reason}`)).join(', ') }}</span>
              </span>
            </button>
          </li>
        </ul>
      </section>

      <section
        class="detail"
        :aria-label="t('admin.moderation.detail')"
        aria-live="polite"
      >
        <p
          v-if="!selectedId"
          class="empty"
        >{{ t('admin.moderation.pick') }}</p>
        <AppSkeleton
          v-else-if="detailLoading && !detail"
          height="320px"
        />
        <template v-else-if="detail">
          <div class="detail-head">
            <p
              class="state"
              :class="detail.review.hidden ? 'hidden' : 'visible'"
            >
              <i
                :class="detail.review.hidden ? 'pi pi-eye-slash' : 'pi pi-eye'"
                aria-hidden="true"
              ></i>
              {{ detail.review.hidden
                ? t(detail.review.hiddenReason === 'reports' ? 'moderation.hiddenAuto' : 'moderation.hiddenManual')
                : t('moderation.visible') }}
            </p>
            <AppButton
              :label="t('admin.moderation.viewAuthor', { name: detail.author.username })"
              icon="pi pi-user"
              class="btn-text btn-sm"
              @click="emit('open-user', detail.author.id)"
            />
          </div>
          <p
            v-if="!detail.author.active"
            class="author-suspended"
          >{{ t('admin.moderation.authorSuspended') }}</p>
          <p
            v-if="detail.review.hasSpoiler"
            class="flag"
          >{{ t('moderation.markedSpoiler') }}</p>

          <ReviewCard
            :review="detail.review"
            show-book
            show-author
            plain
          />

          <div class="actions">
            <AppButton
              v-if="!detail.review.hidden"
              :label="t('moderation.hide')"
              icon="pi pi-eye-slash"
              class="btn-danger"
              :loading="busy === 'hide'"
              :disabled="Boolean(busy)"
              @click="act(true)"
            />
            <AppButton
              :label="detail.review.hidden ? t('moderation.restore') : t('moderation.keep')"
              icon="pi pi-check"
              :class="detail.review.hidden ? '' : 'btn-outlined btn-secondary'"
              :loading="busy === 'show'"
              :disabled="Boolean(busy)"
              @click="act(false)"
            />
          </div>
          <p class="hint">{{ t('moderation.keepHint') }}</p>

          <h2 class="reports-title">{{ t('moderation.reportsCount', { n: detail.reports.length }, detail.reports.length) }}</h2>
          <ul class="reports">
            <li
              v-for="(report, index) in detail.reports"
              :key="index"
              :class="{ old: isOld(report) }"
            >
              <span class="reason">{{ t(`review.reasons.${report.reason}`) }}</span>
              <span class="by">@{{ report.reporter }} · {{ formatDateTime(report.createdAt, locale) }}<template v-if="isOld(report)"> · {{ t('admin.moderation.reviewedBefore') }}</template></span>
              <p
                v-if="report.note"
                class="note"
              >{{ report.note }}</p>
            </li>
          </ul>
        </template>
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
import ReviewCard from '../review/ReviewCard.vue'
import api from '../../services/api.js'
import { useToast } from '../../services/toast.js'
import { LockedError, useAdminCall, formatDateTime } from './adminCall.js'

const emit = defineEmits(['open-user', 'changed'])
const { t, locale } = useI18n()
const toast = useToast()
const call = useAdminCall()

const status = ref('open')
const items = ref([])
const loading = ref(true)
const failed = ref(false)
const selectedId = ref(null)
const detail = ref(null)
const detailLoading = ref(false)
const busy = ref('')

const insights = ref(null)

const insightGroups = computed(() => [
  { key: 'serialReporters', rows: insights.value.serialReporters,
    describe: row => t('admin.moderation.insights.serialDetail', { n: row.reports, upheld: row.upheld, rejected: row.rejected, week: row.last7 }) },
  { key: 'newAccountsReported', rows: insights.value.newAccountsReported,
    describe: row => t('admin.moderation.insights.freshDetail', { n: row.reports, reviews: row.reviewsReported, date: formatDateTime(row.createdAt, locale.value) }) },
  { key: 'mostReported', rows: insights.value.mostReported,
    describe: row => t('admin.moderation.insights.mostDetail', { n: row.reports, reviews: row.reviewsReported, hidden: row.hidden }) }
])

async function loadInsights() {
  try {
    insights.value = await call(() => api.adminModerationInsights())
  } catch {
    // os sinais são um extra: a fila funciona sem eles
  }
}

const filters = computed(() => [
  { value: 'open', label: t('admin.moderation.filters.open') },
  { value: 'hidden', label: t('admin.moderation.filters.hidden') },
  { value: 'all', label: t('admin.moderation.filters.all') }
])

// Denúncia anterior à última revisão (já foi considerada)
function isOld(report) {
  const reviewedAt = detail.value?.review.reviewedAt
  return Boolean(reviewedAt) && new Date(report.createdAt) <= new Date(reviewedAt)
}

function notify(error) {
  if (error instanceof LockedError) return
  toast.add({ severity: 'error', detail: error.message })
}

async function loadQueue() {
  loading.value = true
  failed.value = false
  try {
    items.value = await call(() => api.adminReports(status.value))
    if (!items.value.some(item => item.id === selectedId.value)) {
      if (items.value[0]) select(items.value[0].id)
      else { selectedId.value = null; detail.value = null }
    }
  } catch (error) {
    if (!(error instanceof LockedError)) failed.value = true
  } finally {
    loading.value = false
  }
}

function setStatus(value) {
  if (status.value === value) return
  status.value = value
  loadQueue()
}

async function select(id) {
  if (selectedId.value !== id) detail.value = null
  selectedId.value = id
  detailLoading.value = true
  try {
    const data = await call(() => api.adminReview(id))
    if (selectedId.value === id) detail.value = data
  } catch (error) {
    notify(error)
  } finally {
    detailLoading.value = false
  }
}

async function act(hide) {
  busy.value = hide ? 'hide' : 'show'
  try {
    detail.value = await call(() => api.adminModerateReview(selectedId.value, hide))
    toast.add({ severity: 'success', summary: hide ? t('moderation.hiddenDone') : t('moderation.keptDone'), life: 3000 })
    emit('changed')
    loadInsights()
    // Mantém a resenha aberta; a fila reflete o novo estado
    const keep = selectedId.value
    await loadQueue()
    if (!items.value.some(item => item.id === keep) && items.value[0]) select(items.value[0].id)
  } catch (error) {
    notify(error)
  } finally {
    busy.value = ''
  }
}

onMounted(() => {
  loadQueue()
  loadInsights()
})
</script>

<style scoped>
.moderation {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.filters {
  display: inline-flex;
  align-self: flex-start;
  background: var(--bg-panel);
  border: 1px solid var(--border-color);
  border-radius: 999px;
  padding: 0.2rem;
  gap: 0.2rem;
}

.filter {
  border: none;
  background: none;
  font: inherit;
  font-size: var(--fs-sm);
  color: var(--text-secondary);
  padding: 0.4rem 0.95rem;
  border-radius: 999px;
  cursor: pointer;
}

.filter.active {
  background: rgba(var(--main-color-rgb), 0.16);
  color: var(--text-primary);
  font-weight: 600;
}

.filter:focus-visible {
  outline: 2px solid var(--main-color);
  outline-offset: 1px;
}

.layout {
  display: grid;
  grid-template-columns: minmax(300px, 400px) minmax(0, 1fr);
  gap: 1.25rem;
  align-items: start;
}

.queue {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  max-height: calc(100dvh - 15rem);
  overflow-y: auto;
  padding-right: 0.25rem;
}

.queue-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.queue-item {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  text-align: left;
  font: inherit;
  color: inherit;
  background: var(--bg-panel);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 0.85rem 1rem;
  cursor: pointer;
}

.queue-item:hover {
  border-color: var(--border-hover);
}

.queue-item.selected {
  border-color: var(--main-color);
  box-shadow: 0 0 0 1px var(--main-color) inset;
}

.queue-item:focus-visible {
  outline: 2px solid var(--main-color);
  outline-offset: 2px;
}

.queue-head {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
  align-items: baseline;
}

.queue-book {
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.queue-excerpt {
  color: var(--text-secondary);
  font-size: var(--fs-sm);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.queue-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem 0.75rem;
  font-size: var(--fs-xs);
  color: var(--text-muted);
}

.count.open {
  color: var(--text-primary);
  font-weight: 600;
}

.count.open::before {
  content: '';
  display: inline-block;
  width: 0.45rem;
  height: 0.45rem;
  margin-right: 0.3rem;
  border-radius: 50%;
  background: var(--orange);
}

.state-tag {
  flex-shrink: 0;
  font-size: var(--fs-xs);
  font-weight: 600;
  border-radius: 999px;
  padding: 0.1rem 0.5rem;
}

.state-tag {
  color: var(--text-primary);
}

.state-tag.visible {
  background: rgba(var(--green-rgb), 0.16);
}

.state-tag.hidden {
  background: rgba(var(--orange-rgb), 0.18);
}

.detail {
  background: var(--bg-panel);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  padding: 1.25rem 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  min-height: 320px;
}

.detail-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.state {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0;
  padding: 0.45rem 0.75rem;
  border-radius: 8px;
  font-size: var(--fs-sm);
  font-weight: 600;
}

.state {
  color: var(--text-primary);
}

.state.visible {
  background: rgba(var(--green-rgb), 0.14);
}

.state.visible .pi {
  color: var(--green);
}

.state.hidden {
  background: rgba(var(--orange-rgb), 0.16);
}

.state.hidden .pi {
  color: var(--orange);
}

.author-suspended,
.flag {
  margin: 0;
  font-size: var(--fs-sm);
  color: var(--text-secondary);
}

.author-suspended {
  color: var(--red);
}

.actions {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.hint {
  margin: 0;
  font-size: var(--fs-xs);
  color: var(--text-muted);
}

.reports-title {
  margin: 0.5rem 0 0;
  font-size: var(--fs-md);
  color: var(--text-primary);
}

.reports {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.reports li {
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 0.6rem 0.8rem;
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem 0.75rem;
  align-items: baseline;
}

.reports li.old {
  border-style: dashed;
}

.reason {
  font-weight: 600;
  color: var(--text-primary);
}

.by {
  font-size: var(--fs-xs);
  color: var(--text-muted);
}

.note {
  flex-basis: 100%;
  margin: 0;
  color: var(--text-secondary);
  font-size: var(--fs-sm);
}

.empty {
  text-align: center;
  color: var(--text-secondary);
  padding: 2rem 1rem;
  margin: 0;
}

.insights {
  background: var(--bg-panel);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 0.75rem 1rem;
}

.insights summary {
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 600;
  color: var(--text-primary);
}

.insights summary:focus-visible {
  outline: 2px solid var(--main-color);
  outline-offset: 2px;
  border-radius: 6px;
}

.insights summary .muted {
  font-weight: 400;
  font-size: var(--fs-sm);
  color: var(--text-secondary);
}

.insight-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 1.25rem;
  margin-top: 1rem;
}

.insight-grid h2 {
  margin: 0;
  font-size: var(--fs-sm);
  color: var(--text-primary);
}

.insight-grid .hint {
  margin: 0.2rem 0 0.6rem;
}

.insight-grid ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  font-size: var(--fs-sm);
}

.insight-grid li {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.3rem 0.5rem;
}

.insight-grid .muted {
  color: var(--text-secondary);
  font-size: var(--fs-xs);
  margin: 0;
}

.person {
  font: inherit;
  font-weight: 600;
  color: var(--text-primary);
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  text-decoration: underline;
  text-decoration-color: var(--border-hover);
  text-underline-offset: 2px;
}

.person:focus-visible {
  outline: 2px solid var(--main-color);
  outline-offset: 2px;
}

@media (max-width: 900px) {
  .layout {
    grid-template-columns: 1fr;
  }

  .queue {
    max-height: none;
  }
}
</style>
