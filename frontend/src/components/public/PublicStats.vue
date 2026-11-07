<template>
  <!-- Aba "Números" da biblioteca pública (pacote 33): o que antes ficava
       empilhado antes da estante -->
  <div class="public-stats">
    <div class="stat-row">
      <div
        class="stat"
      >
        <span class="stat-value">{{ stats.totalBooks }}</span>
        <span class="stat-label">{{ t('profile.books') }}</span>
      </div>
      <div
        class="stat"
      >
        <span class="stat-value">{{ stats.readBooks }}</span>
        <span class="stat-label">{{ t('profile.read') }}</span>
      </div>
      <div
        v-if="stats.averageRating"
        class="stat"
      >
        <span class="stat-value">
          <i
            class="pi pi-star-fill star"
            aria-hidden="true"
          ></i>
          {{ formatAverage(stats.averageRating) }}
        </span>
        <span class="stat-label">{{ t('profile.avg_rating', { n: stats.ratedBooks }, stats.ratedBooks) }}</span>
      </div>
      <div
        v-if="viewer && !viewer.isOwner && viewer.commonCount !== null"
        class="stat"
      >
        <span class="stat-value">{{ viewer.commonCount }}</span>
        <span class="stat-label">{{ t('profile.in_common', viewer.commonCount) }}</span>
      </div>
    </div>

    <div class="profile-grid">
      <div
        v-if="yearBars.length"
        class="panel"
      >
        <h2 class="section-title">{{ t('profile.by_year') }}</h2>
        <ul class="year-bars">
          <li
            v-for="bar in yearBars"
            :key="bar.year"
          >
            <span class="bar-year">{{ bar.year }}</span>
            <span
              class="bar-track"
              aria-hidden="true"
            ><span
                class="bar-fill"
                :style="{ width: `${bar.percent}%`, '--bar-color': colorFor(String(bar.year)) }"
              ></span></span>
            <span class="bar-count">{{ bar.count }}</span>
          </li>
        </ul>
      </div>

      <div
        v-if="stats.topAuthors?.length"
        class="panel"
      >
        <h2 class="section-title">{{ t('profile.top_authors') }}</h2>
        <ol class="rank-list">
          <li
            v-for="author in stats.topAuthors"
            :key="author.name"
          >
            <span class="ranked-name">
              <span
                class="dot"
                :style="{ '--dot-color': colorFor(author.name) }"
                aria-hidden="true"
              ></span>
              {{ author.name }}
            </span>
            <span class="muted">{{ author.count }}</span>
          </li>
        </ol>
        <template v-if="stats.topTags?.length">
          <h2 class="section-title sub-heading">{{ t('profile.top_tags') }}</h2>
          <div class="tag-row">
            <span
              v-for="tag in stats.topTags"
              :key="tag.name"
              class="tag-pill"
              :style="{ '--tag-color': tagColor(tag.name) }"
            >#{{ tag.name }}</span>
          </div>
        </template>
      </div>

      <div
        v-if="stats.recentlyRead?.length"
        class="panel"
      >
        <h2 class="section-title">{{ t('profile.recently_read') }}</h2>
        <ul class="recent-list">
          <li
            v-for="item in stats.recentlyRead"
            :key="item.book_id"
          >
            <button
              type="button"
              class="link-button"
              @click="openBook(item.book_id)"
            >
              <span class="recent-title">{{ item.title }}</span>
              <span
                v-if="item.authors"
                class="muted"
              >{{ item.authors }}</span>
            </button>
            <span class="recent-meta">
              <StarRating
                v-if="item.rating"
                :model-value="item.rating"
                size="sm"
                readonly
              />
              <span class="muted">{{ formatDate(item.read_date) }}</span>
            </span>
          </li>
        </ul>
      </div>

      <div
        v-if="viewer && !viewer.isOwner && viewer.commonBooks.length"
        class="panel"
      >
        <h2 class="section-title">{{ t('profile.common_books') }}</h2>
        <ul class="recent-list">
          <li
            v-for="item in viewer.commonBooks"
            :key="item.book_id"
          >
            <button
              type="button"
              class="link-button"
              @click="openBook(item.book_id)"
            >
              <span class="recent-title">{{ item.title }}</span>
              <span
                v-if="item.authors"
                class="muted"
              >{{ item.authors }}</span>
            </button>
          </li>
        </ul>
        <p
          v-if="viewer.commonCount > viewer.commonBooks.length"
          class="muted small"
        >{{ t('profile.common_more', {
          n:
            viewer.commonCount - viewer.commonBooks.length }) }}</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import StarRating from '../StarRating.vue'
