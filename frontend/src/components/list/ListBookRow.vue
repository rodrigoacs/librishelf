<template>
  <div class="list-book-row">
    <slot name="handle" />
    <span
      v-if="rank"
      class="rank"
      :class="{ top: rank <= 3 }"
      aria-hidden="true"
    >{{ rank }}</span>
    <button
      type="button"
      class="open"
      :aria-label="rank ? t('lists.openRanked', { n: rank, title: item.title }) : undefined"
      @click="emit('open', item.bookId)"
    >
      <BookCover
        class="cover"
        :book-id="item.bookId"
        :version="item.coverVersion"
        :title="item.title"
        :author="item.authors || ''"
      />
      <span class="text">
        <span class="title">{{ item.title }}</span>
        <span
          v-if="item.authors"
          class="authors"
        >{{ item.authors }}</span>
        <span class="meta">
          <StarRating
            v-if="item.rating"
            :model-value="item.rating"
            size="sm"
            readonly
          />
          <span
            v-if="readLabel"
            class="read"
          >{{ readLabel }}</span>
        </span>
      </span>
    </button>
    <slot name="actions" />
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import BookCover from '../BookCover.vue'
import StarRating from '../StarRating.vue'
import { fromApiDate } from '../../utils/dates.js'

/** Um livro numa lista: posição (se numerada), capa, título, autor, nota e quando foi lido. */
const props = defineProps({
  item: { type: Object, required: true },
  rank: { type: Number, default: null }
})
const emit = defineEmits(['open'])
const { t, locale } = useI18n()

const readLabel = computed(() => {
  const date = fromApiDate(props.item.readDate)
  if (date) return t('lists.readOn', { date: date.toLocaleDateString(locale.value, { month: 'short', year: 'numeric' }) })
  if (props.item.readingStatus === 'reading') return t('lists.reading')
  return ''
})
</script>

<style scoped>
.list-book-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  min-width: 0;
}

.rank {
  flex-shrink: 0;
  width: 2rem;
  text-align: center;
  font-family: var(--font-display);
  font-size: var(--fs-xl);
  font-weight: 700;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}

.rank.top {
  color: var(--main-color);
}

.open {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  flex: 1;
  min-width: 0;
  padding: 0.25rem;
  border: none;
  border-radius: 8px;
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.open:hover .title {
  color: var(--main-color);
}

.open:focus-visible {
  outline: 2px solid var(--main-color);
  outline-offset: 2px;
}

.cover {
  flex-shrink: 0;
  width: 3.25rem;
  border-radius: 4px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.18);
}

.text {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  min-width: 0;
}

.title {
  font-family: var(--font-display);
  font-weight: 600;
  font-size: var(--fs-md);
  line-height: 1.3;
  overflow-wrap: anywhere;
}

.authors {
  font-size: var(--fs-sm);
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.2rem 0.6rem;
  margin-top: 0.1rem;
}

.read {
  font-size: var(--fs-xs);
  color: var(--text-muted);
}
</style>
