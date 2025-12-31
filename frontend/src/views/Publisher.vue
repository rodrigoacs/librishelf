<template>
  <div class="view-container">
    <div class="view-header">
      <div class="header-content">
        <h1>Editoras</h1>
        <p>As casas que publicam suas histórias favoritas.</p>
      </div>

      <div class="search-wrapper">
        <i class="pi pi-search"></i>
        <input
          v-model="search"
          placeholder="Buscar editora..."
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
          class="skeleton-card"
        ></div>
      </div>

      <div
        v-else-if="filteredPublishers.length === 0"
        class="empty-state"
      >
        <i class="pi pi-building"></i>
        <p>Nenhuma editora encontrada.</p>
      </div>

      <div
        v-else
        class="publishers-grid"
      >
        <div
          v-for="pub in filteredPublishers"
          :key="pub.name"
          class="publisher-card"
          @click="goToPublisherBooks(pub.name)"
        >
          <div class="icon-box">
            <i class="pi pi-building"></i>
          </div>
          <div class="info-box">
            <h3>{{ pub.name }}</h3>
            <span class="action-hint">Ver coleção <i class="pi pi-arrow-right"></i></span>
          </div>
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
const publishers = ref([])
const loading = ref(true)
const search = ref('')

const filteredPublishers = computed(() => {
  if (!search.value) return publishers.value
  const term = search.value.toLowerCase()
  return publishers.value.filter(p => p.name.toLowerCase().includes(term))
})

function goToPublisherBooks(name) {
  router.push({ path: '/books', query: { publisher: name } })
}

onMounted(async () => {
  loading.value = true
  try {
    const response = await api.getPublishers()
    publishers.value = response.map(p => {
      if (typeof p === 'string') return { name: p }
      return p
    })
    publishers.value.sort((a, b) => a.name.localeCompare(b.name))
  } catch (error) {
    console.error('Erro ao carregar editoras:', error)
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.view-container {
  padding: 2rem;
  min-height: 100vh;
  background-color: #121212;
}

.view-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  margin-bottom: 3rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  padding-bottom: 1.5rem;
  flex-wrap: wrap;
  gap: 1.5rem;
}

.header-content h1 {
  font-family: 'Georgia', serif;
  font-size: 2.5rem;
  color: #fff;
  margin: 0;
}

.header-content p {
  color: #a1a1aa;
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
  color: #71717a;
}

.modern-input {
  width: 100%;
  background-color: #18181b;
  border: 1px solid #27272a;
  padding: 0.8rem 1rem 0.8rem 2.5rem;
  border-radius: 8px;
  color: #fff;
  font-size: 0.95rem;
  transition: all 0.2s;
}

.modern-input:focus {
  border-color: var(--main-color, #4caf50);
  outline: none;
  background-color: #202022;
}

.publishers-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 1.5rem;
}

.publisher-card {
  background-color: #18181b;
  border: 1px solid #27272a;
  border-radius: 12px;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
}

.publisher-card:hover {
  transform: translateY(-4px);
  border-color: var(--main-color, #4caf50);
  box-shadow: 0 10px 20px -5px rgba(0, 0, 0, 0.3);
}

.icon-box {
  width: 45px;
  height: 45px;
  background-color: #27272a;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #a1a1aa;
  transition: all 0.2s;
}

.publisher-card:hover .icon-box {
  background-color: var(--main-color, #4caf50);
  color: #000;
}

.info-box h3 {
  margin: 0;
  color: #fff;
  font-size: 1.1rem;
  font-weight: 600;
  margin-bottom: 0.5rem;
}

.action-hint {
  font-size: 0.8rem;
  color: #71717a;
  display: flex;
  align-items: center;
  gap: 0.3rem;
  opacity: 0;
  transform: translateX(-10px);
  transition: all 0.2s ease;
}

.publisher-card:hover .action-hint {
  opacity: 1;
  transform: translateX(0);
  color: var(--main-color, #4caf50);
}

.loading-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 1.5rem;
}

.skeleton-card {
  height: 120px;
  background-color: #1f1f23;
  border-radius: 12px;
  animation: pulse 1.5s infinite;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 4rem;
  color: #52525b;
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
  .view-container {
    padding: 1rem;
  }

  .view-header h1 {
    font-size: 2rem;
  }
}
</style>
