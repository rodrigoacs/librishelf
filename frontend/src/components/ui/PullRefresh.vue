<template>
  <!-- Indicador do puxar para atualizar (usePullToRefresh). Só aparece no celular. -->
  <div
    class="pull-refresh"
    :class="[`is-${state.status.value}`, { 'is-dragging': state.dragging.value }]"
    :style="{ '--pull': `${state.offset.value}px`, '--pull-progress': state.progress.value }"
    aria-hidden="true"
  >
    <span class="pull-disc">
      <i class="pi pi-refresh"></i>
    </span>
  </div>
  <p
    class="sr-only"
    role="status"
  >
    {{ state.status.value === 'refreshing' ? t('pullRefresh.refreshing') : state.status.value === 'done' ? t('pullRefresh.done') : '' }}
  </p>
</template>

<script setup>
import { useI18n } from 'vue-i18n'

defineProps({
  // O que usePullToRefresh() devolve
  state: { type: Object, required: true }
})

const { t } = useI18n()
</script>

<style scoped>
.pull-refresh {
  display: none;
}

@media (max-width: 639.98px) {
  .pull-refresh {
    position: fixed;
    top: calc(var(--app-bar-height, 57px) - 44px);
    left: 50%;
    z-index: 90;
    display: block;
    pointer-events: none;
    opacity: min(1, calc(var(--pull-progress) * 1.6));
    transform: translate3d(-50%, var(--pull), 0);
    transition: transform var(--dur-medium) var(--ease-standard), opacity var(--dur-medium) var(--ease-standard);
  }

  /* Seguindo o dedo: sem transição (senão o indicador fica para trás) */
  .pull-refresh.is-dragging {
    transition: none;
  }

  .pull-disc {
    display: grid;
    place-items: center;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: var(--bg-panel);
    border: 1px solid var(--border-color);
    box-shadow: var(--shadow-2);
    color: var(--main-color);
  }

  .pull-disc i {
    font-size: 1.1rem;
    transform: rotate(calc(var(--pull-progress) * 300deg));
    transition: transform var(--dur-short) linear;
  }

  /* Armado: o ícone completa a volta e fica na cor de destaque cheia */
  .is-armed .pull-disc {
    background: var(--main-solid);
    border-color: var(--main-solid);
    color: var(--on-main);
    transition: background-color var(--dur-short) linear;
  }

  .is-refreshing .pull-disc {
    background: var(--main-solid);
    border-color: var(--main-solid);
    color: var(--on-main);
  }

  .is-refreshing .pull-disc i {
    animation: pull-spin 0.8s linear infinite;
  }
}

@keyframes pull-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@media (prefers-reduced-motion: reduce) {
  .pull-refresh,
  .pull-disc i {
    transition: none;
  }

  .is-refreshing .pull-disc i {
    animation: none;
  }
}
</style>