import { tagColor, colorFor } from '../../utils/tagColors.js'
import { fromApiDate } from '../../utils/dates.js'

const props = defineProps({
  stats: { type: Object, default: () => ({}) },
  viewer: { type: Object, default: null }
})
const emit = defineEmits(['open'])
const { t, locale } = useI18n()

const MAX_YEARS = 10

// Barras dos últimos anos com leitura, proporcionais ao ano com mais livros.
const yearBars = computed(() => {
  const years = (props.stats.readingByYear || []).slice(-MAX_YEARS)
  const max = Math.max(1, ...years.map(y => y.count))
  return years.map(y => ({ ...y, percent: Math.max(4, Math.round((y.count / max) * 100)) }))
})

function formatAverage(value) {
  return Number(value).toLocaleString(locale.value, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}

function formatDate(value) {
  const date = fromApiDate(value)
  return date ? date.toLocaleDateString(locale.value) : ''
}

const openBook = id => emit('open', id)
</script>

<style scoped>
.public-stats {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.stat-row {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--space-4);
}

.stat {
  background: var(--bg-panel);
  border: 1px solid var(--border-color);
  border-radius: var(--card-radius);
  padding: var(--card-pad);
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.star {
  color: var(--rating);
  font-size: var(--fs-lg);
}

.profile-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: var(--space-4);
}

.panel {
  background: var(--bg-panel);
  border: 1px solid var(--border-color);
  border-radius: var(--card-radius);
  padding: var(--card-pad);
  min-width: 0;
}

.panel h2 {
  margin: 0 0 var(--space-3);
}

.panel .sub-heading {
  margin-top: var(--space-4);
}

.year-bars,
.rank-list,
.recent-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.year-bars li {
  display: grid;
  grid-template-columns: 3rem 1fr 2rem;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--fs-sm);
  padding: 0.15rem 0;
}

.bar-year,
.bar-count {
  color: var(--text-secondary);
}

.bar-count {
  text-align: right;
}

.bar-track {
  height: 8px;
  background: var(--bg-input);
  border-radius: var(--radius-pill);
  overflow: hidden;
}

.bar-fill {
  display: block;
  height: 100%;
  background: var(--main-color);
  border-radius: var(--radius-pill);
  background: var(--bar-color, var(--main-color));
}

.rank-list li {
  display: flex;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-1) 0;
  color: var(--text-primary);
  font-size: var(--fs-md);
}

.ranked-name {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}

.dot {
  width: 0.55rem;
  height: 0.55rem;
  border-radius: 50%;
  background: var(--dot-color);
  flex-shrink: 0;
}

.tag-row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.tag-pill {
  border-radius: var(--radius-pill);
  padding: 0.2rem var(--space-3);
  font-size: var(--fs-sm);
  font-weight: 500;
  color: color-mix(in srgb, var(--tag-color) var(--tint-text), var(--text-primary));
  background: color-mix(in srgb, var(--tag-color) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--tag-color) 35%, transparent);
}

.recent-list li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) 0;
  border-bottom: 1px solid var(--border-color);
}

.recent-list li:last-child {
  border-bottom: none;
}

.link-button {
  background: none;
  border: none;
  padding: 0;
  text-align: left;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  min-width: 0;
  color: inherit;
  font: inherit;
}

.link-button:hover .recent-title {
  color: var(--main-color);
}

.link-button:focus-visible {
  outline: var(--focus-ring);
  outline-offset: var(--focus-offset);
  border-radius: var(--radius-sm);
}

.recent-title {
  color: var(--text-primary);
  font-size: var(--fs-md);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.recent-meta {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.15rem;
  flex-shrink: 0;
}

.muted {
  color: var(--text-secondary);
  font-size: var(--fs-sm);
}

.small {
  margin: var(--space-2) 0 0;
}

@media (max-width: 639.98px) {
  .stat-row {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-3);
  }
}
</style>
