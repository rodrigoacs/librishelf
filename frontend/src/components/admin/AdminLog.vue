<template>
  <div class="log">
    <p class="intro">{{ t('admin.log.intro') }}</p>
    <div class="table-wrap">
      <table :aria-busy="loading ? 'true' : 'false'">
        <thead>
          <tr>
            <th scope="col">{{ t('admin.log.cols.when') }}</th>
            <th scope="col">{{ t('admin.log.cols.who') }}</th>
            <th scope="col">{{ t('admin.log.cols.action') }}</th>
            <th scope="col">{{ t('admin.log.cols.target') }}</th>
            <th scope="col">{{ t('admin.log.cols.details') }}</th>
          </tr>
        </thead>
        <tbody v-if="!loading && actions.length">
          <tr
            v-for="item in actions"
            :key="item.id"
          >
            <td class="when">{{ formatDateTime(item.createdAt, locale) }}</td>
            <td>{{ item.admin ? `@${item.admin}` : t('admin.log.deleted') }}</td>
            <td>
              <span
                class="action"
                :class="item.action.replace('.', '-')"
              >
                <i
                  :class="ICONS[item.action]"
                  aria-hidden="true"
                ></i>
                {{ t(`admin.log.actions.${item.action.replace('.', '_')}`) }}
              </span>
            </td>
            <td>
              <template v-if="item.targetUser">@{{ item.targetUser }}</template>
              <template v-else-if="item.action.startsWith('user.')">{{ t('admin.log.deleted') }}</template>
              <template v-if="item.targetReviewId"> · {{ t('admin.log.review', { id: item.targetReviewId }) }}</template>
            </td>
            <td class="details">{{ describe(item) }}</td>
          </tr>
        </tbody>
      </table>
      <p
        v-if="loading"
        class="empty"
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
        v-else-if="actions.length === 0"
        class="empty"
      >{{ t('admin.log.empty') }}</p>
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
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import AppButton from '../ui/AppButton.vue'
import EmptyState from '../ui/EmptyState.vue'
import api from '../../services/api.js'
import { LockedError, useAdminCall, formatDateTime } from './adminCall.js'

const { t, locale } = useI18n()
const call = useAdminCall()
const LIMIT = 30
const ICONS = {
  'admin.unlock': 'pi pi-unlock',
  'review.hide': 'pi pi-eye-slash',
  'review.show': 'pi pi-eye',
  'avatar.remove': 'pi pi-trash',
  'avatar.keep': 'pi pi-image',
  'user.suspend': 'pi pi-ban',
  'user.reactivate': 'pi pi-replay',
  'user.resend_verification': 'pi pi-envelope',
  'email.test': 'pi pi-send'
}

const actions = ref([])
const total = ref(0)
const page = ref(1)
const loading = ref(true)
const failed = ref(false)
const pages = computed(() => Math.max(1, Math.ceil(total.value / LIMIT)))

function describe(item) {
  const details = item.details || {}
  if (details.reason) return details.reason
  if (item.book) return item.book
  return ''
}

async function load() {
  loading.value = true
  failed.value = false
  try {
    const data = await call(() => api.adminActions({ page: page.value, limit: LIMIT }))
    actions.value = data.actions
    total.value = data.total
  } catch (error) {
    if (!(error instanceof LockedError)) failed.value = true
  } finally {
    loading.value = false
  }
}

function goTo(target) {
  page.value = target
  load()
}

onMounted(load)
</script>

<style scoped>
.log {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.intro {
  margin: 0;
  color: var(--text-secondary);
  font-size: var(--fs-sm);
}

.table-wrap {
  max-width: 100%;
  background: var(--bg-panel);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
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
}

tbody tr:last-child td {
  border-bottom: none;
}

.when {
  white-space: nowrap;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}

.action {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-weight: 600;
}

.action.user-suspend,
.action.review-hide {
  color: var(--red);
}

.action.user-reactivate,
.action.review-show {
  color: var(--green);
}

.action.admin-unlock {
  color: var(--text-secondary);
  font-weight: 500;
}

.details {
  color: var(--text-secondary);
  max-width: 40ch;
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
</style>
