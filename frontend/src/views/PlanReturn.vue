<template>
  <div class="page plan-return-container">
    <PageHeader :title="t('planReturn.title')" />

    <section
      class="status-card"
      :class="tone"
      aria-live="polite"
    >
      <i
        :class="icon"
        aria-hidden="true"
      ></i>
      <div class="status-text">
        <h2 class="status-title">{{ t(`planReturn.states.${view}.title`) }}</h2>
        <p class="status-body">{{ body }}</p>
      </div>
    </section>

    <div class="actions">
      <AppButton
        v-if="['pending', 'waiting'].includes(view) && checkout?.url"
        :label="t('planReturn.reopen')"
        icon="pi pi-external-link"
        @click="reopen"
      />
      <router-link
        v-if="['rejected', 'expired'].includes(view)"
        :to="{ name: 'pricing', query: checkout?.offer ? { offer: checkout.offer } : {} }"
        class="action-link"
      >{{ t('planReturn.tryAgain') }}</router-link>
      <router-link
        :to="{ name: 'settings' }"
        class="action-link"
      >{{ t('planReturn.toAccount') }}</router-link>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import PageHeader from '../components/ui/PageHeader.vue'
import AppButton from '../components/ui/AppButton.vue'
import api from '../services/api.js'
import { plan, refresh } from '../services/plan.js'

/**
 * Volta do Mercado Pago: /plan/return?result=…&ref=<referência>&payment_id=…
 * Confere o pagamento na hora (sync) e depois consulta o estado enquanto ele
 * estiver em andamento. O que vale é a resposta do servidor, nunca o
 * "result" da URL.
 */
const { t, locale } = useI18n()
const route = useRoute()

const POLL_MS = 4000
const MAX_POLL_MS = 3 * 60 * 1000
const SECOND_SYNC_MS = 45 * 1000
const WAITING = ['processing', 'pending', 'waiting']

const checkout = ref(null)
const failed = ref(false)
const timedOut = ref(false)
const startedAt = Date.now()
let timer = null
let syncedAgain = false

const reference = typeof route.query.ref === 'string' ? route.query.ref : ''
const paymentId = [route.query.payment_id, route.query.collection_id].find(value => typeof value === 'string' && /^\d{1,20}$/.test(value)) || null

const view = computed(() => {
  if (!reference || failed.value) return 'unknown'
  if (!checkout.value) return 'checking'
  return checkout.value.state
})

const tone = computed(() => {
  const fixed = { active: 'ok', rejected: 'bad', expired: 'bad', problem: 'warn', unknown: 'warn' }[view.value]
  if (fixed) return fixed
  return timedOut.value ? 'warn' : 'wait'
})
const icon = computed(() => ({
  ok: 'pi pi-check-circle', bad: 'pi pi-times-circle', warn: 'pi pi-exclamation-circle', wait: 'pi pi-spinner pi-spin'
}[tone.value]))

const longDate = value => new Date(value).toLocaleDateString(locale.value === 'en' ? 'en-US' : 'pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })

const body = computed(() => {
  if (view.value === 'active') {
    const current = plan.value?.current
    if (current?.lifetime) return t('planReturn.activeLifetime')
    if (current?.endsAt) return t('planReturn.activeUntil', { date: longDate(current.endsAt) })
  }
  if (view.value === 'pending' && checkout.value?.expiresAt) {
    return t('planReturn.pendingUntil', { date: new Date(checkout.value.expiresAt).toLocaleString(locale.value === 'en' ? 'en-US' : 'pt-BR', { dateStyle: 'short', timeStyle: 'short' }) })
  }
  if (timedOut.value && WAITING.includes(view.value)) return t('planReturn.slow')
  return t(`planReturn.states.${view.value}.body`)
})

function reopen() {
  window.location.assign(checkout.value.url)
}

async function check({ sync = false } = {}) {
  try {
    const result = sync && paymentId
      ? await api.syncCheckout(reference, paymentId)
      : await api.checkoutStatus(reference)
    checkout.value = result
    if (result.state === 'active') await refresh()
  } catch (error) {
    // 404: a referência não é desta conta (ou não existe)
    if (error.status === 404 || error.status === 400) failed.value = true
  }
  schedule()
}

function schedule() {
  clearTimeout(timer)
  if (failed.value || !checkout.value || !WAITING.includes(checkout.value.state)) return
  const elapsed = Date.now() - startedAt
  if (elapsed > MAX_POLL_MS) {
    timedOut.value = true
    return
  }
  const sync = !syncedAgain && paymentId && elapsed > SECOND_SYNC_MS
  if (sync) syncedAgain = true
  timer = setTimeout(() => check({ sync }), POLL_MS)
}

onMounted(() => {
  if (reference) check({ sync: true })
})

onBeforeUnmount(() => clearTimeout(timer))
</script>

<style scoped>
.plan-return-container {
  --page-max: 640px;
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}

.status-card {
  display: flex;
  gap: var(--space-4);
  align-items: flex-start;
  padding: var(--card-pad);
  border: 1px solid var(--border-color);
  border-radius: var(--card-radius);
  background: var(--bg-panel);
}

.status-card > .pi {
  font-size: var(--fs-xl);
  margin-top: 0.1rem;
  color: var(--text-secondary);
}

.status-card.ok > .pi {
  color: var(--green);
}

.status-card.bad > .pi {
  color: var(--red);
}

.status-card.warn > .pi {
  color: var(--orange);
}

.status-title {
  margin: 0 0 var(--space-1);
  font-size: var(--fs-md);
  color: var(--text-primary);
}

.status-body {
  margin: 0;
  color: var(--text-secondary);
  font-size: var(--fs-sm);
  line-height: 1.5;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-5);
}

.action-link {
  color: var(--main-color);
  font-weight: 600;
  font-size: var(--fs-sm);
}
</style>
