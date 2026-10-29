<template>
  <AuthLayout
    title="Librishelf"
    :subtitle="t('moderation.subtitle')"
  >
    <div
      class="header"
      role="status"
    >
      <h1>{{ heading }}</h1>
      <p
        v-if="message"
        class="subtitle"
      >{{ message }}</p>
    </div>

    <template v-if="data">
      <p
        class="state"
        :class="data.review.hidden ? 'hidden' : 'visible'"
      >
        <i
          :class="data.review.hidden ? 'pi pi-eye-slash' : 'pi pi-eye'"
          aria-hidden="true"
        ></i>
        {{ data.review.hidden
          ? t(data.review.hiddenReason === 'reports' ? 'moderation.hiddenAuto' : 'moderation.hiddenManual')
          : t('moderation.visible') }}
      </p>

      <div class="review-box">
        <p
          v-if="data.review.hasSpoiler"
          class="flag"
        >{{ t('moderation.markedSpoiler') }}</p>
        <ReviewCard
          :review="data.review"
          show-book
          show-author
          plain
        />
      </div>

      <section
        class="reports"
        :aria-label="t('moderation.reports')"
      >
        <h2>{{ t('moderation.reportsCount', { n: data.reports.length }, data.reports.length) }}</h2>
        <ul>
          <li
            v-for="(report, index) in data.reports"
            :key="index"
          >
            <span class="reason">{{ t(`review.reasons.${report.reason}`) }}</span>
            <span class="by">{{ report.reporter ? `@${report.reporter} · ` : '' }}{{ formatDate(report.createdAt) }}</span>
            <p
              v-if="report.note"
              class="note"
            >{{ report.note }}</p>
          </li>
        </ul>
      </section>

      <div class="auth-form">
        <AppButton
          v-if="!data.review.hidden"
          :label="t('moderation.hide')"
          icon="pi pi-eye-slash"
          class="btn-danger w-full"
          :loading="busy === 'hide'"
          :disabled="Boolean(busy)"
          @click="act(true)"
        />
        <AppButton
          :label="data.review.hidden ? t('moderation.restore') : t('moderation.keep')"
          icon="pi pi-check"
          :class="data.review.hidden ? 'btn-primary w-full' : 'btn-outlined btn-secondary w-full'"
          :loading="busy === 'show'"
          :disabled="Boolean(busy)"
          @click="act(false)"
        />
        <p class="hint">{{ t('moderation.keepHint') }}</p>
      </div>
    </template>
  </AuthLayout>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import AppButton from '../components/ui/AppButton.vue'
import AuthLayout from '../components/AuthLayout.vue'
import ReviewCard from '../components/review/ReviewCard.vue'
import api from '../services/api.js'
import { useToast } from '../services/toast.js'

/**
 * Link do e-mail de denúncia (vai para ADMIN_EMAIL): mostra a resenha e as
 * denúncias e deixa ocultar ou manter. Sem login — o token assinado só vale
 * para esta resenha.
 */
const { t, locale } = useI18n()
const route = useRoute()
const router = useRouter()
const toast = useToast()

const state = ref('loading') // loading | ready | failed
const errorMessage = ref('')
const data = ref(null)
const busy = ref('')
let token = ''

const heading = computed(() => ({
  loading: t('moderation.loading'),
  ready: t('moderation.title'),
  failed: t('moderation.failedTitle')
}[state.value]))

const message = computed(() => (state.value === 'failed' ? errorMessage.value : ''))

function formatDate(value) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString(locale.value, { dateStyle: 'short', timeStyle: 'short' })
}

async function act(hide) {
  busy.value = hide ? 'hide' : 'show'
  try {
    data.value = await api.moderateReview(token, hide)
    toast.add({ severity: 'success', summary: hide ? t('moderation.hiddenDone') : t('moderation.keptDone'), life: 3000 })
  } catch (error) {
    toast.add({ severity: 'error', detail: error.message, life: 4000 })
  } finally {
    busy.value = ''
  }
}

onMounted(async () => {
  token = String(route.query.token || '')
  // Tira o token da barra de endereço/histórico (o link do e-mail continua valendo)
  router.replace({ query: {} })
  try {
    data.value = await api.getModeration(token)
    state.value = 'ready'
  } catch (error) {
    errorMessage.value = error.message
    state.value = 'failed'
  }
})
</script>

<style scoped>
.state {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0 0 1rem;
  padding: 0.6rem 0.8rem;
  border-radius: 8px;
  font-size: var(--fs-sm);
  font-weight: 600;
}

.state.visible {
  background: rgba(var(--green-rgb), 0.12);
  color: var(--green);
}

.state.hidden {
  background: rgba(var(--orange-rgb), 0.14);
  color: var(--orange);
}

.review-box {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  text-align: left;
}

.flag {
  margin: 0;
  font-size: var(--fs-xs);
  color: var(--text-secondary);
}

.reports {
  margin-top: 1.25rem;
  text-align: left;
}

.reports h2 {
  margin: 0 0 0.5rem;
  font-size: var(--fs-sm);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
}

.reports ul {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.reports li {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.25rem 0.6rem;
  padding: 0.6rem 0.75rem;
  border: 1px solid var(--border-color);
  border-radius: 8px;
}

.reason {
  font-weight: 600;
  font-size: var(--fs-sm);
}

.by {
  color: var(--text-muted);
  font-size: var(--fs-xs);
}

.note {
  flex-basis: 100%;
  margin: 0.2rem 0 0;
  white-space: pre-line;
  overflow-wrap: anywhere;
  font-size: var(--fs-sm);
  color: var(--text-secondary);
}

.auth-form {
  margin-top: 1.25rem;
}

.hint {
  margin: 0;
  font-size: var(--fs-xs);
  color: var(--text-muted);
  text-align: center;
}
</style>
