<template>
  <section aria-labelledby="user-pro">
    <div class="head">
      <h3
        id="user-pro"
        class="section-title"
      >{{ t('admin.userPro.title') }}</h3>
      <AppButton
        v-if="billing && !form.open"
        :label="t('admin.userPro.grant')"
        icon="pi pi-plus"
        class="btn-text btn-sm"
        @click="openForm"
      />
    </div>

    <p
      v-if="loading && !billing"
      class="muted"
      role="status"
    >{{ t('common.loading') }}</p>
    <p
      v-else-if="failed"
      class="muted"
    >{{ t('common.loadError') }}</p>

    <template v-else-if="billing">
      <form
        v-if="form.open"
        class="grant"
        novalidate
        @submit.prevent="grant"
      >
        <div class="field">
          <span
            id="admin-grant-kind-label"
            class="label"
          >{{ t('admin.userPro.kind') }}</span>
          <AppSelect
            v-model="form.kind"
            :options="kindOptions"
            aria-labelledby="admin-grant-kind-label"
          />
        </div>
        <TextField
          v-if="form.kind !== 'founder_lifetime'"
          id="admin-grant-days"
          v-model="form.days"
          type="number"
          inputmode="numeric"
          :label="t('admin.userPro.days')"
          :hint="t('admin.userPro.daysHint')"
        />
        <TextField
          id="admin-grant-note"
          v-model="form.note"
          :label="t('admin.userPro.note')"
          maxlength="500"
        />
        <p
          v-if="form.error"
          class="form-error"
          role="alert"
        >{{ form.error }}</p>
        <div class="form-actions">
          <AppButton
            :label="t('common.cancel')"
            class="btn-text btn-secondary btn-sm"
            @click="form.open = false"
          />
          <AppButton
            type="submit"
            :label="t('admin.userPro.grantConfirm')"
            class="btn-sm"
            :loading="form.busy"
          />
        </div>
      </form>

      <p
        v-if="billing.entitlements.length === 0"
        class="muted"
      >{{ t('admin.userPro.none') }}</p>
      <ul
        v-else
        class="list"
      >
        <li
          v-for="item in billing.entitlements"
          :key="item.id"
        >
          <div class="line">
            <span class="strong">{{ t(`admin.billing.kinds.${item.kind}`) }}</span>
            <span
              class="tag"
              :class="item.current ? 'on' : 'off'"
            >{{ item.current ? t('admin.userPro.current') : t(`admin.userPro.statuses.${item.status}`) }}</span>
            <AppButton
              v-if="item.status === 'active'"
              :label="t('admin.userPro.revoke')"
              class="btn-text btn-sm btn-danger revoke"
              :loading="revoking === item.id"
              @click="askRevoke(item)"
            />
          </div>
          <span class="muted">
            {{ t(`admin.userPro.sources.${item.source}`) }}<template v-if="item.grantedBy"> · @{{ item.grantedBy }}</template>
            · {{ period(item) }}<template v-if="item.autoRenew"> · {{ t('admin.userPro.autoRenew') }}</template>
          </span>
          <span
            v-if="item.note"
            class="muted note"
          >{{ item.note }}</span>
        </li>
      </ul>

      <p
        v-if="billing.trialUsedAt"
        class="muted after"
      >{{ t('admin.userPro.trialUsed', { date: formatDate(billing.trialUsedAt, locale) }) }}</p>

      <template v-if="billing.payments.length">
        <h4 class="section-title sub">{{ t('admin.userPro.payments') }}</h4>
        <ul class="list">
          <li
            v-for="payment in billing.payments"
            :key="payment.id"
          >
            <span class="strong">{{ t(`admin.billing.kinds.${payment.offer}`) }} · {{ formatMoney(payment.amountCents, locale, payment.currency) }}</span>
            <span class="muted">
              {{ formatDate(payment.paidAt || payment.createdAt, locale) }} ·
              {{ payment.refundedAt ? t('admin.billing.refundedOn', { date: formatShortDate(payment.refundedAt, locale) }) : t(`admin.billing.statuses.${payment.status}`) }}
            </span>
            <span
              v-if="payment.problem"
              class="problem"
            >{{ payment.problem }}</span>
          </li>
        </ul>
      </template>
    </template>
  </section>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import AppButton from '../ui/AppButton.vue'
import AppSelect from '../ui/AppSelect.vue'
import TextField from '../form/TextField.vue'
import api from '../../services/api.js'
import { useToast } from '../../services/toast.js'
import { useConfirm } from '../../services/confirm.js'
import { LockedError, useAdminCall, formatDate, formatShortDate, formatMoney } from './adminCall.js'

