<template>
  <OnboardingStep
    title-id="onb-public-title"
    :title="t('onboarding.public.title')"
    :text="t('onboarding.public.text')"
    :next-label="t('onboarding.next')"
    :busy="busy"
    @back="emit('back')"
    @next="emit('next')"
  >
    <!-- Prévia: o que quem abrir o link vai ver -->
    <figure class="onb-preview">
      <figcaption class="section-title">{{ t('onboarding.public.preview') }}</figcaption>
      <div class="onb-preview-card">
        <ReaderAvatar
          :username="username"
          :avatar="avatar"
          size="md"
        />
        <div class="onb-preview-text">
          <p class="onb-preview-name">{{ t('publicLibrary.title', { ownerName: username }) }}</p>
          <p class="onb-preview-meta">{{ t('publicPage.counts.books', { n: books }, books) }} · {{ url }}</p>
        </div>
      </div>
      <p class="onb-preview-note">{{ t('onboarding.public.visible') }}</p>
    </figure>

    <div class="onb-switch">
      <label
        for="onb-public"
        class="onb-switch-label"
      >{{ t('onboarding.public.switch') }}</label>
      <AppSwitch
        input-id="onb-public"
        :model-value="isPublic"
        :disabled="busy"
        @update:model-value="value => emit('toggle', value)"
      />
    </div>
    <p class="onb-hint">{{ t('onboarding.public.later') }}</p>
  </OnboardingStep>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import AppSwitch from '../ui/AppSwitch.vue'
import ReaderAvatar from '../ReaderAvatar.vue'
import OnboardingStep from './OnboardingStep.vue'

/** Passo 3 (opcional): ligar a biblioteca pública, com a prévia do link. */
const props = defineProps({
  username: { type: String, required: true },
  avatar: { type: Number, default: null },
  books: { type: Number, default: 0 },
  isPublic: { type: Boolean, default: false },
  busy: { type: Boolean, default: false }
})
const emit = defineEmits(['toggle', 'next', 'back'])

const { t } = useI18n()
const url = computed(() => `${window.location.host}/u/${props.username}`)
</script>

<style scoped>
.onb-preview {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin: 0;
}

.onb-preview-card {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-4);
  border: 1px solid var(--border-color);
  border-radius: var(--card-radius);
  background: var(--bg-panel);
}

.onb-preview-text {
  min-width: 0;
}

.onb-preview-name {
  margin: 0;
  font-family: var(--font-display);
  font-weight: 700;
}

.onb-preview-meta,
.onb-preview-note {
  margin: 0;
  color: var(--text-secondary);
  font-size: var(--fs-sm);
  overflow-wrap: anywhere;
}

.onb-switch {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}

.onb-switch-label {
  font-weight: 600;
}
</style>
