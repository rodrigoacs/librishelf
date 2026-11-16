<template>
  <section class="panel">
    <slot></slot>
  </section>
</template>

<script setup>
/** Cartão de seção do "Seu ano em livros" (meta, mês a mês, melhores…). */
</script>

<style scoped>
.panel {
  padding: var(--card-pad);
  border: 1px solid var(--border-color);
  border-radius: var(--card-radius);
  background: var(--bg-panel);
  min-width: 0;
}

/* Seletor curto de propósito: as seções ajustam o próprio título
   (.panel-head h2, .story-text h2) sem disputa de especificidade */
:slotted(h2) {
  margin: 0 0 var(--space-3);
}

:slotted(.muted) {
  color: var(--text-muted);
}

@media (max-width: 639.98px) {
  .panel {
    padding: var(--space-4);
  }
}
</style>
