<template>
  <div class="errors">
    <p class="intro">{{ t('admin.errors.intro') }}</p>

    <div class="toolbar">
      <AdminFilters
        :model-value="status"
        :options="STATUSES.map(value => ({ value, label: t(`admin.errors.status.${value}`) }))"
        :label="t('admin.errors.statusLabel')"
        @update:model-value="value => setFilter({ status: value })"
      />
      <AdminFilters
        :model-value="source"
        :options="SOURCES.map(value => ({ value, label: t(`admin.errors.sources.${value}`) }))"
        :label="t('admin.errors.sourceLabel')"
        @update:model-value="value => setFilter({ source: value })"
      />
    </div>

    <p
      v-if="loading"
      class="empty-note"
      role="status"
    >{{ t('common.loading') }}</p>
    <EmptyState
      v-else-if="failed"
      variant="error"
      compact
      :level="3"
      :title="t('common.loadErrorTitle')"
      @action="load"
    />
    <p
      v-else-if="errors.length === 0"
      class="empty-note"
    >{{ t(`admin.errors.empty.${status}`) }}</p>

    <ul
      v-else
      class="list"
    >
      <li
        v-for="item in errors"
        :key="item.id"
        class="item"
        :class="{ resolved: item.resolvedAt }"
      >
        <div class="head">
          <span
            class="source"
            :class="item.source"
          >{{ t(`admin.errors.sources.${item.source}`) }}</span>
          <span class="count">{{ t('admin.errors.occurrences', { n: item.occurrences }, item.occurrences) }}</span>
        </div>
        <p class="message">{{ item.message }}</p>
        <p
          v-if="item.location"
          class="location"
        >{{ item.location }}</p>
        <p class="when">
          {{ t('admin.errors.lastSeen', { date: formatDateTime(item.lastSeenAt, locale) }) }}
          <template v-if="item.occurrences > 1"> · {{ t('admin.errors.firstSeen', { date: formatDateTime(item.firstSeenAt, locale) }) }}</template>
          <template v-if="item.resolvedAt"> · {{ t('admin.errors.resolvedAt', { date: formatDateTime(item.resolvedAt, locale) }) }}</template>
        </p>
        <details v-if="hasDetail(item)">
          <summary>{{ t('admin.errors.details') }}</summary>
          <dl>
            <template
              v-for="(value, key) in item.detail"
              :key="key"
            >
              <dt>{{ te(`admin.errors.fields.${key}`) ? t(`admin.errors.fields.${key}`) : key }}</dt>
              <dd :class="{ mono: key === 'stack' }">{{ value }}</dd>
            </template>
          </dl>
        </details>
        <AppButton
          v-if="!item.resolvedAt"
          :label="t('admin.errors.resolve')"
          icon="pi pi-check"
          class="btn-text btn-sm resolve"
          :loading="busyId === item.id"
          @click="resolve(item)"
        />
      </li>
    </ul>

    <AdminPager
      :page="page"
      :pages="pages"
      :busy="loading"
      @go="goTo"
    />
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import AppButton from '../ui/AppButton.vue'
import EmptyState from '../ui/EmptyState.vue'
import AdminPager from './AdminPager.vue'
import AdminFilters from './AdminFilters.vue'
import api from '../../services/api.js'
import { useToast } from '../../services/toast.js'
import { LockedError, useAdminCall, formatDateTime } from './adminCall.js'

/**
 * Erros (pacote 37): navegador, API, jobs, webhooks e CSP, um por
 * assinatura, com quantas vezes aconteceu. Resolver tira da lista de abertos
 * e dos resumos por e-mail até o erro voltar.
 */
const emit = defineEmits(['changed'])
const { t, te, locale } = useI18n()
const call = useAdminCall()
const toast = useToast()

const LIMIT = 30
const STATUSES = ['open', 'resolved', 'all']
const SOURCES = ['all', 'client', 'server', 'worker', 'webhook', 'csp']

const errors = ref([])
const total = ref(0)
const page = ref(1)
const status = ref('open')
const source = ref('all')
const loading = ref(true)
const failed = ref(false)
const busyId = ref(null)

const pages = computed(() => Math.max(1, Math.ceil(total.value / LIMIT)))
const hasDetail = item => item.detail && Object.keys(item.detail).length > 0

async function load() {
  loading.value = true
  failed.value = false
  try {
    const data = await call(() => api.adminErrors({
      status: status.value, source: source.value === 'all' ? undefined : source.value, page: page.value, limit: LIMIT
    }))
    errors.value = data.errors
    total.value = data.total
    emit('changed', data.open)
  } catch (error) {
    if (!(error instanceof LockedError)) failed.value = true
  } finally {
    loading.value = false
  }
}

function setFilter(change) {
  if (change.status) status.value = change.status
  if (change.source) source.value = change.source
  page.value = 1
  load()
}

function goTo(target) {
  page.value = target
  load()
}

async function resolve(item) {
  busyId.value = item.id
  try {
    await call(() => api.adminResolveError(item.id))
    toast.add({ severity: 'success', detail: t('admin.errors.resolved') })
    await load()
  } catch (error) {
    if (!(error instanceof LockedError)) toast.add({ severity: 'error', detail: error.message })
  } finally {
    busyId.value = null
  }
}

onMounted(load)
</script>

<style scoped>
.errors {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.intro {
  margin: 0;
  color: var(--text-secondary);
  font-size: var(--fs-sm);
}

.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.empty-note {
  margin: 0;
  color: var(--text-muted);
  font-size: var(--fs-sm);
}

.list {
  list-style: none;
  margin: 0;
  padding: 0;
  background: var(--bg-panel);
  border: 1px solid var(--border-color);
  border-radius: var(--card-radius);
}

.item {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding: var(--space-3) var(--space-4);
  min-width: 0;
}

.item + .item {
  border-top: 1px solid var(--border-color);
}

.item.resolved {
  opacity: 0.7;
}

.head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-2);
}

.source {
  padding: 0.1rem var(--space-2);
  border-radius: var(--radius-pill);
  background: rgba(var(--main-color-rgb), 0.12);
  color: var(--text-primary);
  font-size: var(--fs-xs);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.source.server,
.source.worker,
.source.webhook {
  background: rgba(var(--red-rgb), 0.12);
}

.count {
  color: var(--text-secondary);
  font-size: var(--fs-xs);
  font-variant-numeric: tabular-nums;
}

.message {
  margin: 0;
  color: var(--text-primary);
  font-weight: 600;
  overflow-wrap: anywhere;
}

.location,
.mono {
  font-family: var(--font-mono);
}

.location {
  margin: 0;
  color: var(--text-secondary);
  font-size: var(--fs-sm);
  overflow-wrap: anywhere;
}

.when {
  margin: 0;
  color: var(--text-muted);
  font-size: var(--fs-xs);
}

details {
  font-size: var(--fs-xs);
  color: var(--text-secondary);
}

summary {
  cursor: pointer;
  width: fit-content;
}

dl {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: var(--space-1) var(--space-3);
  margin: var(--space-2) 0 0;
}

dt {
  color: var(--text-muted);
}

dd {
  margin: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.resolve {
  align-self: flex-start;
}
</style>
