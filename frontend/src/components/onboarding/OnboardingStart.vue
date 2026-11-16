<template>
  <OnboardingStep
    title-id="onb-start-title"
    :title="t('onboarding.start.title')"
    :text="t('onboarding.start.text')"
    :back="false"
  >
    <div
      class="onb-choices"
      role="radiogroup"
      :aria-label="t('onboarding.start.title')"
    >
      <OnboardingChoice
        v-for="option in OPTIONS"
        :key="option.value"
        :icon="option.icon"
        :title="t(`onboarding.start.${option.value}`)"
        :text="t(`onboarding.start.${option.value}Text`)"
        :active="start === option.value"
        :disabled="busy"
        @select="emit('choose', option.value)"
      />
    </div>
  </OnboardingStep>
</template>

<script setup>
import { useI18n } from 'vue-i18n'
import OnboardingChoice from './OnboardingChoice.vue'
import OnboardingStep from './OnboardingStep.vue'

/** Passo 1: como prefere começar (importar, código de barras ou busca). */
defineProps({
  start: { type: String, default: null },
  busy: { type: Boolean, default: false }
})
const emit = defineEmits(['choose'])

const OPTIONS = [
  { value: 'import', icon: 'pi pi-file-import' },
  { value: 'scan', icon: 'pi pi-barcode' },
  { value: 'search', icon: 'pi pi-search' }
]

const { t } = useI18n()
</script>

<style scoped>
.onb-choices {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
</style>
