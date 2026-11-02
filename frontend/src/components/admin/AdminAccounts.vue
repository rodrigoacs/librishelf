<template>
  <div class="accounts">
    <div class="toolbar">
      <SearchField
        id="admin-user-search"
        v-model="query"
        class="search"
        size="sm"
        :label="t('admin.accounts.search')"
        :placeholder="t('admin.accounts.searchPh')"
        maxlength="100"
      />
      <div
        class="filters"
        role="radiogroup"
        :aria-label="t('admin.accounts.filter')"
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
      <span
        class="total"
        aria-live="polite"
      >{{ t('admin.accounts.total', { n: total }, total) }}</span>
    </div>

    <!-- Tabela mais larga que a tela: aviso e degradê na borda (antes nada
         indicava que havia mais colunas à direita) -->
    <p
      v-if="tableEdges.scrollable.value"
      class="scroll-hint"
    >
      <i
        class="pi pi-arrows-h"
        aria-hidden="true"
      ></i>
      {{ t('admin.accounts.scrollHint') }}
    </p>
    <div
      ref="tableWrap"
      class="table-wrap"
      :class="{ 'more-end': tableEdges.moreEnd.value }"
    >
      <table :aria-busy="loading ? 'true' : 'false'">
        <thead>
          <tr>
            <th scope="col">{{ t('admin.accounts.cols.user') }}</th>
            <th scope="col">{{ t('admin.accounts.cols.created') }}</th>
            <th scope="col">{{ t('admin.accounts.cols.lastLogin') }}</th>
            <th
              scope="col"
              class="num"
            >{{ t('admin.accounts.cols.books') }}</th>
            <th
              scope="col"
              class="num"
            >{{ t('admin.accounts.cols.reviews') }}</th>
            <th
              scope="col"
              class="num"
            >{{ t('admin.accounts.cols.reports') }}</th>
            <th scope="col"><span class="sr-only">{{ t('admin.accounts.cols.actions') }}</span></th>
          </tr>
        </thead>
        <tbody v-if="!loading && users.length">
          <tr
            v-for="user in users"
            :key="user.id"
            :class="{ suspended: !user.active }"
          >
            <td>
              <div class="user-cell">
                <button
                  type="button"
                  class="username"
                  :aria-label="t('admin.accounts.openWho', { name: user.username })"
                  @click="emit('open-user', user.id)"
                >{{ user.username }}</button>
                <span
                  v-if="user.isAdmin"
                  class="tag admin"
                >{{ t('admin.accounts.adminTag') }}</span>
                <span
                  v-if="!user.active"
                  class="tag suspended"
                >{{ t('admin.accounts.suspendedTag') }}</span>
                <span
                  v-if="!user.emailVerified"
                  class="tag pending"
                >{{ t('admin.accounts.unverifiedTag') }}</span>
              </div>
              <p class="email">{{ user.email }}</p>
              <p
                v-if="!user.active && user.suspendedReason"
                class="reason"
              >{{ t('admin.accounts.suspendedOn', { date: formatDate(user.suspendedAt, locale) }) }} — {{ user.suspendedReason }}</p>
            </td>
            <td class="date">{{ formatShortDate(user.createdAt, locale) }}</td>
            <td class="date">{{ user.lastLoginAt ? formatDateTime(user.lastLoginAt, locale) : t('admin.accounts.never') }}</td>
            <td class="num">{{ formatNumber(user.books, locale) }}</td>
            <td class="num">{{ formatNumber(user.reviews, locale) }}</td>
            <td
              class="num"
              :class="{ warn: user.reportsReceived > 0 }"
            >{{ formatNumber(user.reportsReceived, locale) }}</td>
            <td class="actions">
              <AppButton
                :label="t('admin.accounts.open')"
                :aria-label="t('admin.accounts.openWho', { name: user.username })"
                icon="pi pi-angle-right"
                class="btn-text btn-sm btn-secondary"
                @click="emit('open-user', user.id)"
              />
            </td>
          </tr>
        </tbody>
      </table>
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
        v-else-if="users.length === 0"
        class="empty-note"
      >{{ t('common.noResults') }}</p>
    </div>

    <nav
      v-if="pages > 1"
      class="pager"
      :aria-label="t('admin.pager')"
    >
      <AppButton
        icon="pi pi-chevron-left"
        :aria-label="t('admin.prev')"
        class="btn-text btn-sm btn-secondary"
        :disabled="page <= 1 || loading"
        @click="goTo(page - 1)"
      />
      <span>{{ t('admin.pageOf', { page, pages }) }}</span>
      <AppButton
        icon="pi pi-chevron-right"
        :aria-label="t('admin.next')"
        class="btn-text btn-sm btn-secondary"
        :disabled="page >= pages || loading"
        @click="goTo(page + 1)"
      />
    </nav>

  </div>
</template>

