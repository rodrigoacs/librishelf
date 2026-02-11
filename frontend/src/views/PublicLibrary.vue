<template>
  <div class="public-library-container">
    <div class="view-header">
      <div class="header-content">
        <h1>{{ t('publicLibrary.title', { ownerName: ownerName }) }}</h1>
        <p>{{ t('publicLibrary.subtitle') }}</p>
      </div>
    </div>

    <div
      v-if="loading"
      class="loading-state"
    >
      <i class="pi pi-spin pi-spinner"></i> {{ t('common.loading') }}
    </div>

    <div
      v-else-if="books.length === 0"
      class="empty-state"
    >
      <p>{{ t('publicLibrary.empty') }}</p>
    </div>

    <div
      v-else
      class="books-grid"
    >
      <BookItem
        v-for="book in books"
        :key="book.id"
        :book="book"
        class="readonly-item"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import api from '../services/api.js'
import BookItem from '../components/BookItem.vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const route = useRoute()
const books = ref([])
const ownerName = ref('')
const loading = ref(true)

const username = route.params.username

async function loadLibrary(filters = {}) {
  loading.value = true
  try {
    const response = await api.getPublicLibrary(username, filters)


    if (response.result && Array.isArray(response.result)) {
      books.value = response.result
      ownerName.value = response.owner || username
    }
    else if (response.data && Array.isArray(response.data)) {
      books.value = response.data
      ownerName.value = response.owner || username
    }
    else if (Array.isArray(response)) {
      books.value = response
      ownerName.value = username
    }
    else {
      books.value = []
    }

  } catch (error) {
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadLibrary()
})
</script>

<style scoped>
.readonly-item {
  cursor: default !important;
  pointer-events: none;
}

.public-library-container {
  padding: 2rem;
  min-height: 100vh;
  background-color: var(--bg-app);
}

.view-header {
  margin-bottom: 2rem;
}

.header-content h1 {
  font-family: 'Georgia', serif;
  font-size: 2rem;
  color: var(--text-primary);
  margin: 0;
}

.header-content p {
  color: var(--text-secondary);
  margin-top: 0.5rem;
}

.books-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 2rem;
  justify-content: center;
}

.loading-state,
.empty-state {
  text-align: center;
  padding: 4rem;
  color: var(--text-muted);
  font-size: 1.1rem;
}
</style>