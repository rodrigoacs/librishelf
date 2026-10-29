<template>
  <details class="chart-data">
    <summary>{{ t('dashboard.showData') }}</summary>
    <table>
      <caption class="sr-only">{{ caption }}</caption>
      <thead>
        <tr>
          <th scope="col">{{ labelHeader }}</th>
          <th scope="col">{{ valueHeader }}</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="row in rows"
          :key="row.label"
        >
          <th scope="row">{{ row.label }}</th>
          <td>{{ row.value }}</td>
        </tr>
      </tbody>
    </table>
  </details>
</template>

<script setup>
import { useI18n } from 'vue-i18n'

/**
 * Os números de um gráfico em tabela, dentro de <details>: para leitor de tela
 * (o canvas só tem o resumo no aria-label) e para quem prefere ler os valores.
 */
defineProps({
  caption: { type: String, required: true },
  labelHeader: { type: String, required: true },
  valueHeader: { type: String, required: true },
  rows: { type: Array, required: true } // [{ label, value }]
})

const { t } = useI18n()
</script>

<style scoped>
.chart-data {
  margin-top: 0.5rem;
  font-size: var(--fs-sm);
  color: var(--text-muted);
}

.chart-data summary {
  cursor: pointer;
  width: fit-content;
  min-height: 24px;
  border-radius: 4px;
}

@media (pointer: coarse) {
  .chart-data summary {
    display: flex;
    align-items: center;
    min-height: 44px;
  }
}

.chart-data summary:focus-visible {
  outline: var(--focus-ring);
  outline-offset: var(--focus-offset);
}

.chart-data table {
  margin-top: 0.5rem;
  border-collapse: collapse;
  width: 100%;
  max-width: 320px;
}

.chart-data th,
.chart-data td {
  padding: 0.25rem 0.5rem;
  text-align: left;
  border-bottom: 1px solid var(--border-color);
  font-weight: 400;
}

.chart-data thead th {
  font-weight: 600;
  color: var(--text-primary);
}

.chart-data td {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
</style>
