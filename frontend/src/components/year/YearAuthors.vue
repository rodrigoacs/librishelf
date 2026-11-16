<template>
  <!-- Autores e categorias -->
  <YearPanel>
    <h2 class="section-title">{{ t('year.authorsTitle') }}</h2>
    <ol class="rank-list">
      <li
        v-for="author in authors"
        :key="author.name"
      >
        <span>{{ author.name }}</span>
        <span class="muted">{{ t('year.booksCount', { n: author.count }, author.count) }}</span>
      </li>
    </ol>
    <template v-if="tags.length">
      <h2 class="section-title sub">{{ t('year.tagsTitle') }}</h2>
      <div class="tags">
        <span
          v-for="tag in tags"
          :key="tag.name"
          class="tag"
          :style="{ '--tag-color': tagColor(tag.name) }"
        >#{{ tag.name }} <small>{{ tag.count }}</small></span>
      </div>
    </template>
  </YearPanel>
</template>

<script setup>
import { useI18n } from 'vue-i18n'
import { tagColor } from '../../utils/tagColors.js'
import YearPanel from './YearPanel.vue'

/** Autores mais lidos e as categorias do ano ({ name, count }). */
defineProps({
  authors: { type: Array, required: true },
  tags: { type: Array, required: true }
})

const { t } = useI18n()
</script>

<style scoped>
h2.sub {
  margin-top: var(--space-5);
}

.rank-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.rank-list li {
  display: flex;
  justify-content: space-between;
  gap: var(--space-4);
  font-size: var(--fs-md);
}

.rank-list li span:first-child {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.tag {
  padding: var(--space-1) var(--space-3);
  border-radius: var(--radius-pill);
  border: 1px solid color-mix(in srgb, var(--tag-color) 45%, transparent);
  background: color-mix(in srgb, var(--tag-color) 12%, transparent);
  color: color-mix(in srgb, var(--tag-color) var(--tint-text), var(--text-primary));
  font-size: var(--fs-sm);
  font-weight: 600;
}

.tag small {
  opacity: 0.75;
  margin-left: 0.15rem;
}
</style>
