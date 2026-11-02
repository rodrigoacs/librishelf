<template>
  <!-- Aviso nas telas Pro para quem não tem Pro. readonly: os dados já
       guardados continuam visíveis e só a mudança é recusada. -->
  <section
    class="pro-notice"
    :class="{ compact }"
    :aria-labelledby="titleId"
  >
    <div class="pro-notice-text">
      <h2
        :id="titleId"
        class="section-title"
      >{{ t('pro.notice.title') }}</h2>
      <p class="pro-notice-body">{{ readonly ? t('pro.notice.readonly') : t(`pro.features.${feature}.desc`) }}</p>
      <p
        v-if="endedAt"
        class="pro-notice-ended"
      >{{ t('pro.notice.ended', { date: endedAt }) }}</p>
    </div>
    <div class="pro-notice-actions">
      <AppButton
        v-if="trialAvailable"
        :label="t('pro.notice.trial')"
        class="btn-sm"
        :loading="activating"
        @click="startTrial"
      />
      <router-link
        :to="{ name: 'pricing', query: { feature } }"
        class="pro-notice-link"
      >{{ t('pro.notice.plans') }}</router-link>
    </div>
  </section>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import AppButton from './ui/AppButton.vue'
import api from '../services/api.js'
import { useToast } from '../services/toast.js'
import { plan, refresh } from '../services/plan.js'

/**
 * Uso nos pacotes dos recursos Pro:
 *   <ProNotice v-if="!canUse('collector')" feature="collector" readonly />
 */
defineProps({
  feature: { type: String, required: true },
  readonly: { type: Boolean, default: false },
  compact: { type: Boolean, default: false }
})

const { t, locale } = useI18n()
const toast = useToast()
const activating = ref(false)
const titleId = `pro-notice-${Math.random().toString(36).slice(2, 8)}`

const trialAvailable = computed(() => Boolean(plan.value?.trial?.available) && !plan.value?.pro)
const endedAt = computed(() => {
  const value = plan.value?.endedAt
  if (!value || plan.value?.pro) return ''
  return new Date(value).toLocaleDateString(locale.value === 'en' ? 'en-US' : 'pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })
})

async function startTrial() {
  activating.value = true
  try {
    await api.startTrial()
    await refresh()
    toast.add({ severity: 'success', detail: t('pro.trialStarted') })
  } catch (error) {
    toast.add({ severity: 'error', detail: error.message })
  } finally {
    activating.value = false
  }
}

</script>

<style scoped>
.pro-notice {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3) var(--space-5);
  padding: var(--space-4) var(--space-5);
  border: 1px solid var(--border-color);
  border-left: 3px solid var(--main-color);
  border-radius: var(--card-radius);
  background: var(--bg-panel);
}

.pro-notice.compact {
  padding: var(--space-3) var(--space-4);
}

.pro-notice-text {
  flex: 1 1 18rem;
  min-width: 0;
}

.section-title {
  margin: 0 0 var(--space-1);
}

.pro-notice-body,
.pro-notice-ended {
  margin: 0;
  color: var(--text-primary);
  font-size: var(--fs-sm);
  line-height: 1.5;
}

.pro-notice-ended {
  margin-top: var(--space-1);
  color: var(--text-secondary);
}

.pro-notice-actions {
  display: flex;
  align-items: center;
  gap: var(--space-4);
}

.pro-notice-link {
  color: var(--main-color);
  font-size: var(--fs-sm);
  font-weight: 600;
  white-space: nowrap;
}

.pro-notice-link:focus-visible {
  outline: var(--focus-ring);
  outline-offset: var(--focus-offset);
  border-radius: var(--radius-sm);
}
</style>
