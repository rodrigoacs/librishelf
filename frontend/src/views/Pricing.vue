<template>
  <div class="page pricing-container">
    <PublicBar v-if="!isAuthenticated">
      <router-link
        :to="{ name: 'login', query: { redirect: route.fullPath } }"
        class="bar-link"
      >{{ t('plan.login') }}</router-link>
    </PublicBar>

    <PageHeader
      :title="t('plan.title')"
      :subtitle="t('plan.subtitle')"
    />

    <p
      v-if="currentText"
      class="current-note"
    >{{ currentText }}</p>

    <section
      class="offers"
      aria-labelledby="pricing-offers-title"
    >
      <h2
        id="pricing-offers-title"
        class="section-title"
      >{{ t('plan.offersTitle') }}</h2>

      <AppSkeleton
        v-if="loading"
        height="220px"
      />
      <EmptyState
        v-else-if="failed"
        variant="error"
        compact
        :level="3"
        :title="t('common.loadErrorTitle')"
        @action="load"
      />
      <div
        v-else
        class="offer-grid"
      >
        <article
          v-for="offer in visibleOffers"
          :key="offer.code"
          class="offer"
          :class="{ highlighted: route.query.offer === offer.code, current: isCurrent(offer) }"
          :aria-labelledby="`offer-${offer.code}`"
        >
          <h3
            :id="`offer-${offer.code}`"
            class="offer-name"
          >{{ t(`plan.offers.${offer.code}.name`) }}</h3>
          <p class="offer-price">
            <span class="amount">{{ money(offer.priceCents) }}</span>
            <span class="period">{{ t(`plan.offers.${offer.code}.period`) }}</span>
          </p>
          <ul class="offer-points">
            <li>{{ t(`plan.offers.${offer.code}.point1`) }}</li>
            <li>{{ t(`plan.offers.${offer.code}.point2`) }}</li>
            <li
              v-if="offer.slotsTotal !== null"
              class="slots"
            >{{ offer.slotsLeft > 0 ? t('plan.slotsLeft', { n: offer.slotsLeft, total: offer.slotsTotal }) : t('plan.soldOut') }}</li>
            <li
              v-if="offer.endsAt && offer.available"
              class="slots"
            >{{ t('plan.until', { date: longDate(offer.endsAt) }) }}</li>
          </ul>
          <AppButton
            :label="buttonLabel(offer)"
            class="offer-button"
            :class="{ 'btn-outlined': offer.code !== recommended }"
            :disabled="!canBuy(offer)"
            :loading="busy === offer.code"
            @click="subscribe(offer)"
          />
        </article>
      </div>

      <div
        v-if="trialAvailable"
        class="trial"
      >
        <p>{{ t('plan.trialText') }}</p>
        <AppButton
          :label="t('plan.trialButton')"
          class="btn-outlined btn-sm"
          :loading="busy === 'trial'"
          @click="startTrial"
        />
      </div>
      <p class="fine-print">{{ t('plan.finePrint') }}</p>
    </section>

    <section
      class="features"
      aria-labelledby="pricing-pro-title"
    >
      <h2
        id="pricing-pro-title"
        class="section-title"
      >{{ t('plan.proTitle') }}</h2>
      <ul class="feature-list">
        <li
          v-for="feature in PRO_FEATURES"
          :key="feature"
          :class="{ highlighted: route.query.feature === feature }"
        >
          <span class="feature-name">
            {{ t(`pro.features.${feature}.name`) }}
            <span
              v-if="!isReady(feature)"
              class="soon"
            >{{ t('plan.soon') }}</span>
          </span>
          <span class="feature-desc">{{ t(`pro.features.${feature}.desc`) }}</span>
        </li>
      </ul>
    </section>

    <section
      class="features"
      aria-labelledby="pricing-free-title"
    >
      <h2
        id="pricing-free-title"
        class="section-title"
      >{{ t('plan.freeTitle') }}</h2>
      <p class="free-intro">{{ t('plan.freeIntro') }}</p>
      <ul class="feature-list">
        <li
          v-for="feature in FREE_FEATURES"
          :key="feature"
        >
          <span class="feature-name">
            {{ t(`plan.free.${feature}.name`) }}
            <span
              v-if="!FREE_FEATURES_READY.includes(feature)"
              class="soon"
            >{{ t('plan.soon') }}</span>
          </span>
          <span class="feature-desc">{{ t(`plan.free.${feature}.desc`) }}</span>
        </li>
      </ul>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import PageHeader from '../components/ui/PageHeader.vue'
