<template>
  <div
    v-if="isOffline"
    class="offline-banner"
    role="status"
  >
    <i
      class="pi pi-wifi"
      aria-hidden="true"
    ></i>
    <p>
      <strong>{{ t('offline.title') }}</strong>
      {{ t('offline.text') }}
    </p>
  </div>
</template>

<script setup>
import { useI18n } from 'vue-i18n'
import { isOffline } from '../services/network.js'

/**
 * Aviso no topo sem internet: o app mostra o que já tinha visto (guardado
 * pelo service worker) e não dá para cadastrar nem alterar nada.
 */
const { t } = useI18n()
</script>

<style scoped>
.offline-banner {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-5);
  background: color-mix(in srgb, var(--warning) 12%, transparent);
  border-bottom: 1px solid color-mix(in srgb, var(--warning) 40%, transparent);
  color: var(--text-primary);
  font-size: var(--fs-sm);
}

.offline-banner > .pi {
  color: var(--warning);
  position: relative;
}

/* Wi-Fi riscado */
.offline-banner > .pi::after {
  content: '';
  position: absolute;
  left: 50%;
  top: 50%;
  width: 1.3em;
  height: 2px;
  background: currentColor;
  transform: translate(-50%, -50%) rotate(-45deg);
  border-radius: 1px;
}

.offline-banner p {
  margin: 0;
  flex: 1;
  min-width: 0;
  line-height: 1.4;
}

.offline-banner strong {
  margin-right: var(--space-1);
}

@media (max-width: 639.98px) {
  .offline-banner {
    padding: var(--space-2) var(--space-4);
  }
}
</style>
