<template>
  <div class="billing">
    <AppSkeleton
      v-if="loading && !data"
      height="320px"
    />
    <EmptyState
      v-else-if="failed && !data"
      variant="error"
      compact
      :level="3"
      :title="t('common.loadErrorTitle')"
      @action="loadOffers"
    />

    <template v-else-if="data">
      <section
        class="card"
        aria-labelledby="admin-billing-summary"
      >
        <h2
          id="admin-billing-summary"
          class="section-title"
        >{{ t('admin.billing.summary') }}</h2>
        <dl class="kpis">
          <div>
            <dt>{{ t('admin.billing.activePro') }}</dt>
            <dd>{{ formatNumber(activeTotal, locale) }}</dd>
            <dd class="small">{{ activeBreakdown || t('admin.billing.none') }}</dd>
          </div>
          <div>
            <dt>{{ t('admin.billing.received30') }}</dt>
            <dd>{{ formatMoney(data.revenue30.receivedCents, locale) }}</dd>
            <dd class="small">{{ t('admin.billing.payments30', { n: data.revenue30.payments }) }}</dd>
          </div>
          <div>
            <dt>{{ t('admin.billing.refunded30') }}</dt>
            <dd>{{ formatMoney(data.revenue30.refundedCents, locale) }}</dd>
          </div>
        </dl>
      </section>

      <section
        class="card"
        aria-labelledby="admin-billing-offers"
      >
        <h2
          id="admin-billing-offers"
          class="section-title"
        >{{ t('admin.billing.offers') }}</h2>
        <p class="hint">{{ t('admin.billing.offersHint') }}</p>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">{{ t('admin.billing.cols.offer') }}</th>
                <th
                  scope="col"
                  class="num"
                >{{ t('admin.billing.cols.price') }}</th>
                <th scope="col">{{ t('admin.billing.cols.window') }}</th>
                <th
                  scope="col"
                  class="num"
                >{{ t('admin.billing.cols.slots') }}</th>
                <th scope="col">{{ t('admin.billing.cols.state') }}</th>
                <th scope="col"><span class="sr-only">{{ t('admin.billing.edit') }}</span></th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="offer in data.offers"
                :key="offer.code"
              >
                <th scope="row">{{ t(`admin.billing.kinds.${offer.code}`) }}</th>
                <td class="num">{{ formatMoney(offer.priceCents, locale) }}</td>
                <td class="muted">{{ windowText(offer) }}</td>
                <td class="num">
                  <template v-if="offer.slotsTotal === null">—</template>
                  <template v-else>
                    {{ t('admin.billing.slotsOf', { used: offer.slotsUsed, total: offer.slotsTotal }) }}
                    <span class="small block">{{ t('admin.billing.slotsLeft', { n: offer.slotsLeft }) }}<template v-if="offer.heldSlots"> · {{ t('admin.billing.slotsHeld', { n: offer.heldSlots }) }}</template></span>
                  </template>
                </td>
                <td>
                  <span
                    class="state"
                    :class="offer.open ? 'open' : offer.active ? 'waiting' : 'off'"
                  >{{ t(`admin.billing.states.${offer.open ? 'open' : offer.active ? 'waiting' : 'off'}`) }}</span>
                </td>
                <td class="num">
                  <AppButton
                    icon="pi pi-pencil"
                    :aria-label="t('admin.billing.editOffer', { name: t(`admin.billing.kinds.${offer.code}`) })"
                    class="btn-text btn-sm btn-secondary"
                    @click="openOffer(offer)"
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section
        class="card"
        aria-labelledby="admin-billing-payments"
      >
        <div class="head">
          <h2
            id="admin-billing-payments"
            class="section-title"
          >{{ t('admin.billing.payments') }}</h2>
          <div
            class="filters"
            role="radiogroup"
            :aria-label="t('admin.billing.paymentsFilter')"
          >
            <button
              v-for="option in PAYMENT_FILTERS"
              :key="option"
              type="button"
              role="radio"
              class="filter"
              :class="{ active: filter === option }"
              :aria-checked="filter === option"
              @click="setFilter(option)"
            >{{ t(`admin.billing.filters.${option}`) }}</button>
          </div>
        </div>
        <p class="hint">{{ t('admin.billing.paymentsHint') }}</p>
        <div class="table-wrap">
          <table :aria-busy="paymentsLoading ? 'true' : 'false'">
            <thead>
              <tr>
                <th scope="col">{{ t('admin.billing.cols.when') }}</th>
                <th scope="col">{{ t('admin.billing.cols.account') }}</th>
                <th scope="col">{{ t('admin.billing.cols.offer') }}</th>
                <th
                  scope="col"
                  class="num"
                >{{ t('admin.billing.cols.amount') }}</th>
                <th scope="col">{{ t('admin.billing.cols.status') }}</th>
                <th scope="col"><span class="sr-only">{{ t('admin.billing.refund') }}</span></th>
              </tr>
            </thead>
            <tbody v-if="payments.length">
              <tr
                v-for="payment in payments"
                :key="payment.id"
              >
                <td class="when">{{ formatDateTime(payment.paidAt || payment.createdAt, locale) }}</td>
                <td>
                  <button
                    v-if="payment.userId"
                    type="button"
                    class="link"
                    @click="emit('open-user', payment.userId)"
                  >@{{ payment.username }}</button>
                  <span
                    v-else
                    class="muted"
                  >{{ t('admin.log.deleted') }}</span>
                </td>
                <td>{{ t(`admin.billing.kinds.${payment.offer}`) }}<span
                  v-if="payment.method"
                  class="small block"
                >{{ t(`admin.billing.methods.${payment.method}`) }}</span></td>
                <td class="num">{{ formatMoney(payment.amountCents, locale, payment.currency) }}</td>
                <td>
                  <span
                    class="status"
                    :class="statusClass(payment)"
                  >{{ statusText(payment) }}</span>
                  <span
                    v-if="payment.problem"
                    class="problem block"
                  >{{ payment.problem }}</span>
                  <span
                    v-if="payment.refundedBy"
                    class="small block"
                  >@{{ payment.refundedBy }}</span>
                </td>
                <td class="num">
                  <AppButton
                    v-if="canRefund(payment)"
                    :label="t('admin.billing.refund')"
                    class="btn-outlined btn-sm btn-secondary"
                    @click="openRefund(payment)"
                  />
                </td>
              </tr>
            </tbody>
          </table>
          <p
            v-if="paymentsLoading"
            class="empty-note"
            role="status"
          >{{ t('common.loading') }}</p>
          <p
            v-else-if="payments.length === 0"
            class="empty-note"
          >{{ t(`admin.billing.empty.${filter}`) }}</p>
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
            :disabled="page <= 1 || paymentsLoading"
            @click="goTo(page - 1)"
          />
          <span>{{ t('admin.pageOf', { page, pages }) }}</span>
          <AppButton
            icon="pi pi-chevron-right"
            :aria-label="t('admin.next')"
            class="btn-text btn-sm btn-secondary"
            :disabled="page >= pages || paymentsLoading"
            @click="goTo(page + 1)"
          />
        </nav>
      </section>
    </template>

    <AppDialog
      v-model:visible="offerDialog.visible"
      :header="offerDialog.code ? t(`admin.billing.kinds.${offerDialog.code}`) : ''"
      size="sm"
    >
      <form
        class="stack"
        novalidate
        @submit.prevent="saveOffer"
      >
        <label class="switch-row">
          <span>{{ t('admin.billing.offerActive') }}</span>
          <AppSwitch
            v-model="offerDialog.active"
            input-id="admin-offer-active"
          />
        </label>
        <TextField
          id="admin-offer-start"
          v-model="offerDialog.startsAt"
          type="date"
          :label="t('admin.billing.windowStart')"
          :hint="t('admin.billing.windowEmpty')"
        />
        <TextField
          id="admin-offer-end"
          v-model="offerDialog.endsAt"
          type="date"
          :label="t('admin.billing.windowEnd')"
        />
        <AppButton
          :label="t('admin.billing.threeMonths')"
          icon="pi pi-calendar"
          class="btn-text btn-sm btn-secondary suggest"
          @click="suggestWindow"
        />
        <TextField
          v-if="offerDialog.limited"
          id="admin-offer-slots"
          v-model="offerDialog.slotsTotal"
          type="number"
          inputmode="numeric"
          :label="t('admin.billing.slotsTotal')"
          :hint="t('admin.billing.slotsTotalHint', { n: offerDialog.slotsUsed })"
        />
        <p
          v-if="offerDialog.error"
          class="form-error"
          role="alert"
        >{{ offerDialog.error }}</p>
        <div class="dialog-actions">
          <AppButton
            :label="t('common.cancel')"
            class="btn-text btn-secondary"
            @click="offerDialog.visible = false"
          />
          <AppButton
            type="submit"
            :label="t('common.save')"
            :loading="offerDialog.busy"
          />
        </div>
      </form>
    </AppDialog>

    <AppDialog
      v-model:visible="refundDialog.visible"
      :header="t('admin.billing.refundTitle')"
      size="sm"
    >
      <form
        class="stack"
        novalidate
        @submit.prevent="confirmRefund"
      >
        <p class="desc">{{ t('admin.billing.refundDesc') }}</p>
        <p
          v-if="refundDialog.payment"
          class="desc strong"
        >@{{ refundDialog.payment.username }} · {{ t(`admin.billing.kinds.${refundDialog.payment.offer}`) }} · {{ formatMoney(refundDialog.payment.amountCents, locale, refundDialog.payment.currency) }}</p>
        <TextField
          id="admin-refund-note"
          v-model="refundDialog.note"
          :label="t('admin.billing.note')"
          maxlength="500"
          multiline
          :rows="2"
        />
        <div class="dialog-actions">
          <AppButton
            :label="t('common.cancel')"
            class="btn-text btn-secondary"
            @click="refundDialog.visible = false"
          />
          <AppButton
            type="submit"
            :label="t('admin.billing.refundConfirm')"
            class="btn-danger"
            :loading="refundDialog.busy"
          />
        </div>
      </form>
    </AppDialog>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import AppButton from '../ui/AppButton.vue'
