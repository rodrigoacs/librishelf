<template>
  <div class="accounts">
    <div class="toolbar">
      <div
        class="search"
        role="search"
      >
        <i
          class="pi pi-search"
          aria-hidden="true"
        ></i>
        <label
          class="sr-only"
          for="admin-user-search"
        >{{ t('admin.accounts.search') }}</label>
        <input
          id="admin-user-search"
          v-model="query"
          type="search"
          maxlength="100"
          autocomplete="off"
          :placeholder="t('admin.accounts.searchPh')"
        />
      </div>
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

    <div class="table-wrap">
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
                <span class="username">
                  <a
                    v-if="user.isPublic && user.active"
                    :href="`/u/${encodeURIComponent(user.username)}`"
                    target="_blank"
                    rel="noopener"
                  >{{ user.username }}</a>
                  <template v-else>{{ user.username }}</template>
                </span>
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
              <template v-if="!user.isAdmin">
                <AppButton
                  v-if="user.active"
                  :label="t('admin.accounts.suspend')"
                  :aria-label="t('admin.accounts.suspendWho', { name: user.username })"
                  icon="pi pi-ban"
                  class="btn-text btn-sm btn-danger"
                  @click="openDialog('suspend', user)"
                />
                <AppButton
                  v-else
                  :label="t('admin.accounts.reactivate')"
                  :aria-label="t('admin.accounts.reactivateWho', { name: user.username })"
                  icon="pi pi-replay"
                  class="btn-text btn-sm"
                  @click="openDialog('reactivate', user)"
                />
              </template>
            </td>
          </tr>
        </tbody>
      </table>
      <p
        v-if="loading"
        class="empty"
        role="status"
      >{{ t('common.loading') }}</p>
      <p
        v-else-if="failed"
        class="empty"
      >{{ t('common.loadError') }}</p>
      <p
        v-else-if="users.length === 0"
        class="empty"
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

    <AppDialog
      v-model:visible="dialog.visible"
      size="sm"
      :header="dialog.mode === 'suspend' ? t('admin.accounts.suspendTitle', { name: dialog.user?.username }) : t('admin.accounts.reactivateTitle', { name: dialog.user?.username })"
      :closable="!dialog.busy"
    >
      <form
        class="stack"
        novalidate
        @submit.prevent="confirmDialog"
      >
        <p class="desc">{{ dialog.mode === 'suspend' ? t('admin.accounts.suspendDesc') : t('admin.accounts.reactivateDesc') }}</p>
        <TextField
          v-if="dialog.mode === 'suspend'"
          id="admin-suspend-reason"
          ref="reasonField"
          v-model="dialog.reason"
          :label="t('admin.accounts.reason')"
          :hint="t('admin.accounts.reasonHint')"
          :error="dialog.reasonError"
          maxlength="500"
          multiline
          rows="3"
          required
        />
        <PasswordField
          id="admin-confirm-password"
          ref="passwordField"
          v-model="dialog.password"
          :label="t('admin.accounts.password')"
          autocomplete="current-password"
          :error="dialog.passwordError"
          required
        />
        <div class="dialog-actions">
          <AppButton
            :label="t('common.cancel')"
            class="btn-text btn-secondary"
            :disabled="dialog.busy"
            @click="dialog.visible = false"
          />
          <AppButton
            type="submit"
            :label="dialog.mode === 'suspend' ? t('admin.accounts.suspend') : t('admin.accounts.reactivate')"
            :icon="dialog.mode === 'suspend' ? 'pi pi-ban' : 'pi pi-replay'"
            :class="dialog.mode === 'suspend' ? 'btn-danger' : ''"
            :loading="dialog.busy"
          />
        </div>
      </form>
    </AppDialog>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import AppButton from '../ui/AppButton.vue'
import AppDialog from '../ui/AppDialog.vue'
import TextField from '../form/TextField.vue'
import PasswordField from '../form/PasswordField.vue'
import api from '../../services/api.js'
import { useToast } from '../../services/toast.js'
import { LockedError, useAdminCall, formatDate, formatShortDate, formatDateTime, formatNumber } from './adminCall.js'

const props = defineProps({
  initialQuery: { type: String, default: '' }
})

const { t, locale } = useI18n()
const toast = useToast()
const call = useAdminCall()
const LIMIT = 25

