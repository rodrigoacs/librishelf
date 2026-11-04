<template>
  <div class="page loans-page">
    <PageHeader
      :title="t('loans.title')"
      :subtitle="t('loans.subtitle')"
    />

    <section
      v-if="summary"
      class="loans-summary"
      :aria-label="t('loans.summaryLabel')"
    >
      <div class="kpi">
        <span class="stat-value">{{ summary.openLoans }}</span>
        <span class="stat-label">{{ t('loans.open') }}</span>
      </div>
      <div class="kpi">
        <span
          class="stat-value"
          :class="{ late: summary.overdueLoans }"
        >{{ summary.overdueLoans }}</span>
        <span class="stat-label">{{ t('loans.overdue') }}</span>
      </div>
      <div
        v-for="total in summary.totals"
        :key="total.currency"
        class="kpi"
      >
        <span class="stat-value">{{ formatMoney(total.valueCents, dateLocale, total.currency) }}</span>
        <span class="stat-label">{{ t('loans.collectionValue') }}</span>
        <span class="stat-note">{{ t('loans.paid', { amount: formatMoney(total.paidCents, dateLocale, total.currency), n: total.books }, total.books) }}</span>
      </div>
    </section>

    <ProNotice
      v-if="plan && !canUse('collector')"
      feature="collector"
      :readonly="Boolean(summary?.totals.length)"
      compact
      class="loans-notice"
    />

    <div class="loans-toolbar">
      <h2
        id="loans-list-title"
        class="section-title"
      >{{ t(`loans.lists.${status}`) }}</h2>
      <AppSelect
        :modelValue="status"
        :options="statusOptions"
        ariaLabelledby="loans-list-title"
        class="status-select"
        @update:modelValue="changeStatus"
      />
    </div>

    <AppSkeleton
      v-if="loading && !loans"
      height="180px"
    />
    <EmptyState
      v-else-if="loadError"
      variant="error"
      :title="loadError"
      :action-label="t('common.retry')"
      @action="load"
    />
    <EmptyState
      v-else-if="loans && !loans.length"
      icon="pi pi-arrow-up-right"
      :title="t(`loans.empty.${status}`)"
      :text="t('loans.emptyHint')"
    />
    <ul
      v-else-if="loans"
      class="loan-list"
    >
      <li
        v-for="loan in loans"
        :key="loan.id"
      >
        <button
          type="button"
          class="loan-row"
          :class="{ overdue: loan.overdue }"
          @click="openBook(loan.bookId)"
        >
          <BookCover
            :book-id="loan.bookId"
            :title="loan.title"
            :author="loan.authors || ''"
            :version="loan.coverVersion"
            class="loan-cover"
          />
          <span class="loan-text">
            <span class="loan-title">{{ loan.title }}</span>
            <span class="loan-who">{{ loan.borrower }}</span>
            <span class="loan-when">{{ when(loan) }}</span>
          </span>
          <i
            v-if="loan.remind && !loan.returnedOn"
            class="pi pi-bell loan-bell"
            :title="t('loans.reminderOn')"
            :aria-label="t('loans.reminderOn')"
          ></i>
        </button>
      </li>
    </ul>

    <BookDialog
      v-if="openedBookId"
      v-model="bookDialogOpen"
      :book-id="openedBookId"
      @updated="load"
      @deleted="load"
    />
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import api from '../services/api.js'
import { usePlan } from '../services/plan.js'
import PageHeader from '../components/ui/PageHeader.vue'
import AppSelect from '../components/ui/AppSelect.vue'
import AppSkeleton from '../components/ui/AppSkeleton.vue'
import EmptyState from '../components/ui/EmptyState.vue'
import BookCover from '../components/BookCover.vue'
import BookDialog from '../components/BookDialog.vue'
import ProNotice from '../components/ProNotice.vue'
import { fromIso } from '../utils/statPeriods.js'
import { formatMoney } from '../utils/money.js'

const { t, locale } = useI18n()
const { plan, canUse } = usePlan()
const dateLocale = computed(() => (locale.value === 'en' ? 'en-US' : 'pt-BR'))

const status = ref('open')
const loans = ref(null)
const summary = ref(null)
const loading = ref(false)
const loadError = ref('')

const statusOptions = computed(() =>
  ['open', 'returned', 'all'].map(value => ({ value, label: t(`loans.lists.${value}`) })))

const date = text => fromIso(text).toLocaleDateString(dateLocale.value, { day: 'numeric', month: 'short', year: 'numeric' })

function when(loan) {
  if (loan.returnedOn) return t('loans.returnedOn', { from: date(loan.lentOn), to: date(loan.returnedOn) })
  if (loan.dueOn) return t(loan.overdue ? 'loans.lateSince' : 'loans.dueOn', { from: date(loan.lentOn), due: date(loan.dueOn) })
  return t('loans.since', { from: date(loan.lentOn) })
}

async function load() {
  const asked = status.value
  loading.value = true
  loadError.value = ''
  try {
    const [list, totals] = await Promise.all([api.getLoans(asked), api.getCollectionSummary()])
    if (asked === status.value) loans.value = list
    summary.value = totals
  } catch (error) {
    loadError.value = error.message
  } finally {
    loading.value = false
  }
}

function changeStatus(value) {
  status.value = value
  loans.value = null
  load()
}

const openedBookId = ref(null)
const bookDialogOpen = ref(false)
function openBook(id) {
  openedBookId.value = id
  bookDialogOpen.value = true
}
watch(bookDialogOpen, open => { if (!open) load() })

onMounted(load)
</script>

<style scoped>
.loans-summary {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-4) var(--space-7);
  margin-bottom: var(--space-6);
}

.kpi {
  display: flex;
  flex-direction: column;
}

.stat-value.late {
  color: var(--red);
}

.loans-notice {
  margin-bottom: var(--space-6);
}

.loans-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  margin-bottom: var(--space-3);
}

.loans-toolbar h2 {
  margin: 0;
}

.status-select {
  min-width: 12rem;
}

.loan-list {
  display: grid;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.loan-row {
  display: grid;
  grid-template-columns: 2.75rem minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--border-color);
  border-left: 3px solid transparent;
  border-radius: var(--card-radius);
  background: var(--bg-panel);
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.loan-row.overdue {
  border-left-color: var(--red);
}

.loan-row:focus-visible {
  outline: var(--focus-ring);
  outline-offset: var(--focus-offset);
}

.loan-cover {
  width: 2.75rem;
}

.loan-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.loan-title {
  overflow: hidden;
  color: var(--text-primary);
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.loan-who {
  color: var(--text-primary);
  font-size: var(--fs-sm);
}

.loan-when {
  color: var(--text-secondary);
  font-size: var(--fs-xs);
}

.loan-row.overdue .loan-when {
  color: var(--red);
}

.loan-bell {
  color: var(--text-secondary);
}

@media (max-width: 639.98px) {
  .status-select {
    min-width: 0;
    width: 100%;
  }
}
</style>
