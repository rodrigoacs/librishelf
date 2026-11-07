<template>
  <!-- Até 5 favoritos escolhidos pelo dono, no topo da estante -->
  <section
    class="favorites"
    aria-labelledby="public-favorites-title"
  >
    <h2
      id="public-favorites-title"
      class="section-title"
    >{{ t('publicPage.favorites') }}</h2>
    <ol class="favorite-list">
      <li
        v-for="item in items"
        :key="item.bookId"
      >
        <button
          type="button"
          class="favorite"
          @click="emit('open', item.bookId)"
        >
          <span class="sr-only">{{ item.title }}</span>
          <BookCover
            aria-hidden="true"
            :book-id="item.bookId"
            :version="item.coverVersion"
            :title="item.title"
            :author="item.authors || ''"
          />
          <span
            class="favorite-title"
            aria-hidden="true"
          >{{ item.title }}</span>
        </button>
      </li>
    </ol>
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
</script>

<style scoped>
.favorites {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.section-title {
  margin: 0;
}

/* Cinco capas lado a lado; no celular rolam na horizontal */
.favorite-list {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: var(--space-3);
  max-width: 48rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.favorite {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  width: 100%;
  padding: 0;
  border: none;
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.favorite :deep(.book-cover) {
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-1);
}

.favorite:focus-visible {
  outline: var(--focus-ring);
  outline-offset: var(--focus-offset);
  border-radius: var(--radius-md);
}

.favorite-title {
  display: -webkit-box;
  overflow: hidden;
  color: var(--text-primary);
  font-size: var(--fs-sm);
  line-height: 1.3;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
}

@media (max-width: 639.98px) {
  .favorite-list {
    grid-template-columns: none;
    grid-auto-columns: 6.5rem;
    grid-auto-flow: column;
    margin: 0 calc(-1 * var(--page-pad-x));
    padding: 0 var(--page-pad-x);
    overflow-x: auto;
    scroll-snap-type: x mandatory;
    scrollbar-width: none;
  }

  .favorite-list::-webkit-scrollbar {
    display: none;
  }

  .favorite-list li {
    scroll-snap-align: start;
  }
}
</style>
