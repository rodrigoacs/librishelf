<template>
  <div
    class="library-container"
    ref="scrollContainer"
  >

    <div class="header-section">
      <LibraryHeader
        :books-quantity="totalRecords"
        @filter-change="handleFilterChange"
        @refresh="refreshData"
      />
    </div>

    <div class="content-section">

      <div
        v-if="loading && books.length === 0"
        class="books-grid"
      >
        <div
          v-for="n in 12"
          :key="n"
          class="book-skeleton"
        >
          <Skeleton
            height="100%"
            class="cover-skeleton"
          />
          <div class="info-skeleton">
            <Skeleton
              width="85%"
              height="1rem"
              class="mb-2"
            />
            <Skeleton
              width="60%"
              height="0.8rem"
            />
          </div>
        </div>
      </div>

      <div
        v-else-if="books.length > 0"
        class="books-grid-wrapper"
      >
        <TransitionGroup
          name="book-list"
          tag="div"
          class="books-grid"
        >
          <BookItem
            v-for="item in books"
            :key="item.book_id || item.id"
            :book="item"
            @refresh="refreshData"
          />
        </TransitionGroup>

        <div
          v-if="books.length < totalRecords"
          ref="sentinel"
          class="sentinel"
        >
          <i
            v-if="loadingMore"
            class="pi pi-spin pi-spinner loading-more-icon"
          ></i>
        </div>
      </div>

      <div
        v-else
        class="empty-state"
      >
        <div class="empty-icon-circle">
          <i class="pi pi-search"></i>
        </div>
        <h3>Nenhum livro encontrado</h3>
        <p>Não encontramos nada com os filtros atuais.</p>

        <Button
          label="Limpar Filtros"
          icon="pi pi-filter-slash"
          class="p-button-outlined p-button-secondary mt-3"
          @click="clearFilters"
        />
      </div>

    </div>
  </div>
</template>

<script setup>
import { onMounted, onUnmounted, ref, watchEffect } from 'vue'
import { useRoute } from 'vue-router'
import LibraryHeader from '../components/LibraryHeader.vue'
import BookItem from '../components/BookItem.vue'
import Skeleton from 'primevue/skeleton'
import Button from 'primevue/button'
import { useLibrary } from '../composables/useLibrary.js'

const route = useRoute()
const {
  books,
  totalRecords,
  loading,
  loadingMore,
  fetchBooks,
  loadMore,
  setFilter
} = useLibrary()

const sentinel = ref(null)
let observer = null

function refreshData() {
  fetchBooks()
}

function handleFilterChange({ key, value }) {
  setFilter(key, value)
  const container = document.querySelector('.library-container')
  if (container) container.scrollTo({ top: 0, behavior: 'smooth' })
}

function clearFilters() {
  setFilter('search', '')
  setFilter('readState', 'all')
  setFilter('author', [])
  setFilter('publisher', [])
  setFilter('tags', [])
  refreshData()
}

function setupIntersectionObserver() {
  if (observer) observer.disconnect()

  observer = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting && !loadingMore.value && !loading.value) {
      loadMore()
    }
  }, {
    root: document.querySelector('.library-container'),
    rootMargin: '400px',
    threshold: 0.1
  })

  if (sentinel.value) {
    observer.observe(sentinel.value)
  }
}

watchEffect(() => {
  if (sentinel.value) {
    setupIntersectionObserver()
  }
})

onMounted(() => {
  if (route.query.author) {
    setFilter('author', [{ name: route.query.author }])
  }

  if (route.query.publisher) {
    setFilter('publisher', [{ name: route.query.publisher }])
  }

  if (route.query.tags) {
    setFilter('tags', [{ name: route.query.tags }])
  }

  fetchBooks()
})

onUnmounted(() => {
  if (observer) observer.disconnect()
})
</script>

<style scoped>
.library-container {
  height: 100vh;
  width: 100%;
  display: flex;
  flex-direction: column;
  background-color: #121212;
  overflow-y: auto;
  position: relative;
}

.header-section {
  position: sticky;
  top: 0;
  z-index: 100;
}

.content-section {
  padding: 1.5rem 2rem 4rem 2rem;
  flex: 1;
  max-width: 1800px;
  margin: 0 auto;
  width: 100%;
}

.books-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 2rem;
  width: 100%;
}

.book-skeleton {
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
  aspect-ratio: 2/3.5;
}

:deep(.p-skeleton) {
  background-color: rgba(255, 255, 255, 0.05) !important;
}

:deep(.p-skeleton)::after {
  background: linear-gradient(90deg, rgba(255, 255, 255, 0), rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0));
}

.cover-skeleton {
  border-radius: 12px !important;
  flex: 1;
}

.info-skeleton {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.sentinel {
  grid-column: 1 / -1;
  height: 80px;
  display: flex;
  justify-content: center;
  align-items: center;
  margin-top: 1rem;
}

.loading-more-icon {
  font-size: 1.5rem;
  color: var(--main-color, #4caf50);
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 60vh;
  text-align: center;
  color: #71717a;
  animation: fadeIn 0.5s ease;
}

.empty-icon-circle {
  width: 100px;
  height: 100px;
  border-radius: 50%;
  background-color: #18181b;
  border: 1px solid #27272a;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 1.5rem;
}

.empty-icon-circle i {
  font-size: 2.5rem;
  opacity: 0.5;
}

.empty-state h3 {
  font-size: 1.5rem;
  color: #fff;
  margin: 0 0 0.5rem 0;
}

.book-list-enter-active,
.book-list-leave-active {
  transition: all 0.4s ease;
}

.book-list-enter-from,
.book-list-leave-to {
  opacity: 0;
  transform: translateY(20px);
}

.book-list-move {
  transition: transform 0.4s ease;
}

@media (max-width: 600px) {
  .content-section {
    padding: 1rem;
  }

  .books-grid {
    grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
    gap: 1rem;
  }
}
</style>