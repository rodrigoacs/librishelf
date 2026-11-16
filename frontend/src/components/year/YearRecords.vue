<template>
  <!-- Recordes -->
  <YearPanel>
    <h2 class="section-title">{{ t('year.records') }}</h2>
    <dl class="records">
      <template
        v-for="record in records"
        :key="record.key"
      >
        <dt>{{ record.label }}</dt>
        <dd>
          <button
            v-if="record.book"
            type="button"
            class="record-book"
            @click="emit('open', record.book.bookId)"
          >{{ record.book.title }}</button>
          <!-- Páginas numa linha própria, embaixo do título (antes o
               "· 790 págs." caía sozinho na linha de baixo) -->
          <span
            v-if="record.detail"
            class="muted record-detail"
          >{{ record.detail }}</span>
        </dd>
      </template>
    </dl>
  </YearPanel>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import YearPanel from './YearPanel.vue'
import { useYearFormat } from './useYearFormat.js'

/** Recordes do ano: mais longo, mais curto, mais rápido, média, primeiro, último, resenhas. */
const props = defineProps({
  data: { type: Object, required: true }
})
const emit = defineEmits(['open'])

const { t } = useI18n()
const { formatNumber, dateLabel } = useYearFormat()

const records = computed(() => {
  const d = props.data
  const list = []
  if (d.longest) list.push({ key: 'longest', label: t('year.longest'), book: d.longest, detail: t('year.pagesShort', { n: formatNumber(d.longest.pages) }) })
  if (d.shortest) list.push({ key: 'shortest', label: t('year.shortest'), book: d.shortest, detail: t('year.pagesShort', { n: formatNumber(d.shortest.pages) }) })
  if (d.fastest) list.push({ key: 'fastest', label: t('year.fastest'), book: d.fastest, detail: t('year.days', { n: d.fastest.days }, d.fastest.days) })
  if (d.averageDays !== null) list.push({ key: 'average', label: t('year.averageDays'), detail: t('year.days', { n: d.averageDays }, d.averageDays) })
  if (d.first) list.push({ key: 'first', label: t('year.first'), book: d.first, detail: dateLabel(d.first.finishedOn) })
  if (d.last) list.push({ key: 'last', label: d.isCurrentYear ? t('year.latest') : t('year.last'), book: d.last, detail: dateLabel(d.last.finishedOn) })
  if (d.totals.reviews) list.push({ key: 'reviews', label: t('year.reviews'), detail: t('year.reviewsCount', { n: d.totals.reviews }, d.totals.reviews) })
  return list
})
</script>

<style scoped>
.records {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: var(--space-2) var(--space-4);
  margin: 0;
  font-size: var(--fs-md);
}

.records dt {
  color: var(--text-secondary);
  font-size: var(--fs-sm);
  padding-top: 0.1rem;
}

.records dd {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.1rem;
  margin: 0;
  min-width: 0;
  overflow-wrap: anywhere;
}

.record-detail {
  font-size: var(--fs-sm);
}

.record-book {
  padding: 0;
  border: none;
  background: none;
  color: var(--text-primary);
  font: inherit;
  font-weight: 600;
  text-align: left;
  cursor: pointer;
}

.record-book:hover {
  color: var(--main-color);
  text-decoration: underline;
  text-underline-offset: 3px;
}

.record-book:focus-visible {
  outline: var(--focus-ring);
  outline-offset: var(--focus-offset);
  border-radius: var(--radius-sm);
}
</style>