import AppDialog from '../ui/AppDialog.vue'
import AppSkeleton from '../ui/AppSkeleton.vue'
import AppSwitch from '../ui/AppSwitch.vue'
import EmptyState from '../ui/EmptyState.vue'
import TextField from '../form/TextField.vue'
import api from '../../services/api.js'
import { useToast } from '../../services/toast.js'
import { LockedError, useAdminCall, formatDateTime, formatShortDate, formatNumber, formatMoney, toDateInput, fromDateInput } from './adminCall.js'

/**
 * Aba Pro: quantos têm Pro, ofertas (janela de fundador, vagas) e
 * pagamentos com o reembolso. O dinheiro volta pelo painel do Mercado Pago;
 * aqui só se marca, e o Pro daquela compra sai.
 */
const emit = defineEmits(['open-user'])
const { t, locale } = useI18n()
const call = useAdminCall()
const toast = useToast()

const PAYMENT_FILTERS = ['all', 'problem', 'refunded']
const LIMIT = 20
const DAY_MS = 24 * 60 * 60 * 1000

const data = ref(null)
const loading = ref(true)
const failed = ref(false)
const payments = ref([])
const total = ref(0)
const page = ref(1)
const filter = ref('all')
const paymentsLoading = ref(true)
const pages = computed(() => Math.max(1, Math.ceil(total.value / LIMIT)))

