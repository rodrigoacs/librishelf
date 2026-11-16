<template>
  <section
    class="onb-step"
    :aria-labelledby="titleId"
  >
    <h1 :id="titleId">{{ title }}</h1>
    <p class="onb-lead">{{ text }}</p>

    <slot></slot>

    <div class="onb-nav">
      <button
        v-if="back"
        type="button"
        class="link-btn tall"
        @click="emit('back')"
      >{{ t('onboarding.back') }}</button>
      <AppButton
        v-if="nextLabel"
        :label="nextLabel"
        :class="nextClass"
        :loading="busy"
        @click="emit('next')"
      />
    </div>
  </section>
</template>

<script setup>
import { useI18n } from 'vue-i18n'
import AppButton from '../ui/AppButton.vue'

/**
 * Casca de cada passo do onboarding: título, texto, o conteúdo e a
 * navegação (Voltar e o botão de seguir). Estilos comuns dos passos aqui.
 */
defineProps({
  titleId: { type: String, required: true },
  title: { type: String, required: true },
  text: { type: String, default: '' },
  back: { type: Boolean, default: true },
  nextLabel: { type: String, default: '' },
  nextClass: { type: String, default: 'btn-primary' },
  busy: { type: Boolean, default: false }
})
const emit = defineEmits(['back', 'next'])

const { t } = useI18n()
</script>

<style scoped>
.onb-step {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

h1 {
  margin: 0;
  font-size: var(--fs-2xl);
}

.onb-lead {
  margin: calc(-1 * var(--space-2)) 0 0;
  color: var(--text-secondary);
  line-height: 1.5;
}

.onb-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  margin-top: var(--space-2);
}

.onb-nav > :only-child {
  margin-left: auto;
}

:slotted(.onb-meter-text),
:slotted(.onb-hint) {
  margin: 0;
  color: var(--text-secondary);
  font-size: var(--fs-sm);
}

:slotted(.onb-actions) {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

@media (max-width: 639.98px) {
  :slotted(.onb-actions) > * {
    flex: 1 1 100%;
  }
}
</style>