/** Pro de uma conta na gaveta da administração: conceder, revogar e cobranças. */
const props = defineProps({
  userId: { type: Number, required: true }
})
const emit = defineEmits(['changed'])

const { t, locale } = useI18n()
const call = useAdminCall()
const toast = useToast()
const confirm = useConfirm()

const KINDS = ['annual', 'monthly', 'founder_annual', 'founder_lifetime']
const DEFAULT_DAYS = { monthly: 30, annual: 365, founder_annual: 365 }

const billing = ref(null)
const loading = ref(false)
const failed = ref(false)
const revoking = ref(null)
const form = reactive({ open: false, kind: 'annual', days: '365', note: '', error: '', busy: false })

const kindOptions = computed(() => KINDS.map(value => ({ value, label: t(`admin.billing.kinds.${value}`) })))

watch(() => form.kind, kind => {
  if (DEFAULT_DAYS[kind]) form.days = String(DEFAULT_DAYS[kind])
})

function period(item) {
  const from = formatDate(item.startsAt, locale.value)
  if (!item.endsAt) return t('admin.userPro.fromLifetime', { from })
  return t('admin.userPro.fromTo', { from, to: formatDate(item.endsAt, locale.value) })
}

async function load() {
  loading.value = true
  failed.value = false
  try {
    billing.value = await call(() => api.adminUserBilling(props.userId))
  } catch (error) {
    if (!(error instanceof LockedError)) failed.value = true
  } finally {
    loading.value = false
  }
}

function openForm() {
  Object.assign(form, { open: true, kind: 'annual', days: '365', note: '', error: '', busy: false })
}

async function grant() {
  form.error = ''
  form.busy = true
  const body = { kind: form.kind, note: form.note.trim() || null }
  if (form.kind !== 'founder_lifetime') body.days = Number(form.days)
  try {
    await call(() => api.adminGrantPro(props.userId, body))
    form.open = false
    toast.add({ severity: 'success', detail: t('admin.userPro.granted') })
    emit('changed')
    load()
  } catch (error) {
    if (!(error instanceof LockedError)) form.error = error.message
  } finally {
    form.busy = false
  }
}

function askRevoke(item) {
  confirm.require({
    header: t('admin.userPro.revokeTitle'),
    message: item.source === 'mercadopago' && item.autoRenew ? t('admin.userPro.revokeSubscription') : t('admin.userPro.revokeMessage'),
    acceptLabel: t('admin.userPro.revoke'),
    rejectLabel: t('common.cancel'),
    acceptClass: 'btn-danger',
    accept: () => revoke(item)
  })
}

async function revoke(item) {
  revoking.value = item.id
  try {
    await call(() => api.adminRevokePro(item.id))
    toast.add({ severity: 'success', detail: t('admin.userPro.revoked') })
    emit('changed')
    load()
  } catch (error) {
    if (!(error instanceof LockedError)) toast.add({ severity: 'error', detail: error.message })
  } finally {
    revoking.value = null
  }
}

watch(() => props.userId, () => {
  billing.value = null
  form.open = false
  load()
}, { immediate: true })
</script>

<style scoped>
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  margin-bottom: var(--space-2);
}

h3 {
  margin: 0;
}

.sub {
  margin: var(--space-4) 0 var(--space-2);
}

.muted {
  color: var(--text-secondary);
  font-size: var(--fs-sm);
  margin: 0;
}

.after {
  margin-top: var(--space-2);
}

.strong {
  font-weight: 600;
  color: var(--text-primary);
}

.list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  font-size: var(--fs-sm);
}

.list li {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.line {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.revoke {
  margin-left: auto;
}

.note {
  font-style: italic;
}

.tag {
  font-size: var(--fs-xs);
  font-weight: 600;
  border-radius: var(--radius-pill);
  padding: 0.1rem var(--space-2);
  color: var(--text-primary);
}

.tag.on {
  background: rgba(var(--green-rgb), 0.16);
}

.tag.off {
  background: var(--bg-input);
  color: var(--text-secondary);
}

.problem {
  color: var(--red);
  font-size: var(--fs-xs);
}

.grant {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-3);
  margin-bottom: var(--space-4);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  background: var(--bg-input);
}

.field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.label {
  font-size: var(--fs-sm);
  color: var(--text-secondary);
}

.form-error {
  margin: 0;
  color: var(--red);
  font-size: var(--fs-sm);
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
}
</style>
