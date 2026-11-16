<template>
  <AuthLayout
    title="Librishelf"
    :subtitle="t('onboarding.visual')"
  >
    <div class="onboarding">
      <div class="onb-top">
        <p class="onb-count">{{ t('onboarding.stepOf', { n: stepNumber(step), total: STEPS.length }) }}</p>
        <button
          v-if="step !== 'finish'"
          type="button"
          class="link-btn muted"
          :disabled="busy"
          @click="skip"
        >{{ t('onboarding.skip') }}</button>
      </div>
      <ProgressBar
        :value="stepNumber(step)"
        :max="STEPS.length"
        :label="t('onboarding.progress')"
        size="xs"
      />

      <EmptyState
        v-if="failed"
        variant="error"
        compact
        :title="t('onboarding.failed')"
        @action="load"
      />

      <p
        v-else-if="!state"
        class="onb-loading"
        role="status"
      >{{ t('common.loading') }}</p>

      <OnboardingStart
        v-else-if="step === 'start'"
        :start="state.start"
        :busy="busy"
        @choose="choose"
      />
      <OnboardingBooks
        v-else-if="step === 'books'"
        :start="state.start"
        :books="state.books"
        :first-books="state.firstBooks"
        :busy="busy"
        @added="refresh"
        @back="go(-1)"
        @next="go(1)"
      />
      <OnboardingPublic
        v-else-if="step === 'public'"
        :username="user?.name || ''"
        :avatar="user?.avatarVersion ?? null"
        :books="state.books"
        :is-public="state.isPublic"
        :busy="busy"
        @toggle="setPublic"
        @back="go(-1)"
        @next="go(1)"
      />
      <OnboardingFinish
        v-else
        :books="state.books"
        :vanguarda="state.vanguarda"
        :busy="busy"
        @back="go(-1)"
        @done="finish"
      />
    </div>
  </AuthLayout>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import AuthLayout from '../components/AuthLayout.vue'
import EmptyState from '../components/ui/EmptyState.vue'
import ProgressBar from '../components/ui/ProgressBar.vue'
import OnboardingStart from '../components/onboarding/OnboardingStart.vue'
import OnboardingBooks from '../components/onboarding/OnboardingBooks.vue'
import OnboardingPublic from '../components/onboarding/OnboardingPublic.vue'
import OnboardingFinish from '../components/onboarding/OnboardingFinish.vue'
import api from '../services/api.js'
import { currentUser, updateUser } from '../services/session.js'
import { useToast } from '../services/toast.js'
import { STEPS, stepAfter, stepNumber } from '../utils/onboarding.js'

/**
 * Primeiros passos (pacote 42): como começar, os 3 primeiros livros, a
 * biblioteca pública (opcional) e o caminho até o Vanguarda. O passo fica no
 * servidor: pular e voltar depois (aviso no Início) retoma de onde parou.
 */
const { t } = useI18n()
const router = useRouter()
const toast = useToast()

const user = currentUser
const state = ref(null)
const failed = ref(false)
const busy = ref(false)
const step = computed(() => state.value?.step ?? 'start')

function keep(result) {
  state.value = result
  updateUser({ onboarding: { status: result.status, step: result.step, start: result.start } })
}

async function save(changes) {
  busy.value = true
  try {
    keep(await api.updateOnboarding(changes))
    return true
  } catch (error) {
    toast.add({ severity: 'error', detail: error.message, life: 4000 })
    return false
  } finally {
    busy.value = false
  }
}

async function load() {
  failed.value = false
  try {
    const result = await api.getOnboarding()
    // Voltou depois de pular: retoma no mesmo passo
    if (result.status === 'skipped') return keep(await api.updateOnboarding({ status: 'pending' }))
    keep(result)
  } catch {
    failed.value = true
  }
}

// Livro novo: só os números mudam (o passo continua)
async function refresh() {
  try {
    keep(await api.getOnboarding())
  } catch {
    // o contador fica como estava
  }
}

const choose = start => save({ start, step: 'books' })
const go = offset => save({ step: stepAfter(step.value, offset) })

async function setPublic(isPublic) {
  busy.value = true
  try {
    await api.setPrivacy({ isPublic })
    state.value = { ...state.value, isPublic }
    updateUser({ isPublic })
  } catch (error) {
    toast.add({ severity: 'error', detail: error.message, life: 4000 })
  } finally {
    busy.value = false
  }
}

async function skip() {
  if (await save({ status: 'skipped' })) router.replace({ name: 'home' })
}

async function finish() {
  if (await save({ status: 'done', step: 'finish' })) router.replace({ name: 'home' })
}

onMounted(load)
</script>

<style scoped>
.onboarding {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.onb-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}

.onb-count {
  margin: 0;
  color: var(--text-secondary);
  font-size: var(--fs-sm);
  font-weight: 600;
}

.onb-loading {
  margin: 0;
  color: var(--text-secondary);
}
</style>
