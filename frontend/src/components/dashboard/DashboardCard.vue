<template>
  <div class="chart-card">
    <h3 class="section-title">{{ title }}</h3>
    <p
      v-if="hint"
      class="chart-hint"
    >{{ hint }}</p>
    <div :class="list ? 'card-list' : 'chart-wrapper'">
      <div
        v-if="empty"
        class="no-data"
      >{{ empty }}</div>
      <slot v-else />
    </div>
    <slot name="after" />
  </div>
</template>

<script setup>
/**
 * Cartão do Painel: título, dica opcional e o corpo (gráfico ou lista).
 *   empty: texto quando não há dados (no lugar do slot)
 *   list:  corpo em lista (ranking) em vez da área de altura fixa do gráfico
 *   #after: abaixo do corpo (a tabela de dados do gráfico)
 * A altura do gráfico vem de --chart-height (a grade do Painel define).
 */
defineProps({
  title: { type: String, required: true },
  hint: { type: String, default: '' },
  empty: { type: String, default: '' },
  list: { type: Boolean, default: false }
})
</script>

<style scoped>
.chart-card {
  min-width: 0;
  background-color: var(--bg-panel);
  border: 1px solid var(--border-color);
  border-radius: var(--card-radius);
  padding: var(--card-pad);
  display: flex;
  flex-direction: column;
}

.chart-card h3 {
  margin: 0 0 var(--space-6) 0;
}

.chart-hint {
  margin: -1rem 0 var(--space-4);
  color: var(--text-secondary);
  font-size: var(--fs-sm);
}

.chart-wrapper {
  flex: 0 0 auto;
  position: relative;
  height: var(--chart-height, 280px);
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.card-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.no-data {
  color: var(--text-secondary);
  font-style: italic;
}

@media (max-width: 639.98px) {
  .chart-card {
    padding: var(--space-4);
  }
}
</style>
