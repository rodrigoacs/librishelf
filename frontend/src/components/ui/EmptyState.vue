<template>
  <div
    class="empty-state-box"
    :class="[`is-${variant}`, { compact }]"
    :role="variant === 'error' ? 'alert' : undefined"
  >
    <slot name="media">
      <span
        class="empty-state-icon"
        aria-hidden="true"
      >
        <i :class="iconClass"></i>
      </span>
    </slot>
    <component
      :is="headingTag"
      class="empty-state-title"
    >{{ titleText }}</component>
    <p
      v-if="textValue"
      class="empty-state-text"
    >{{ textValue }}</p>
    <div
      v-if="$slots.action || actionLabelText"
      class="empty-state-action"
    >
      <slot name="action">
        <AppButton
          :label="actionLabelText"
          :icon="actionIconClass"
          :class="actionClassValue"
          :loading="loading"
          :disabled="actionDisabled"
          @click="emit('action')"
        />
      </slot>
    </div>
    <slot />
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import AppButton from './AppButton.vue'

/**
 * Estado vazio ou de erro, o mesmo em todas as telas: ícone, título, uma
 * frase do que fazer e uma ação.
 *
 *   <EmptyState icon="pi pi-book" :title="…" :text="…" :action-label="…" @action="…" />
 *   <EmptyState variant="error" :title="t('lists.loadFailed')" :loading="retrying" @action="reload" />
 *
 * A variante de erro tem role="alert" e, sem outra ação, "Tentar de novo".
 * Os textos vêm traduzidos (nunca o detail cru do servidor).
 */
const props = defineProps({
  variant: { type: String, default: 'empty' }, // empty | error
  icon: { type: String, default: '' },
  title: { type: String, default: '' },
  text: { type: String, default: '' },
  actionLabel: { type: String, default: '' },
  actionIcon: { type: String, default: '' },
  actionClass: { type: String, default: '' },
  // Erro sem ação (ex.: só informar): :retry="false"
  retry: { type: Boolean, default: true },
  loading: { type: Boolean, default: false },
  actionDisabled: { type: Boolean, default: false },
  // Nível do título: h2 numa tela, h3 dentro de uma seção, h1 quando é a página toda
  level: { type: Number, default: 2 },
  // Menor, para dentro de uma seção, aba ou painel
  compact: { type: Boolean, default: false }
})
const emit = defineEmits(['action'])
const { t } = useI18n()

const isError = computed(() => props.variant === 'error')
const iconClass = computed(() => props.icon || (isError.value ? 'pi pi-exclamation-triangle' : 'pi pi-inbox'))
const headingTag = computed(() => `h${Math.min(6, Math.max(1, props.level))}`)
const titleText = computed(() => props.title || (isError.value ? t('common.loadErrorTitle') : ''))
const textValue = computed(() => props.text || (isError.value ? t('common.loadErrorHint') : ''))
const actionLabelText = computed(() => props.actionLabel || (isError.value && props.retry ? t('common.retry') : ''))
const actionIconClass = computed(() => props.actionIcon || (isError.value && !props.actionLabel ? 'pi pi-refresh' : undefined))
const actionClassValue = computed(() => props.actionClass || (isError.value ? 'btn-outlined btn-secondary' : 'btn-primary'))
</script>

<style scoped>
.empty-state-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  min-height: 40vh;
  padding: 3rem 1rem;
  text-align: center;
  color: var(--text-secondary);
}

.empty-state-box.compact {
  min-height: 0;
  padding: 2rem 1rem;
}

.empty-state-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 88px;
  height: 88px;
  margin-bottom: 0.75rem;
  border-radius: 50%;
  background-color: var(--bg-panel);
  border: 1px solid var(--border-color);
}

.empty-state-icon .pi {
  font-size: var(--fs-2xl);
  opacity: 0.6;
}

.compact .empty-state-icon {
  width: 56px;
  height: 56px;
  margin-bottom: 0.4rem;
}

.compact .empty-state-icon .pi {
  font-size: var(--fs-lg);
}

.is-error .empty-state-icon .pi {
  color: var(--warning);
  opacity: 1;
}

.empty-state-title {
  margin: 0;
  max-width: 32rem;
  font-size: var(--fs-xl);
  font-weight: 700;
  color: var(--text-primary);
  overflow-wrap: break-word;
}

.compact .empty-state-title {
  font-size: var(--fs-lg);
}

.empty-state-text {
  margin: 0;
  max-width: 28rem;
  line-height: 1.5;
  font-size: var(--fs-md);
}

.empty-state-action {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.5rem;
  margin-top: 0.75rem;
}
</style>
