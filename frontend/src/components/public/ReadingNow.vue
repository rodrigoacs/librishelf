<template>
  <!-- Lendo agora (pacote 33): só leitura, para quem visita -->
  <section
    class="reading-now"
    aria-labelledby="public-reading-title"
  >
    <h2
      id="public-reading-title"
      class="section-title"
    >{{ t('publicPage.readingNow') }}</h2>
    <ul class="reading-list">
      <li
        v-for="(item, index) in items"
        :key="item.bookId"
        :style="{ '--i': index }"
      >
        <button
          type="button"
          class="reading-item"
          @click="emit('open', item.bookId)"
        >
          <BookCover
            class="reading-cover"
            aria-hidden="true"
            :book-id="item.bookId"
            :version="item.coverVersion"
            :title="item.title"
            :author="item.authors || ''"
          />
          <span class="reading-text">
            <span class="reading-title">{{ item.title }}</span>
            <span
              v-if="item.authors"
              class="reading-author"
            >{{ item.authors }}</span>
            <span
              v-if="percentOf(item) !== null"
              class="reading-progress"
            >
              <span
                class="progress-track"
                aria-hidden="true"
              ><span
                class="progress-fill"
                :style="{ width: `${percentOf(item)}%` }"
              ></span></span>
              <span class="progress-label">{{ progressLabel(item) }}</span>
            </span>
          </span>
        </button>
      </li>
    </ul>
  </section>
</template>

<script setup>
import { useI18n } from 'vue-i18n'
import BookCover from '../BookCover.vue'

defineProps({
  items: { type: Array, default: () => [] }
})
const emit = defineEmits(['open'])
const { t } = useI18n()

function percentOf(item) {
  if (Number.isFinite(item.progressPercent)) return item.progressPercent
  if (item.currentPage && item.pageCount) return Math.min(100, Math.round((item.currentPage / item.pageCount) * 100))
  return null
}

function progressLabel(item) {
  if (item.currentPage && item.pageCount) return t('publicPage.progressPages', { page: item.currentPage, total: item.pageCount })
  return t('publicPage.progressPercent', { n: percentOf(item) })
}
</script>

<style scoped>
.reading-now {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.section-title {
  margin: 0;
}

.reading-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 18rem), 1fr));
  gap: var(--space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

.reading-item {
  display: grid;
  grid-template-columns: 3.5rem minmax(0, 1fr);
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  padding: var(--space-3);
  border: 1px solid var(--border-color);
  border-radius: var(--card-radius);
  background: var(--bg-panel);
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.reading-item:focus-visible {
  outline: var(--focus-ring);
  outline-offset: var(--focus-offset);
}

@media (hover: hover) {
  .reading-item:hover {
    border-color: rgba(var(--main-color-rgb), 0.5);
  }
}

.reading-cover {
  width: 3.5rem;
  border-radius: var(--radius-sm);
}

.reading-text {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  min-width: 0;
}

.reading-title {
  overflow: hidden;
  color: var(--text-primary);
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.reading-author {
  overflow: hidden;
  color: var(--text-secondary);
  font-size: var(--fs-sm);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.reading-progress {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  margin-top: var(--space-1);
}

.progress-track {
  display: block;
  height: 4px;
  overflow: hidden;
  border-radius: var(--radius-pill);
  background: var(--border-color);
}

.progress-fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--main-color);
}

.progress-label {
  color: var(--text-secondary);
  font-size: var(--fs-xs);
}

@media (max-width: 639.98px) {
  .reading-list li {
    animation: public-in var(--dur-medium) var(--ease-enter) both;
    animation-delay: calc(min(var(--i, 0), 10) * var(--stagger));
  }
}

@keyframes public-in {
  from {
    opacity: 0;
    transform: translate3d(0, 12px, 0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .reading-list li {
    animation: none !important;
  }
}
</style>