<script setup>
import { useScrollEdges } from '../../composables/useScrollEdges.js'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import AppButton from '../ui/AppButton.vue'
import EmptyState from '../ui/EmptyState.vue'
import api from '../../services/api.js'
import { LockedError, useAdminCall, formatShortDate, formatDateTime, formatNumber, formatDate } from './adminCall.js'
import SearchField from '../ui/SearchField.vue'

const props = defineProps({
  initialStatus: { type: String, default: 'all' },
  // Muda quando uma conta é alterada na gaveta: recarrega a lista
  version: { type: Number, default: 0 }
})
const emit = defineEmits(['open-user'])

const { t, locale } = useI18n()

const tableWrap = ref(null)
const tableEdges = useScrollEdges(tableWrap)
const call = useAdminCall()
const LIMIT = 25

const query = ref('')
const status = ref(props.initialStatus)
const page = ref(1)
const total = ref(0)
const users = ref([])
const loading = ref(true)
const failed = ref(false)

const pages = computed(() => Math.max(1, Math.ceil(total.value / LIMIT)))
const filters = computed(() => [
  { value: 'all', label: t('admin.accounts.filters.all') },
  { value: 'unverified', label: t('admin.accounts.filters.unverified') },
  { value: 'suspended', label: t('admin.accounts.filters.suspended') }
])

let requestId = 0
async function load() {
  const id = ++requestId
  loading.value = true
  failed.value = false
  try {
    const data = await call(() => api.adminUsers({ q: query.value.trim(), status: status.value, page: page.value, limit: LIMIT }))
    if (id !== requestId) return
    users.value = data.users
    total.value = data.total
  } catch (error) {
    if (id === requestId && !(error instanceof LockedError)) failed.value = true
  } finally {
    if (id === requestId) loading.value = false
  }
}

let debounce = null
watch(query, () => {
  clearTimeout(debounce)
  debounce = setTimeout(() => { page.value = 1; load() }, 300)
})
watch(() => props.initialStatus, value => { status.value = value; page.value = 1; load() })
watch(() => props.version, load)
onBeforeUnmount(() => clearTimeout(debounce))

function setStatus(value) {
  if (status.value === value) return
  status.value = value
  page.value = 1
  load()
}

function goTo(target) {
  page.value = target
  load()
}

onMounted(load)
</script>

<style scoped>
.accounts {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.toolbar {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  flex-wrap: wrap;
}

.search {
  position: relative;
  flex: 1 1 280px;
  max-width: 420px;
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
  padding: var(--space-2) var(--space-4);
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

.total {
  margin-left: auto;
  color: var(--text-secondary);
  font-size: var(--fs-sm);
}

.table-wrap {
  position: relative;
  max-width: 100%;
  background: var(--bg-panel);
  border: 1px solid var(--border-color);
  border-radius: var(--card-radius);
  overflow-x: auto;
}

.table-wrap.more-end {
  mask-image: linear-gradient(to right, #000 calc(100% - 2.5rem), rgba(0, 0, 0, 0.25));
}

.scroll-hint {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin: 0 0 var(--space-2);
  font-size: var(--fs-xs);
  color: var(--text-secondary);
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--fs-sm);
}

th,
td {
  text-align: left;
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--border-color);
  vertical-align: top;
  color: var(--text-primary);
}

th {
  color: var(--text-secondary);
  font-weight: 600;
  font-size: var(--fs-xs);
  text-transform: uppercase;
  letter-spacing: 0.03em;
  white-space: nowrap;
}

tbody tr:last-child td {
  border-bottom: none;
}

tbody tr:hover {
  background: var(--bg-hover);
}

tr.suspended td {
  background: rgba(var(--red-rgb), 0.05);
}

.num {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

td.warn {
  color: var(--orange);
  font-weight: 600;
}

.email {
  margin: 0.15rem 0 0;
  color: var(--text-secondary);
  overflow-wrap: anywhere;
}

.date {
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.user-cell {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-1);
}

.username {
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

.username:hover {
  text-decoration-color: currentColor;
}

.username:focus-visible {
  outline: var(--focus-ring);
  outline-offset: var(--focus-offset);
  border-radius: var(--radius-sm);
}

tbody tr {
  cursor: default;
}

.tag {
  font-size: var(--fs-xs);
  font-weight: 600;
  border-radius: var(--radius-pill);
  padding: 0.05rem var(--space-2);
}

.tag.admin {
  background: rgba(var(--main-color-rgb), 0.18);
  color: var(--text-primary);
}

.tag.suspended {
  background: rgba(var(--red-rgb), 0.18);
  color: var(--text-primary);
}

.tag.pending {
  background: var(--bg-input);
  color: var(--text-secondary);
}

.reason {
  margin: var(--space-1) 0 0;
  color: var(--text-secondary);
  font-size: var(--fs-xs);
  max-width: 32ch;
}

.actions {
  text-align: right;
  white-space: nowrap;
}

.pager {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: var(--space-3);
  color: var(--text-secondary);
  font-size: var(--fs-sm);
}

</style>
