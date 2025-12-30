<template>
  <div
    class="library-container"
    ref="scrollContainer"
  >
    <div class="header-section">
      <LibraryHeader
        :books-quantity="totalRecords"
        @filter-change="handleFilterChange"
        @refresh="fetchBooks"
      />
    </div>

    <div class="content-section">
      <div
        v-if="loading"
        class="loading-state"
      >
        <i
          class="pi pi-spin pi-spinner"
          style="font-size: 3rem; color: var(--main-color)"
        ></i>
        <p>Carregando sua biblioteca...</p>
      </div>

      <div
        v-else-if="books.length > 0"
        class="books-grid"
      >
        <BookItem
          v-for="item in books"
          :key="item.book_id"
          :book="item"
          @refresh="fetchBooks"
        />

        <div
          v-if="books.length < totalRecords"
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

      <div
        v-else
        class="empty-state"
      >
        <i
          class="pi pi-book"
          style="font-size: 4rem; margin-bottom: 1rem; opacity: 0.5"
        ></i>
        <h3>Nenhum livro encontrado</h3>
        <p>Tente ajustar seus filtros ou adicione um novo livro.</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, onUnmounted, ref, watchEffect } from 'vue'
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
  // Scroll para o topo suavemente
  const container = document.querySelector('.library-container')
  if (container) container.scrollTo({ top: 0, behavior: 'smooth' })
}

function setupIntersectionObserver() {
  if (observer) observer.disconnect()

  observer = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting && !loadingMore.value && !loading.value) {
      loadMore()
    }
  }, {
    root: document.querySelector('.library-container'),
    rootMargin: '300px', // Antecipa o carregamento
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
/* Container Principal: Ocupa toda a tela, sem margens fixas estranhas */
.library-container {
  height: 100vh;
  width: 100%;
  display: flex;
  flex-direction: column;
  background-color: #121212;
  /* Fundo global */
  overflow-y: auto;
  /* Scroll na página inteira */
  padding: 0;
}

/* Área do Header */
.header-section {
  padding: 1rem 1.5rem;
  background-color: #121212;
  position: sticky;
  top: 0;
  z-index: 10;
  /* Um leve blur/transparência se quiser modernizar */
  /* backdrop-filter: blur(10px); background-color: rgba(18, 18, 18, 0.9); */
}

/* Área dos Livros */
.content-section {
  padding: 0 1.5rem 2rem 1.5rem;
  flex: 1;
}

/* GRID MÁGICO RESPONSIVO */
.books-grid {
  display: grid;
  /* Aqui está o segredo:
     Cria colunas automáticas.
     Mínimo: 140px (bom para mobile).
     Máximo: 1fr (ocupa o espaço que sobrar).
  */
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 1.5rem;
  /* Espaço entre os livros */
  justify-items: center;
}

/* Sentinela ocupa toda a largura da grade no final */
.sentinel {
  grid-column: 1 / -1;
  width: 100%;
  height: 60px;
  display: flex;
  justify-content: center;
  align-items: center;
  color: var(--main-color, #4caf50);
}

.loading-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 50vh;
  color: #888;
  text-align: center;
}

.empty-state h3 {
  color: #fff;
  margin-bottom: 0.5rem;
}

/* Ajustes Específicos para Mobile */
@media (max-width: 600px) {
  .header-section {
    padding: 1rem;
  }

  .content-section {
    padding: 0 1rem 4rem 1rem;
    /* Mais padding no fundo para não colar */
  }

  .books-grid {
    /* No celular, diminuímos um pouco o mínimo para caber 2 ou 3 colunas confortavelmente */
    grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
    gap: 1rem;
  }
}
</style>