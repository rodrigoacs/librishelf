<template>
  <!-- Mês a mês -->
  <YearPanel>
    <h2 class="section-title">{{ t('year.byMonth') }}</h2>
    <p
      v-if="busiestMonth"
      class="panel-sub"
    >{{ t('year.busiest', { month: monthName(busiestMonth.month), n: busiestMonth.count }, busiestMonth.count) }}</p>
    <ol class="months">
      <li
        v-for="(count, index) in months"
        :key="index"
        :class="{ peak: busiestMonth && index + 1 === busiestMonth.month, future: isFuture(index) }"
      >
        <span class="month-count">{{ count || '' }}</span>
        <span
          class="month-bar"
          :style="{ height: `${barHeight(count)}%` }"
          aria-hidden="true"
        ></span>
        <span
          class="month-label"
          aria-hidden="true"
        >{{ monthShort(index + 1) }}</span>
        <span class="sr-only">{{ t('year.monthCount', { month: monthName(index + 1), n: count }, count) }}</span>
      </li>
    </ol>
  </YearPanel>
</template>

<script setup>
import { useI18n } from 'vue-i18n'
import YearPanel from './YearPanel.vue'
import { useYearFormat } from './useYearFormat.js'

/** Barras dos 12 meses; o mais intenso em destaque e os meses por vir apagados. */
const props = defineProps({
  months: { type: Array, required: true },
  busiestMonth: { type: Object, default: null },
  year: { type: Number, required: true }
})

const CURRENT_YEAR = new Date().getFullYear()

const { t } = useI18n()
const { monthName, monthShort } = useYearFormat()

const isFuture = index => props.year === CURRENT_YEAR && index > new Date().getMonth()

function barHeight(count) {
  const max = Math.max(1, ...props.months)
  return count ? Math.max(6, Math.round((count / max) * 100)) : 2
}
</script>

<style scoped>
.panel-sub {
  margin: -0.4rem 0 var(--space-4);
  color: var(--text-secondary);
  font-size: var(--fs-sm);
}

.months {
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  align-items: end;
  gap: var(--space-2);
  height: 11rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.months li {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-1);
  height: 100%;
  min-width: 0;
}

.month-bar {
  width: 100%;
  max-width: 2.6rem;
  border-radius: var(--radius-sm) var(--radius-sm) 2px 2px;
  background: rgba(var(--main-color-rgb), 0.35);
}

.peak .month-bar {
  background: var(--main-solid);
}

.future .month-bar {
  background: var(--bg-input);
}

.month-count {
  font-size: var(--fs-xs);
  font-weight: 700;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
  min-height: 1em;
}

.month-label {
  font-size: var(--fs-xs);
  color: var(--text-muted);
  text-transform: uppercase;
}

@media (max-width: 639.98px) {
  .months {
    gap: 0.2rem;
    height: 9rem;
  }
}
</style>
