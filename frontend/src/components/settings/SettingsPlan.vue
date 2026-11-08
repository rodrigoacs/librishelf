<template>
  <!-- Plano: atual e validade, teste grátis, cancelar o mensal, cobranças -->
  <SettingsGroup
    :title="t('settings.plan.title')"
    title-id="settings-group-plan"
    anchor="settings-plan"
  >
    <template #before>
      <p
        v-if="endedText"
        class="ended-note"
      >{{ endedText }}</p>
    </template>

    <SettingsRow
      :label="t('settings.plan.current')"
      :value="currentName"
      :help="validity"
      icon="pi pi-star"
      interactive
      @click="router.push({ name: 'pricing' })"
    />
    <SettingsRow
      v-if="trialAvailable"
      :label="t('settings.plan.trial')"
      :help="t('settings.plan.trialHelp')"
      icon="pi pi-clock"
      interactive
      trail-icon=""
      :loading="busy === 'trial'"
      @click="startTrial"
    />
    <SettingsRow
      :label="t('settings.plan.history')"
      icon="pi pi-receipt"
      interactive
      @click="openHistory"
    />
    <!-- Direito de arrependimento: a compra mais recente ainda no prazo -->
    <SettingsRow
      v-if="withdrawable"
      :label="t('settings.plan.withdraw')"
      :help="t('settings.plan.withdrawHelp', { date: longDate(withdrawable.withdrawableUntil) })"
      icon="pi pi-replay"
      interactive
      danger
      trail-icon=""
      :loading="busy === 'withdraw'"
      @click="askWithdraw(withdrawable)"
    />
    <SettingsRow
      v-if="canCancel"
      :label="t('settings.plan.cancel')"
      :help="t('settings.plan.cancelHelp')"
      icon="pi pi-times-circle"
      interactive
      danger
      trail-icon=""
      :loading="busy === 'cancel'"
      @click="askCancel"
    />

    <template #after>
      <!-- Único aviso do Pro na Conta (Personalização e Backup não repetem) -->
      <p
        v-if="plan && !plan.pro && !endedText"
        class="pro-note"
      >{{ t('settings.plan.proNote') }}</p>

      <AppDialog
        v-model:visible="historyOpen"
        :header="t('settings.plan.history')"
        size="sm"
      >
        <p
          v-if="historyLoading"
          class="muted"
          role="status"
        >{{ t('common.loading') }}</p>
        <p
          v-else-if="historyFailed"
          class="muted"
        >{{ t('common.loadError') }}</p>
        <p
          v-else-if="payments.length === 0"
          class="muted"
        >{{ t('settings.plan.noPayments') }}</p>
        <ul
          v-else
          class="payments"
        >
          <li
            v-for="payment in payments"
            :key="payment.id"
          >
            <span class="payment-main">
              <span>{{ t(`plan.kinds.${payment.offer}`) }}</span>
              <span class="amount">{{ money(payment.amountCents, payment.currency) }}</span>
            </span>
            <span class="muted">
              {{ shortDate(payment.paidAt || payment.createdAt) }}<template v-if="payment.method"> · {{ t(`settings.plan.methods.${payment.method}`) }}</template>
              · {{ payment.refundedAt ? t('settings.plan.refunded', { date: shortDate(payment.refundedAt) }) : t(`settings.plan.statuses.${statusGroup(payment.status)}`) }}
            </span>
            <span
              v-if="payment.withdrawableUntil"
              class="payment-withdraw"
            >
              <span>{{ t('settings.plan.withdrawHelp', { date: shortDate(payment.withdrawableUntil) }) }}</span>
              <AppButton
                :label="t('settings.plan.withdraw')"
                class="btn-text btn-sm"
                :loading="busy === 'withdraw'"
                @click="askWithdraw(payment)"
              />
            </span>
          </li>
        </ul>
      </AppDialog>
    </template>
  </SettingsGroup>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import SettingsRow from './SettingsRow.vue'
import SettingsGroup from './SettingsGroup.vue'
import AppDialog from '../ui/AppDialog.vue'
import AppButton from '../ui/AppButton.vue'
import api from '../../services/api.js'
import { useToast } from '../../services/toast.js'
import { useConfirm } from '../../services/confirm.js'
import { plan, refresh } from '../../services/plan.js'

const { t, locale } = useI18n()
const router = useRouter()
const toast = useToast()
const confirm = useConfirm()

const busy = ref('')
const historyOpen = ref(false)
const historyLoading = ref(false)
const historyFailed = ref(false)
const payments = ref([])

const tag = computed(() => (locale.value === 'en' ? 'en-US' : 'pt-BR'))
const longDate = value => new Date(value).toLocaleDateString(tag.value, { day: 'numeric', month: 'long', year: 'numeric' })
const shortDate = value => (value ? new Date(value).toLocaleDateString(tag.value, { dateStyle: 'short' }) : '')
const money = (cents, currency = 'BRL') => (cents / 100).toLocaleString(tag.value, { style: 'currency', currency })

