<template>
  <span
    class="app-skeleton"
    :style="{ width, height, borderRadius }"
    aria-hidden="true"
  ></span>
</template>

<script setup>
/** Bloco cinza com brilho enquanto carrega (no lugar do Skeleton do PrimeVue). */
defineProps({
  width: { type: String, default: '100%' },
  height: { type: String, default: '1rem' },
  borderRadius: { type: String, default: 'var(--radius-md)' }
})
</script>

<style scoped>
.app-skeleton {
  display: block;
  position: relative;
  overflow: hidden;
  background: var(--bg-input);
}

.app-skeleton::after {
  content: '';
  position: absolute;
  inset: 0;
  transform: translateX(-100%);
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.06), transparent);
  animation: app-skeleton-shine 1.4s ease-in-out infinite;
}

[data-theme="light"] .app-skeleton::after {
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.55), transparent);
}

@keyframes app-skeleton-shine {
  to {
    transform: translateX(100%);
  }
}

@media (prefers-reduced-motion: reduce) {
  .app-skeleton::after {
    animation: none;
  }
}
</style>
