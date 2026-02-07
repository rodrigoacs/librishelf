<template>
  <div class="authors-container">
    <div class="view-header">
      <div class="header-content">
        <h1>{{ $t('authors.title') }}</h1>
        <p>{{ $t('authors.subtitle') }}</p>
      </div>

      <div class="search-wrapper">
        <i class="pi pi-search"></i>
        <input
          v-model="search"
          :placeholder="$t('authors.search_ph')"
          class="modern-input"
        />
      </div>
    </div>

    <div class="content-body">
      <div
        v-if="loading"
        class="loading-grid"
      >
        <div
          v-for="n in 8"
          :key="n"
          class="skeleton-author"
        ></div>
      </div>

      <div
        v-else-if="filteredAuthors.length === 0"
        class="empty-state"
      >
        <i class="pi pi-users"></i>
        <p>{{ $t('authors.notFound') }}</p>
      </div>

      <div
        v-else
        class="authors-grid"
      >
        <div
          v-for="author in filteredAuthors"
          :key="author.name"
          class="author-card"
          @click="goToAuthorBooks(author.name)"
        >
          <div class="avatar-wrapper">
            <span class="initials">{{ getInitials(author.name) }}</span>
          </div>
          <div class="author-info">
            <h3>{{ author.name }}</h3>
            <span
              v-if="author.count"
              class="book-count"
            >
              {{ author.count }} {{ $t('authors.bookCount', author.count) }}
            </span>
            <span
              v-else
              class="action-text"
            >{{ $t('authors.viewBooks') }}</span>
          </div>
          <i class="pi pi-chevron-right arrow-icon"></i>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import api from '../services/api.js'

const router = useRouter()
const authors = ref([])
const loading = ref(true)
const search = ref('')

const filteredAuthors = computed(() => {
  if (!search.value) return authors.value
  const term = search.value.toLowerCase()
  return authors.value.filter(a => a.name.toLowerCase().includes(term))
})

function getInitials(name) {
  if (!name) return '?'
  return name.substring(0, 2).toUpperCase()
}

function goToAuthorBooks(authorName) {
  router.push({ path: '/books', query: { author: authorName } })
}

onMounted(async () => {
  loading.value = true
  try {
    const response = await api.getAuthors()
    authors.value = response.map(a => {
      if (typeof a === 'string') return { name: a, count: null }
      return a
    })
    authors.value.sort((a, b) => a.name.localeCompare(b.name))
  } catch (error) {
    console.error('Erro ao carregar autores:', error)
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.authors-container {
  padding: 2rem;
  min-height: 100vh;
  background-color: var(--bg-app);
}

.view-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  margin-bottom: 3rem;
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 1.5rem;
  flex-wrap: wrap;
  gap: 1.5rem;
}

.header-content h1 {
  font-family: 'Georgia', serif;
  font-size: 2.5rem;
  color: var(--text-primary);
  margin: 0;
}

.header-content p {
  color: var(--text-secondary);
  margin: 0.5rem 0 0 0;
}

.search-wrapper {
  position: relative;
  width: 100%;
  max-width: 300px;
}

.search-wrapper i {
  position: absolute;
  left: 1rem;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-muted);
}

.modern-input {
  width: 100%;
  background-color: var(--bg-input);
  border: 1px solid var(--border-color);
  padding: 0.8rem 1rem 0.8rem 2.5rem;
  border-radius: 8px;
  color: var(--text-primary);
  font-size: 0.95rem;
  transition: all 0.2s;
}

.modern-input:focus {
  border-color: var(--main-color);
  outline: none;
  background-color: var(--bg-panel);
}

.authors-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1.5rem;
}

.author-card {
  background-color: var(--bg-panel);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 1.5rem;
  display: flex;
  align-items: center;
  gap: 1rem;
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
  overflow: hidden;
}

.author-card:hover {
  transform: translateY(-3px);
  border-color: var(--main-color);
  background-color: var(--bg-hover);
}

.avatar-wrapper {
  width: 50px;
  height: 50px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--bg-input) 0%, var(--bg-panel) 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border-color);
  flex-shrink: 0;
}

.initials {
  font-weight: 700;
  color: var(--main-color);
  font-size: 1.1rem;
  letter-spacing: 1px;
}

.author-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.author-info h3 {
  margin: 0;
  color: var(--text-primary);
  font-size: 1rem;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.book-count,
.action-text {
  font-size: 0.8rem;
  color: var(--text-muted);
  margin-top: 0.2rem;
}

.arrow-icon {
  color: var(--text-muted);
  transition: transform 0.2s, color 0.2s;
}

.author-card:hover .arrow-icon {
  color: var(--text-primary);
  transform: translateX(3px);
}

.loading-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1.5rem;
}

.skeleton-author {
  height: 80px;
  background-color: var(--bg-hover);
  border-radius: 12px;
  animation: pulse 1.5s infinite;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 4rem;
  color: var(--text-muted);
}

.empty-state i {
  font-size: 3rem;
  margin-bottom: 1rem;
}

@keyframes pulse {
  0% {
    opacity: 1;
  }

  50% {
    opacity: 0.5;
  }

  100% {
    opacity: 1;
  }
}

@media (max-width: 600px) {
  .authors-container {
    padding: 1rem;
  }

  .view-header h1 {
    font-size: 2rem;
  }

  .search-wrapper {
    max-width: 100%;
  }
}
</style>
