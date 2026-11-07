<template>
  <!-- Selo das 100 primeiras contas com registro efetivo -->
  <span
    class="vanguarda-badge"
    :title="t('pro.vanguarda.hint')"
  >
    <i
      class="pi pi-flag-fill"
      aria-hidden="true"
    ></i>
    {{ t('pro.vanguarda.label') }}
    <span class="sr-only">: {{ t('pro.vanguarda.hint') }}</span>
  </span>
</template>

<script setup>
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
</script>

<style scoped>
.vanguarda-badge {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: 0 var(--space-2);
  border: 1px solid rgba(var(--main-color-rgb), 0.45);
  border-radius: var(--radius-pill);
  color: var(--text-primary);
  font-size: var(--fs-xs);
  font-weight: 600;
  letter-spacing: 0.02em;
  line-height: 1.6;
  white-space: nowrap;
  vertical-align: middle;
  /* Dentro de coluna flex (Conta): não estica */
  align-self: flex-start;
  width: fit-content;
}

.vanguarda-badge .pi {
  font-size: var(--fs-2xs);
  color: var(--main-color);
}
</style>