const offerDialog = reactive({ visible: false, code: '', active: false, startsAt: '', endsAt: '', limited: false, slotsTotal: '', slotsUsed: 0, error: '', busy: false })
const refundDialog = reactive({ visible: false, payment: null, note: '', busy: false })

const activeTotal = computed(() => Object.values(data.value?.activePro || {}).reduce((sum, n) => sum + n, 0))
const activeBreakdown = computed(() => Object.entries(data.value?.activePro || {})
  .map(([kind, n]) => `${t(`admin.billing.kinds.${kind}`)} ${n}`).join(' · '))

function windowText(offer) {
  if (!offer.startsAt && !offer.endsAt) return t('admin.billing.noWindow')
  const from = offer.startsAt ? formatShortDate(offer.startsAt, locale.value) : '…'
  const to = offer.endsAt ? formatShortDate(offer.endsAt, locale.value) : '…'
  return `${from} – ${to}`
}

function statusClass(payment) {
  if (payment.refundedAt) return 'refunded'
  if (payment.problem) return 'problem'
  return payment.status
}

function statusText(payment) {
  if (payment.refundedAt) return t('admin.billing.refundedOn', { date: formatShortDate(payment.refundedAt, locale.value) })
  if (payment.problem) return t('admin.billing.filters.problem')
  return t(`admin.billing.statuses.${payment.status}`)
}

const canRefund = payment => !payment.refundedAt && ['approved', 'refunded', 'charged_back'].includes(payment.status)

async function loadOffers() {
  loading.value = true
  failed.value = false
  try {
    data.value = await call(() => api.adminOffers())
  } catch (error) {
    if (!(error instanceof LockedError)) failed.value = true
  } finally {
    loading.value = false
  }
}

async function loadPayments() {
  paymentsLoading.value = true
  try {
    const result = await call(() => api.adminPayments({ filter: filter.value, page: page.value, limit: LIMIT }))
    payments.value = result.payments
    total.value = result.total
  } catch (error) {
    if (!(error instanceof LockedError)) toast.add({ severity: 'error', detail: error.message })
  } finally {
    paymentsLoading.value = false
  }
}

