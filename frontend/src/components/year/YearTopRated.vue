<template>
  <!-- Melhores -->
  <YearPanel>
    <div class="panel-head">
      <h2 class="section-title">{{ t('year.topRated') }}</h2>
      <AppButton
        :label="t('year.makeList')"
        icon="pi pi-list"
        class="btn-text btn-sm"
        :loading="makingList"
        @click="makeList"
      />
    </div>
    <ol class="top-books">
      <li
        v-for="(book, index) in books"
        :key="book.bookId"
      >
        <button
          type="button"
          class="top-book"
          @click="emit('open', book.bookId)"
        >
          <span
            class="top-rank"
            aria-hidden="true"
          >{{ index + 1 }}</span>
          <BookCover
            class="top-cover"
            :book-id="book.bookId"
            :version="book.coverVersion"
            :title="book.title"
            :author="book.authors || ''"
          />
          <span class="top-title">{{ book.title }}</span>
          <StarRating
            :model-value="book.rating"
            size="sm"
            readonly
          />
        </button>
      </li>
    </ol>
  </YearPanel>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import AppButton from '../ui/AppButton.vue'
import BookCover from '../BookCover.vue'
import StarRating from '../StarRating.vue'
import api from '../../services/api.js'
import { useToast } from '../../services/toast.js'
import YearPanel from './YearPanel.vue'

/**
 * Os melhores do ano e o "Criar lista" (lista ordenada com as capas do ano,
 * na mesma ordem da imagem para stories).
 */
const props = defineProps({
  books: { type: Array, required: true },
  // Capas do ano ({ bookId }), na ordem que a lista nova recebe
  covers: { type: Array, required: true },
  year: { type: Number, required: true }
})
const emit = defineEmits(['open'])

const { t } = useI18n()
const router = useRouter()
const toast = useToast()
const makingList = ref(false)

async function makeList() {
  makingList.value = true
  try {
    const ids = props.covers.map(cover => cover.bookId)
    const { list } = await api.createList({ title: t('lists.suggestBest', { year: props.year }), ranked: true, bookId: ids[0] })
    for (const id of ids.slice(1)) await api.addToList(list.id, id)
    toast.add({ severity: 'success', summary: t('year.listCreated'), life: 3000 })
    router.push({ name: 'list', params: { id: list.id } })
  } catch (error) {
    toast.add({ severity: 'error', detail: error.message, life: 4000 })
  } finally {
    makingList.value = false
  }
}
</script>

<style scoped>
.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  margin-bottom: var(--space-3);
}

.panel-head h2 {
  margin: 0;
}

.top-books {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: var(--space-4);
  margin: 0;
  padding: 0;
  list-style: none;
}

.top-book {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
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

.top-book:focus-visible {
  outline: var(--focus-ring);
  outline-offset: 4px;
  border-radius: var(--radius-sm);
}

.top-cover {
  width: 100%;
  box-shadow: var(--shadow-2);
  transition: transform 0.15s ease;
}

.top-book:hover .top-cover {
  transform: translateY(-3px);
}

.top-rank {
  position: absolute;
  top: -0.5rem;
  left: -0.5rem;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.9rem;
  height: 1.9rem;
  border-radius: 50%;
  background: var(--main-solid);
  color: var(--on-main);
  font-weight: 700;
  font-size: var(--fs-sm);
  box-shadow: var(--shadow-2);
}

.top-title {
  font-family: var(--font-display);
  font-weight: 600;
  font-size: var(--fs-sm);
  line-height: 1.3;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  overflow: hidden;
}

@media (prefers-reduced-motion: reduce) {
  .top-cover {
    transition: none;
  }
}

@media (max-width: 1023.98px) {
  .top-books {
    grid-template-columns: repeat(auto-fill, minmax(5.25rem, 1fr));
    gap: var(--space-3) var(--space-3);
  }
}
</style>