import PublicBar from '../components/PublicBar.vue'
import AppButton from '../components/ui/AppButton.vue'
import AppSkeleton from '../components/ui/AppSkeleton.vue'
import EmptyState from '../components/ui/EmptyState.vue'
import api from '../services/api.js'
import { useToast } from '../services/toast.js'
import { isAuthenticated } from '../services/session.js'
import { plan, isReady, refresh } from '../services/plan.js'
import { PRO_FEATURES, FREE_FEATURES, FREE_FEATURES_READY, OFFER_ORDER } from '../config/plan.js'

/**
 * Preços e o que o Pro traz. Aberta para quem não entrou: o botão de assinar
 * leva ao login e volta para cá. Assinar abre o checkout do Mercado Pago.
 */
const { t, locale } = useI18n()
const route = useRoute()
const router = useRouter()
const toast = useToast()

const offers = ref([])
const loading = ref(true)
const failed = ref(false)
const busy = ref('')
const recommended = 'annual'

const tag = computed(() => (locale.value === 'en' ? 'en-US' : 'pt-BR'))
const money = cents => (cents / 100).toLocaleString(tag.value, { style: 'currency', currency: 'BRL' })
const longDate = value => new Date(value).toLocaleDateString(tag.value, { day: 'numeric', month: 'long', year: 'numeric' })

const current = computed(() => plan.value?.current ?? null)
const lifetime = computed(() => Boolean(current.value?.lifetime))
const trialAvailable = computed(() => isAuthenticated.value && Boolean(plan.value?.trial?.available) && !plan.value?.pro)

// Fundador anual pode ser renovado com a janela fechada por quem já tem um ativo
const founderRenewal = computed(() => current.value?.kind === 'founder_annual')

const visibleOffers = computed(() => OFFER_ORDER
  .map(code => offers.value.find(offer => offer.code === code))
  .filter(offer => offer && (offer.available || (offer.code === 'founder_annual' && founderRenewal.value) || isSoldOutInWindow(offer))))

function isSoldOutInWindow(offer) {
  const now = Date.now()
  const inWindow = (!offer.startsAt || new Date(offer.startsAt).getTime() <= now) && (!offer.endsAt || new Date(offer.endsAt).getTime() > now)
  return offer.slotsTotal !== null && offer.slotsLeft === 0 && inWindow
}

const isCurrent = offer => current.value?.kind === offer.code

const currentText = computed(() => {
  if (!plan.value?.pro || !current.value) return ''
  const name = t(`plan.kinds.${current.value.kind}`)
  if (current.value.lifetime) return t('plan.currentLifetime', { name })
  return t('plan.currentUntil', { name, date: longDate(current.value.endsAt) })
})

function canBuy(offer) {
  if (lifetime.value) return false
  if (offer.code === 'founder_annual' && founderRenewal.value) return true
  return offer.available
}

function buttonLabel(offer) {
  if (lifetime.value) return t('plan.haveLifetime')
  if (!offer.available && !(offer.code === 'founder_annual' && founderRenewal.value)) return t('plan.soldOut')
  if (isCurrent(offer)) return offer.code === 'monthly' ? t('plan.subscribed') : t('plan.renew')
  return offer.code === 'monthly' ? t('plan.subscribe') : t('plan.buy')
}