const query = ref(props.initialQuery)
const status = ref('all')
const page = ref(1)
const total = ref(0)
const users = ref([])
const loading = ref(true)
const failed = ref(false)
const reasonField = ref(null)
const passwordField = ref(null)
const dialog = reactive({ visible: false, mode: 'suspend', user: null, reason: '', password: '', reasonError: '', passwordError: '', busy: false })

const pages = computed(() => Math.max(1, Math.ceil(total.value / LIMIT)))
const filters = computed(() => [
  { value: 'all', label: t('admin.accounts.filters.all') },
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
watch(() => props.initialQuery, value => { query.value = value })
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

async function openDialog(mode, user) {
  Object.assign(dialog, { visible: true, mode, user, reason: '', password: '', reasonError: '', passwordError: '', busy: false })
  await nextTick()
  ;(mode === 'suspend' ? reasonField : passwordField).value?.focus()
}

async function confirmDialog() {
  dialog.reasonError = ''
  dialog.passwordError = ''
  const reason = dialog.reason.trim()
  if (dialog.mode === 'suspend' && reason.length < 3) {
    dialog.reasonError = t('admin.accounts.reasonRequired')
    reasonField.value?.focus()
    return
  }
  if (!dialog.password) {
    dialog.passwordError = t('errors.CURRENT_PASSWORD_REQUIRED')
    passwordField.value?.focus()
    return
  }
  dialog.busy = true
  try {
    if (dialog.mode === 'suspend') {
      await call(() => api.adminSuspendUser(dialog.user.id, dialog.password, reason))
    } else {
      await call(() => api.adminReactivateUser(dialog.user.id, dialog.password))
    }
    toast.add({
      severity: 'success',
      summary: t(dialog.mode === 'suspend' ? 'admin.accounts.suspendedDone' : 'admin.accounts.reactivatedDone', { name: dialog.user.username }),
      life: 3000
    })
    dialog.visible = false
    load()
  } catch (error) {
    if (error instanceof LockedError) {
      dialog.visible = false
    } else if (error.code === 'CURRENT_PASSWORD_WRONG' || error.code === 'CURRENT_PASSWORD_REQUIRED') {
      dialog.passwordError = error.message
      dialog.password = ''
      passwordField.value?.focus()
    } else {
      toast.add({ severity: 'error', summary: t('common.error'), detail: error.message })
    }
  } finally {
    dialog.busy = false
  }
}

onMounted(load)
</script>

<style scoped>
.accounts {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
}

.search {
  position: relative;
  flex: 1 1 280px;
  max-width: 420px;
}

.search .pi {
  position: absolute;
  left: 0.9rem;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-muted);
  pointer-events: none;
}

.search input {
  width: 100%;
  box-sizing: border-box;
  min-height: 2.6rem;
  padding: 0 1rem 0 2.5rem;
  border-radius: 999px;
  border: 1px solid var(--border-color);
  background: var(--bg-input);
  color: var(--text-primary);
  font: inherit;
}

.search input:focus-visible {
  outline: 2px solid var(--main-color);
  outline-offset: 1px;
}

.filters {
  display: inline-flex;
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
  border-radius: 16px;
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
  padding: 0.7rem 0.9rem;
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
  gap: 0.35rem;
}

.username {
  font-weight: 600;
}

.username a {
  color: var(--text-primary);
  text-decoration: underline;
  text-decoration-color: var(--border-hover);
  text-underline-offset: 2px;
}

.tag {
  font-size: var(--fs-xs);
  font-weight: 600;
  border-radius: 999px;
  padding: 0.05rem 0.5rem;
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
  margin: 0.3rem 0 0;
  color: var(--text-secondary);
  font-size: var(--fs-xs);
  max-width: 32ch;
}

.actions {
  text-align: right;
  white-space: nowrap;
}

.empty {
  text-align: center;
  color: var(--text-secondary);
  padding: 2rem 1rem;
  margin: 0;
}

.pager {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 0.75rem;
  color: var(--text-secondary);
  font-size: var(--fs-sm);
}

.stack {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.desc {
  margin: 0;
  color: var(--text-secondary);
  font-size: var(--fs-sm);
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 0.5rem;
}
</style>
