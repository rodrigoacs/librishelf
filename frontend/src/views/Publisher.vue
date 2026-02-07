<template>
  <div class="view-container">
    <div class="view-header">
      <div class="header-content">
        <h1>{{ $t('publishers.title') }}</h1>
        <p>{{ $t('publishers.subtitle') }}</p>
      </div>

      <div class="search-wrapper">
        <i class="pi pi-search"></i>
        <input
          v-model="search"
          :placeholder="$t('publishers.search_ph')"
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
        <p>{{ $t('publishers.notFound') }}</p>
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
            <span class="action-hint">{{ $t('publishers.viewCollection') }} <i class="pi pi-arrow-right"></i></span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import api from '../services/api.js'

const router = useRouter()
const { t } = useI18n()
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
    console.error(t('publishers.loadError'), error)
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.view-container {
  padding: 2rem;
  min-height: 100vh;
  background-color: var(--bg-app);
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
  color: var(--text-secondary);
}

.modern-input {
  width: 100%;
  background-color: var(--bg-panel);
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

.publishers-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 1.5rem;
}

.publisher-card {
  background-color: var(--bg-panel);
  border: 1px solid var(--border-color);
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
  border-color: var(--main-color);
  box-shadow: 0 10px 20px -5px rgba(0, 0, 0, 0.3);
}

.icon-box {
  width: 45px;
  height: 45px;
  background-color: var(--border-color);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  transition: all 0.2s;
}

.publisher-card:hover .icon-box {
  background-color: var(--main-color);
  color: var(--text-primary);
}

.info-box h3 {
  margin: 0;
  color: var(--text-primary);
  font-size: 1.1rem;
  font-weight: 600;
  margin-bottom: 0.5rem;
}

.action-hint {
  font-size: 0.8rem;
  color: var(--text-secondary);
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
  color: var(--main-color);
}

.loading-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 1.5rem;
}

.skeleton-card {
  height: 120px;
  background-color: var(--border-color);
  border-radius: 12px;
  animation: pulse 1.5s infinite;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 4rem;
  color: var(--text-secondary);
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