async function load() {
  loading.value = true
  failed.value = false
  try {
    offers.value = (await api.getOffers()).offers
  } catch {
    failed.value = true
  } finally {
    loading.value = false
  }
}

async function subscribe(offer) {
  if (!isAuthenticated.value) {
    router.push({ name: 'login', query: { redirect: `/pricing?offer=${offer.code}` } })
    return
  }
  busy.value = offer.code
  try {
    const { url } = await api.checkout(offer.code)
    window.location.assign(url)
  } catch (error) {
    toast.add({ severity: 'error', detail: error.message })
    busy.value = ''
  }
}

async function startTrial() {
  busy.value = 'trial'
  try {
    await api.startTrial()
    await refresh()
    toast.add({ severity: 'success', detail: t('pro.trialStarted') })
  } catch (error) {
    toast.add({ severity: 'error', detail: error.message })
  } finally {
    busy.value = ''
  }
}

onMounted(load)
</script>

<style scoped>
.pricing-container {
  display: flex;
  flex-direction: column;
  gap: var(--space-7);
}

.bar-link {
  color: var(--main-color);
  font-weight: 600;
  font-size: var(--fs-sm);
}

.current-note {
  margin: calc(-1 * var(--space-4)) 0 0;
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-md);
  background: rgba(var(--main-color-rgb), 0.08);
  color: var(--text-primary);
  font-size: var(--fs-sm);
}

.section-title {
  margin: 0 0 var(--space-3);
}

.offer-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--space-3);
}

@media (min-width: 640px) {
  .offer-grid {
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  }
}

.offer {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--card-pad);
  border: 1px solid var(--border-color);
  border-radius: var(--card-radius);
  background: var(--bg-panel);
}

.offer.highlighted,
.offer.current {
  border-color: var(--main-color);
}

.offer-name {
  margin: 0;
  font-size: var(--fs-md);
  color: var(--text-primary);
}

.offer-price {
  margin: 0;
  display: flex;
  align-items: baseline;
  gap: var(--space-1);
  flex-wrap: wrap;
}

.amount {
  font-size: var(--fs-xl);
  font-weight: 700;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}

.period {
  color: var(--text-secondary);
  font-size: var(--fs-sm);
}

.offer-points {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  flex: 1;
  color: var(--text-secondary);
  font-size: var(--fs-sm);
  line-height: 1.45;
}

.offer-points .slots {
  color: var(--text-primary);
  font-weight: 600;
}

.offer-button {
  width: 100%;
}

.trial {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  margin-top: var(--space-4);
  padding: var(--space-3) var(--space-4);
  border: 1px dashed var(--border-color);
  border-radius: var(--card-radius);
}

.trial p {
  margin: 0;
  color: var(--text-primary);
  font-size: var(--fs-sm);
}

.fine-print {
  margin: var(--space-3) 0 0;
  color: var(--text-secondary);
  font-size: var(--fs-xs);
  line-height: 1.5;
}

.free-intro {
  margin: 0 0 var(--space-3);
  color: var(--text-primary);
  font-size: var(--fs-sm);
}

.feature-list {
  margin: 0;
  padding: 0;
  list-style: none;
  border: 1px solid var(--border-color);
  border-radius: var(--card-radius);
  background: var(--bg-panel);
}

.feature-list li {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  padding: var(--space-3) var(--space-4);
}

.feature-list li + li {
  border-top: 1px solid var(--border-color);
}

.feature-list li.highlighted {
  background: rgba(var(--main-color-rgb), 0.06);
}

.feature-name {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--text-primary);
  font-weight: 600;
  font-size: var(--fs-sm);
}

.feature-desc {
  color: var(--text-secondary);
  font-size: var(--fs-sm);
  line-height: 1.45;
}

.soon {
  font-size: var(--fs-2xs);
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--text-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-pill);
  padding: 0 var(--space-2);
}
</style>
