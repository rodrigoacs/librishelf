<template>
  <router-link
    :to="to"
    class="list-card"
  >
    <span
      class="stack"
      :class="`n-${Math.min(list.covers.length, 4)}`"
      aria-hidden="true"
    >
      <BookCover
        v-for="(cover, index) in list.covers.slice(0, 4)"
        :key="cover.bookId"
        class="stack-cover"
        :style="{ '--i': index }"
        :book-id="cover.bookId"
        :title="cover.title"
        :author="cover.authors || ''"
      />
      <span
        v-if="list.covers.length === 0"
        class="stack-empty"
      >
        <i class="pi pi-list"></i>
      </span>
    </span>

    <span class="info">
      <span class="title">{{ list.title }}</span>
      <span class="meta">
        <span>{{ t('lists.count', { n: list.itemCount }, list.itemCount) }}</span>
        <span
          v-if="showVisibility"
          class="visibility"
          :class="{ public: list.isPublic }"
        >
          <i
            :class="list.isPublic ? 'pi pi-globe' : 'pi pi-lock'"
            aria-hidden="true"
          ></i>
          {{ list.isPublic ? t('lists.public') : t('lists.private') }}
        </span>
      </span>
      <span
        v-if="list.description"
        class="description"
      >{{ list.description }}</span>
    </span>
  </router-link>
</template>

<script setup>
import { useI18n } from 'vue-i18n'
import BookCover from '../BookCover.vue'

/** Cartão de uma lista: capas empilhadas, nome, quantos livros e (do dono) se é pública. */
defineProps({
  list: { type: Object, required: true },
  to: { type: [String, Object], required: true },
  showVisibility: { type: Boolean, default: false }
})
const { t } = useI18n()
</script>

<style scoped>
.list-card {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  padding: 1rem;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--bg-panel);
  color: var(--text-primary);
  text-decoration: none;
  min-width: 0;
  transition: border-color 0.15s ease, transform 0.15s ease;
}

.list-card:hover {
  border-color: var(--border-hover);
  transform: translateY(-2px);
}

.list-card:focus-visible {
  outline: 2px solid var(--main-color);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  .list-card,
  .list-card:hover {
    transition: none;
    transform: none;
  }
}

/* Capas em leque, da primeira (na frente) para a quarta */
.stack {
  position: relative;
  display: block;
  height: 7.5rem;
  border-radius: 8px;
  background: rgba(var(--main-color-rgb), 0.06);
  overflow: hidden;
}

.stack-cover {
  position: absolute;
  bottom: -0.6rem;
  width: 4.4rem;
  left: calc(1rem + var(--i) * 3.1rem);
  z-index: calc(10 - var(--i));
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.3);
  transform: rotate(calc((var(--i) - 1.5) * 3deg));
}

.stack-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-muted);
  font-size: 1.5rem;
}

.info {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  min-width: 0;
}

.title {
  font-family: var(--font-display);
  font-size: var(--fs-lg);
  font-weight: 600;
  line-height: 1.25;
  overflow-wrap: anywhere;
}

.meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.25rem 0.75rem;
  font-size: var(--fs-sm);
  color: var(--text-secondary);
}

.visibility {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
}

.visibility .pi {
  font-size: 0.75rem;
}

.visibility.public {
  color: var(--main-color);
}

.description {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  overflow: hidden;
  font-size: var(--fs-sm);
  color: var(--text-secondary);
  line-height: 1.45;
}
</style>
