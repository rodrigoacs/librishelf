<template>
  <div
    class="card"
    ref="scrollContainer"
  >
    <LibraryHeader
      :books-quantity="totalRecords"
      @filter-change="handleFilterChange"
      @refresh="fetchBooks"
    />

    <div
      v-if="loading"
      class="loading-container"
    >
      <i
        class="pi pi-spin pi-spinner"
        style="font-size: 2rem; color: var(--main-color)"
      ></i>
    </div>

    <div v-else>
      <DataView
        :value="books"
        layout="grid"
      >
        <template #grid="slotProps">
          <div class="grid">
            <BookItem
              v-for="item in slotProps.items"
              :key="item.book_id"
              :book="item"
              @refresh="fetchBooks"
            />
          </div>
        </template>
        <template #empty>
          <div class="empty-state">Nenhum livro encontrado.</div>
        </template>
      </DataView>

      <div
        v-if="books.length > 0 && books.length < totalRecords"
        ref="sentinel"
        class="sentinel"
      >
        <i
          v-if="loadingMore"
          class="pi pi-spin pi-spinner"
          style="font-size: 1.5rem"
        ></i>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, onUnmounted, ref, watchEffect } from 'vue'
import DataView from 'primevue/dataview'
import LibraryHeader from '../components/LibraryHeader.vue'
import BookItem from '../components/BookItem.vue'
import { useLibrary } from '../composables/useLibrary.js'

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

function handleFilterChange({ key, value }) {
  setFilter(key, value)
  const container = document.querySelector('.card')
  if (container) container.scrollTop = 0
}

function setupIntersectionObserver() {
  if (observer) observer.disconnect()

  observer = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting && !loadingMore.value && !loading.value) {
      loadMore()
    }
  }, {
    root: document.querySelector('.card'),
    rootMargin: '200px',
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
  fetchBooks()
})

onUnmounted(() => {
  if (observer) observer.disconnect()
})
</script>

<style scoped>
.card {
  padding: 0 1rem;
  height: 95vh;
  width: 85vw;
  overflow-y: scroll;
  scroll-behavior: smooth;
}

.grid {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-evenly;
  background-color: #121212;
}

.loading-container,
.empty-state {
  display: flex;
  justify-content: center;
  padding: 3rem;
  width: 100%;
  color: #888;
}

.sentinel {
  width: 100%;
  height: 80px;
  display: flex;
  justify-content: center;
  align-items: center;
  color: var(--main-color);
  margin-top: 1rem;
}

@media (max-width: 768px) {
  .card {
    width: 100vw;
  }

  .grid {
    justify-content: space-around;
  }
}
</style>