function setFilter(value) {
  filter.value = value
  page.value = 1
  loadPayments()
}

function goTo(target) {
  page.value = target
  loadPayments()
}

function openOffer(offer) {
  Object.assign(offerDialog, {
    visible: true,
    code: offer.code,
    active: offer.active,
    startsAt: toDateInput(offer.startsAt),
    endsAt: toDateInput(offer.endsAt),
    limited: offer.slotsTotal !== null,
    slotsTotal: offer.slotsTotal === null ? '' : String(offer.slotsTotal),
    slotsUsed: offer.slotsUsed,
    error: '',
    busy: false
  })
}

// Sugestão das decisões: janela de lançamento de 3 meses a partir de hoje
function suggestWindow() {
  const start = new Date()
  const end = new Date(start)
  end.setMonth(end.getMonth() + 3)
  offerDialog.startsAt = toDateInput(start)
  offerDialog.endsAt = toDateInput(new Date(end.getTime() - DAY_MS))
}

async function saveOffer() {
  offerDialog.error = ''
  offerDialog.busy = true
  const body = {
    active: offerDialog.active,
    startsAt: fromDateInput(offerDialog.startsAt),
    endsAt: fromDateInput(offerDialog.endsAt, { endOfDay: true })
  }
  if (offerDialog.limited) body.slotsTotal = Number(offerDialog.slotsTotal)
  try {
    const { offer } = await call(() => api.adminUpdateOffer(offerDialog.code, body))
    data.value.offers = data.value.offers.map(item => (item.code === offer.code ? offer : item))
    offerDialog.visible = false
    toast.add({ severity: 'success', detail: t('admin.billing.offerSaved') })
  } catch (error) {
    if (!(error instanceof LockedError)) offerDialog.error = error.message
  } finally {
    offerDialog.busy = false
  }
}

function openRefund(payment) {
  Object.assign(refundDialog, { visible: true, payment, note: '', busy: false })
}

async function confirmRefund() {
  refundDialog.busy = true
  try {
    await call(() => api.adminRefundPayment(refundDialog.payment.id, refundDialog.note.trim() || null))
    refundDialog.visible = false
    toast.add({ severity: 'success', detail: t('admin.billing.refundDone') })
    loadPayments()
    loadOffers()
  } catch (error) {
    if (!(error instanceof LockedError)) toast.add({ severity: 'error', detail: error.message })
  } finally {
    refundDialog.busy = false
  }
}

onMounted(() => {
  loadOffers()
  loadPayments()
})
</script>

<style scoped>
.billing {
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

.kpis {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: var(--space-4);
  margin: var(--space-3) 0 0;
}

.kpis dt {
  color: var(--text-secondary);
  font-size: var(--fs-sm);
}

.kpis dd {
  margin: 0;
  font-size: var(--fs-xl);
  font-weight: 700;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}

.kpis dd.small {
  font-size: var(--fs-xs);
  font-weight: 400;
  color: var(--text-secondary);
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

tbody th {
  font-weight: 600;
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

.state,
.status {
  font-size: var(--fs-xs);
  font-weight: 600;
  border-radius: var(--radius-pill);
  padding: 0.1rem var(--space-2);
  background: var(--bg-input);
  color: var(--text-secondary);
  white-space: nowrap;
}

.state.open,
.status.approved {
  background: rgba(var(--green-rgb), 0.16);
  color: var(--text-primary);
}

.state.waiting,
.status.pending,
.status.in_process {
  background: rgba(var(--main-color-rgb), 0.14);
  color: var(--text-primary);
}

.status.rejected,
.status.problem,
.status.refunded,
.status.charged_back {
  background: rgba(var(--red-rgb), 0.16);
  color: var(--text-primary);
}

.problem {
  margin-top: var(--space-1);
  color: var(--red);
  font-size: var(--fs-xs);
  max-width: 36ch;
}

.link {
  border: none;
  background: none;
  padding: 0;
  font: inherit;
  color: var(--main-color);
  cursor: pointer;
}

.link:focus-visible {
  outline: var(--focus-ring);
  outline-offset: 2px;
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

.pager {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: var(--space-3);
  margin-top: var(--space-3);
  color: var(--text-secondary);
  font-size: var(--fs-sm);
}

.stack {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.switch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  color: var(--text-primary);
}

.suggest {
  align-self: flex-start;
}

.desc {
  margin: 0;
  color: var(--text-secondary);
  font-size: var(--fs-sm);
}

.desc.strong {
  color: var(--text-primary);
  font-weight: 600;
}

.form-error {
  margin: 0;
  color: var(--red);
  font-size: var(--fs-sm);
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
}
</style>
