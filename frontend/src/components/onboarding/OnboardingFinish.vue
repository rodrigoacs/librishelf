<template>
  <OnboardingStep
    title-id="onb-finish-title"
    :title="t('onboarding.finish.title')"
    :text="t('onboarding.finish.text')"
    :next-label="t('onboarding.finish.go')"
    :busy="busy"
    @back="emit('back')"
    @next="emit('done')"
  >
    <!-- Vanguarda: as 100 primeiras contas com 10 livros (só enquanto houver vaga) -->
    <div
      v-if="vanguarda.has"
      class="onb-vanguarda"
    >
      <VanguardaBadge />
      <p>{{ t('onboarding.finish.vanguardaHas') }}</p>
    </div>
    <div
      v-else-if="vanguarda.open"
      class="onb-vanguarda"
    >
      <VanguardaBadge />
      <p>{{ t('onboarding.finish.vanguardaText', { n: vanguarda.minBooks }) }}</p>
      <ProgressBar
        :value="Math.min(books, vanguarda.minBooks)"
        :max="vanguarda.minBooks"
        :label="t('onboarding.finish.vanguardaLabel')"
        :value-text="leftText"
      />
      <p
        class="onb-meter-text"
        role="status"
      >{{ leftText }}</p>
      <p
        v-if="vanguarda.slotsLeft !== null"
        class="onb-hint"
      >{{ t('onboarding.finish.slots', { n: vanguarda.slotsLeft }, vanguarda.slotsLeft) }}</p>
    </div>

  </OnboardingStep>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import ProgressBar from '../ui/ProgressBar.vue'
import VanguardaBadge from '../VanguardaBadge.vue'
import OnboardingStep from './OnboardingStep.vue'
import { booksLeft } from '../../utils/onboarding.js'

/** Passo 4: pronto, e quanto falta para o Vanguarda (10 livros). */
const props = defineProps({
  books: { type: Number, default: 0 },
  vanguarda: { type: Object, required: true },
  busy: { type: Boolean, default: false }
})
const emit = defineEmits(['done', 'back'])

const { t } = useI18n()

const leftText = computed(() => {
  const left = booksLeft(props.books, props.vanguarda.minBooks)
  return left ? t('onboarding.finish.vanguardaLeft', { n: left }, left) : t('onboarding.finish.vanguardaSoon')
})
</script>

<style scoped>
.onb-vanguarda {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-2);
  padding: var(--space-4);
  border-radius: var(--card-radius);
  background: rgba(var(--main-color-rgb), 0.08);
}

.onb-vanguarda > p:not([class]) {
  margin: 0;
  line-height: 1.5;
}

.onb-vanguarda > .progress-bar {
  align-self: stretch;
}
</style>
