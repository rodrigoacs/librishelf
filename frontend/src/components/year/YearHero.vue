<template>
  <!-- Números grandes -->
  <section
    class="hero"
    :aria-label="t('year.summary')"
  >
    <div class="hero-card">
      <span class="hero-value stat-value">{{ formatNumber(totals.readings) }}</span>
      <span class="hero-label stat-label">{{ t('year.booksRead', totals.readings) }}</span>
      <span
        v-if="totals.rereads"
        class="hero-note stat-note"
      >{{ t('year.rereads', { n: totals.rereads }, totals.rereads) }}</span>
    </div>
    <div class="hero-card">
      <span class="hero-value stat-value">{{ formatNumber(totals.pages) }}</span>
      <span class="hero-label stat-label">{{ t('year.pages', totals.pages) }}</span>
      <span
        v-if="totals.pagesMissing"
        class="hero-note stat-note"
      >{{ t('year.pagesMissing', { n: totals.pagesMissing }, totals.pagesMissing) }}</span>
    </div>
    <div class="hero-card">
      <span class="hero-value stat-value">
        <template v-if="totals.averageRating">
          {{ formatDecimal(totals.averageRating) }}<i
            class="pi pi-star-fill star"
            aria-hidden="true"
          ></i>
        </template>
        <template v-else>–</template>
      </span>
      <span class="hero-label stat-label">{{ t('year.averageRating') }}</span>
      <span
        v-if="totals.rated"
        class="hero-note stat-note"
      >{{ t('year.ratedCount', { n: totals.rated }, totals.rated) }}</span>
    </div>
    <div class="hero-card">
      <span class="hero-value stat-value">{{ compareValue }}</span>
      <span class="hero-label stat-label">{{ t('year.vsLast', { year: year - 1 }) }}</span>
      <span class="hero-note stat-note">{{ t('year.lastYearCount', { n: previousYear }, previousYear) }}</span>
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useYearFormat } from './useYearFormat.js'

/** Os quatro números do topo: lidos, páginas, nota média e o ano anterior. */
const props = defineProps({
  totals: { type: Object, required: true },
  previousYear: { type: Number, required: true },
  year: { type: Number, required: true }
})

const { t } = useI18n()
const { formatNumber, formatDecimal } = useYearFormat()

const compareValue = computed(() => {
  if (!props.previousYear) return '–'
  const diff = props.totals.readings - props.previousYear
  return diff > 0 ? `+${diff}` : String(diff)
})
</script>

<style scoped>
.hero {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--space-4);
}

.hero-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding: var(--card-pad);
  border: 1px solid var(--border-color);
  border-radius: var(--card-radius);
  background: var(--bg-panel);
  min-width: 0;
}

.hero-value .star {
  font-size: var(--fs-xl);
  color: var(--rating);
}

@media (max-width: 1023.98px) {
  .hero {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 639.98px) {
  .hero-card {
    padding: var(--space-4) var(--space-4);
  }
}
</style>
