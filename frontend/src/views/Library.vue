<template>
  <div
    class="library-container"
    ref="scrollContainer"
  >

    <div class="header-section">
      <LibraryHeader
        ref="header"
        :books-quantity="totalRecords"
        :filters="filters"
        :view="viewMode"
        @filter-change="handleFilterChange"
        @view-change="setViewMode"
        @reset="clearFilters"
        @book-created="refreshData"
      />
    </div>

    <div class="content-section">

      <div
        v-if="loading && books.length === 0"
        class="books-grid"
        aria-busy="true"
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
        v-else-if="error && books.length === 0"
        class="empty-state"
        role="alert"
      >
        <div class="empty-icon-circle">
          <i
            class="pi pi-exclamation-triangle"
            aria-hidden="true"
          ></i>
        </div>
        <h3>{{ t('library.load_error') }}</h3>
        <Button
          :label="t('common.retry')"
          icon="pi pi-refresh"
          class="p-button-outlined p-button-secondary mt-3"
          @click="refreshData"
        />
      </div>

      <div
        v-else-if="books.length > 0"
        class="books-grid-wrapper"
      >
        <TransitionGroup
          v-if="viewMode === 'grid'"
          name="book-list"
          tag="div"
          class="books-grid"
        >
          <BookItem
            v-for="item in books"
            :key="item.book_id || item.id"
            :book="item"
            :cover-version="coverVersions[item.book_id || item.id]"
            quick-actions
            @updated="onBookUpdated"
            @deleted="onBookDeleted"
          />
        </TransitionGroup>

        <ul
          v-else
          class="books-list"
          :aria-label="t('library.results')"
        >
          <BookRow
            v-for="item in books"
            :key="item.book_id || item.id"
            :book="item"
            :cover-version="coverVersions[item.book_id || item.id]"
            @updated="onBookUpdated"
            @deleted="onBookDeleted"
          />
        </ul>

        <div
          v-if="books.length < totalRecords"
          ref="sentinel"
          class="sentinel"
        >
          <i
            v-if="loadingMore"
            class="pi pi-spin pi-spinner loading-more-icon"
            :aria-label="t('common.loading')"
          ></i>
        </div>
      </div>

      <div
        v-else
        class="empty-state"
      >
        <div class="empty-icon-circle">
          <i
            class="pi pi-search"
            aria-hidden="true"
          ></i>
        </div>
        <h3>{{ t('library.empty_title') }}</h3>
        <p>{{ t('library.empty_msg') }}</p>

        <Button
          :label="t('library.clear_all')"
          icon="pi pi-filter-slash"
          class="p-button-outlined p-button-secondary mt-3"
          @click="clearFilters"
        />
      </div>

    </div>
  </div>
</template>

<script setup>
import { onMounted, onUnmounted, ref, watch, watchEffect } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import LibraryHeader from '../components/LibraryHeader.vue'
import BookItem from '../components/BookItem.vue'
import BookRow from '../components/BookRow.vue'
import { queryToFilters, queryToView, filtersToQuery, sameQuery, VIEW_MODES } from '../utils/libraryQuery.js'
import Skeleton from 'primevue/skeleton'
import Button from 'primevue/button'
import { useLibrary } from '../composables/useLibrary.js'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const {
  books,
  totalRecords,
  loading,
  loadingMore,
  error,
  filters,
  coverVersions,
  fetchBooks,
  loadMore,
  setFilter,
  setFilters,
  resetFilters,
  updateBookInList,
  removeBookFromList
} = useLibrary()

const scrollContainer = ref(null)
const sentinel = ref(null)
const header = ref(null)
let observer = null

function refreshData() {
  fetchBooks()
}

function scrollToTop() {
  scrollContainer.value?.scrollTo({ top: 0, behavior: 'smooth' })
}

function handleFilterChange({ key, value }) {
  setFilter(key, value)
  scrollToTop()
}

function clearFilters() {
  resetFilters()
  scrollToTop()
}

function onBookUpdated({ book, coverChanged }) {
  updateBookInList(book, { coverChanged })
  header.value?.reloadOptions()
}

function onBookDeleted(id) {
  removeBookFromList(id)
  header.value?.reloadOptions()
}

function setupIntersectionObserver() {
  if (observer) observer.disconnect()

  observer = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting && !loadingMore.value && !loading.value) {
      loadMore()
    }
  }, {
    root: scrollContainer.value,
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

// Grade ou lista: vem da URL (?view=list); sem ela, a última escolha neste navegador.
const VIEW_STORAGE_KEY = 'library-view'

function storedView() {
  try {
    const value = localStorage.getItem(VIEW_STORAGE_KEY)
    return VIEW_MODES.includes(value) ? value : 'grid'
  } catch {
    return 'grid'
  }
}

const viewMode = ref(queryToView(route.query) || storedView())

function setViewMode(mode) {
  if (!VIEW_MODES.includes(mode)) return
  viewMode.value = mode
  try { localStorage.setItem(VIEW_STORAGE_KEY, mode) } catch { /* modo privado */ }
}

// Filtros ⇄ URL. A URL é atualizada com replace (não enche o histórico a cada
// tecla) e, se ela mudar por fora (link de Autores, voltar do navegador),
// os filtros acompanham.
watch([filters, viewMode], () => {
  const next = filtersToQuery(filters.value, viewMode.value)
  if (!sameQuery(route.query, next)) router.replace({ query: next })
}, { deep: true })

watch(() => route.query, (query) => {
  if (route.name !== 'library') return
  if (sameQuery(query, filtersToQuery(filters.value, viewMode.value))) return
  const view = queryToView(query)
  if (view) viewMode.value = view
  setFilters(queryToFilters(query))
})

onMounted(() => {
  // Filtros da URL (inclusive os que vêm de Autores/Editoras/Categorias) entram
  // no estado compartilhado: aparecem como chips e podem ser removidos.
  setFilters(queryToFilters(route.query))
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
  background-color: var(--bg-app);
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

.books-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
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
  color: var(--main-color);
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 60vh;
  text-align: center;
  color: var(--text-secondary);
  animation: fadeIn 0.5s ease;
}

.empty-icon-circle {
  width: 100px;
  height: 100px;
  border-radius: 50%;
  background-color: var(--bg-panel);
  border: 1px solid var(--border-color);
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
  color: var(--text-primary);
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