const current = computed(() => (plan.value?.pro ? plan.value.current : null))
const currentName = computed(() => (current.value ? t(`plan.kinds.${current.value.kind}`) : t('settings.plan.free')))

const validity = computed(() => {
  const item = current.value
  if (!item) return t('settings.plan.freeHelp')
  if (item.lifetime) return t('settings.plan.lifetime')
  const date = longDate(item.endsAt)
  if (item.kind === 'monthly' && item.autoRenew) return t('settings.plan.renews', { date })
  if (item.canceledAt) return t('settings.plan.canceledUntil', { date })
  return t('settings.plan.until', { date })
})

const endedText = computed(() => {
  if (plan.value?.pro || !plan.value?.endedAt) return ''
  return t('settings.plan.ended', { date: longDate(plan.value.endedAt) })
})

const trialAvailable = computed(() => Boolean(plan.value?.trial?.available) && !plan.value?.pro)
const canCancel = computed(() => current.value?.kind === 'monthly' && current.value.autoRenew && current.value.source === 'mercadopago')

// Compra ainda no prazo de desistência (a mais recente primeiro, como vem da API)
const withdrawable = computed(() => payments.value.find(payment => payment.withdrawableUntil) ?? null)

const statusGroup = status => (status === 'approved' ? 'paid'
  : ['rejected', 'cancelled'].includes(status) ? 'declined'
    : ['refunded', 'charged_back'].includes(status) ? 'reversed'
      : 'pending')

async function startTrial() {
  busy.value = 'trial'
  try {
    const { endsAt } = await api.startTrial()
    await refresh()
    toast.add({ severity: 'success', detail: t('settings.plan.trialStarted', { date: longDate(endsAt) }) })
  } catch (error) {
    toast.add({ severity: 'error', detail: error.message })
  } finally {
    busy.value = ''
  }
}

function askCancel() {
  confirm.require({
    header: t('settings.plan.cancelTitle'),
    message: t('settings.plan.cancelMessage', { date: longDate(current.value.endsAt) }),
    acceptLabel: t('settings.plan.cancelConfirm'),
    rejectLabel: t('settings.plan.keep'),
    acceptClass: 'btn-danger',
    accept: cancel
  })
}

async function cancel() {
  busy.value = 'cancel'
  try {
    const { endsAt } = await api.cancelSubscription()
    await refresh()
    toast.add({ severity: 'success', detail: endsAt ? t('settings.plan.canceled', { date: longDate(endsAt) }) : t('settings.plan.canceledNow') })
  } catch (error) {
    toast.add({ severity: 'error', detail: error.message })
  } finally {
    busy.value = ''
  }
}

async function loadPayments() {
  historyLoading.value = true
  historyFailed.value = false
  try {
    payments.value = (await api.planPayments()).payments
  } catch {
    historyFailed.value = true
  } finally {
    historyLoading.value = false
  }
}

function openHistory() {
  historyOpen.value = true
  loadPayments()
}

// Quem pagou pelo Mercado Pago vê o botão de desistir sem abrir o histórico
onMounted(() => {
  if (current.value?.source === 'mercadopago') loadPayments()
})

function askWithdraw(payment) {
  confirm.require({
    header: t('settings.plan.withdrawTitle'),
    message: t(payment.offer === 'monthly' ? 'settings.plan.withdrawMessageMonthly' : 'settings.plan.withdrawMessage', {
      amount: money(payment.amountCents, payment.currency)
    }),
    acceptLabel: t('settings.plan.withdrawConfirm'),
    rejectLabel: t('settings.plan.keep'),
    acceptClass: 'btn-danger',
    accept: () => withdraw(payment)
  })
}

async function withdraw(payment) {
  busy.value = 'withdraw'
  try {
    await api.withdrawPayment(payment.id)
    await Promise.all([refresh(), loadPayments()])
    toast.add({ severity: 'success', detail: t('settings.plan.withdrawn', { amount: money(payment.amountCents, payment.currency) }) })
  } catch (error) {
    toast.add({ severity: 'error', detail: error.message })
  } finally {
    busy.value = ''
  }
}
</script>

<style scoped>
.ended-note,
.pro-note {
  margin: 0;
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-md);
  background: rgba(var(--main-color-rgb), 0.08);
  color: var(--text-primary);
  font-size: var(--fs-sm);
  line-height: 1.45;
}

.pro-note {
  background: none;
  padding-top: 0;
  padding-bottom: 0;
  color: var(--text-secondary);
}

.muted {
  margin: 0;
  color: var(--text-secondary);
  font-size: var(--fs-sm);
}

.payments {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}

.payments li {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding: var(--space-3) 0;
}

.payments li + li {
  border-top: 1px solid var(--border-color);
}

.payment-main {
  display: flex;
  justify-content: space-between;
  gap: var(--space-3);
  color: var(--text-primary);
  font-weight: 600;
  font-size: var(--fs-sm);
}

.amount {
  font-variant-numeric: tabular-nums;
}

.payment-withdraw {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  color: var(--text-muted);
  font-size: var(--fs-xs);
}
</style>
