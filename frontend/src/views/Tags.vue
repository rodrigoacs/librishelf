<template>
  <div class="view-container">
    <div class="view-header">
      <div class="header-content">
        <h1>{{ $t('tags.title') }}</h1>
        <p>{{ $t('tags.subtitle') }}</p>
      </div>

      <div class="search-wrapper">
        <i class="pi pi-search"></i>
        <input
          v-model="search"
          :placeholder="$t('tags.search_ph')"
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
          v-for="n in 12"
          :key="n"
          class="skeleton-tag"
        ></div>
      </div>

      <div
        v-else-if="filteredTags.length === 0"
        class="empty-state"
      >
        <i class="pi pi-tags"></i>
        <p>{{ $t('tags.empty') }}</p>
      </div>

      <div
        v-else
        class="tags-grid"
      >
        <div
          v-for="(tag, index) in filteredTags"
          :key="tag.name"
          class="tag-card"
          :style="{ '--accent-color': getTagColor(index) }"
          @click="goToTagBooks(tag.name)"
        >
          <div class="hash-symbol">#</div>
          <div class="tag-name">{{ tag.name }}</div>
          <i class="pi pi-arrow-right hover-arrow"></i>
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
const tags = ref([])
const loading = ref(true)
const search = ref('')

const colors = [
  'var(--red)',
  'var(--green)',
  'var(--blue)',
  'var(--purple)',
  'var(--yellow)',
  'var(--orange)'
]

const filteredTags = computed(() => {
  if (!search.value) return tags.value
  const term = search.value.toLowerCase()
  return tags.value.filter(t => t.name.toLowerCase().includes(term))
})

function getTagColor(index) {
  return colors[index % colors.length]
}

function goToTagBooks(name) {
  router.push({ path: '/books', query: { tags: name } })
}

onMounted(async () => {
  loading.value = true
  try {
    const response = await api.getTags()
    tags.value = response.map(t => {
      if (typeof t === 'string') return { name: t }
      return t
    })
    tags.value.sort((a, b) => a.name.localeCompare(b.name))
  } catch (error) {
    console.error(t('tags.error'), error)
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

.tags-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 1rem;
}

.tag-card {
  background-color: var(--bg-panel);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 1.2rem;
  display: flex;
  align-items: center;
  gap: 0.8rem;
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
  overflow: hidden;
}

.tag-card:hover {
  transform: translateY(-3px);
  border-color: var(--accent-color);
  box-shadow: 0 4px 15px -3px rgba(0, 0, 0, 0.5);
}

.hash-symbol {
  font-size: 1.5rem;
  font-weight: 800;
  color: var(--text-secondary);
  transition: color 0.2s;
}

.tag-card:hover .hash-symbol {
  color: var(--accent-color);
}

.tag-name {
  color: var(--text-primary);
  font-weight: 600;
  font-size: 1rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}

.hover-arrow {
  opacity: 0;
  transform: translateX(-10px);
  transition: all 0.2s ease;
  color: var(--accent-color);
}

.tag-card:hover .hover-arrow {
  opacity: 1;
  transform: translateX(0);
}

.loading-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 1rem;
}

.skeleton-tag {
  height: 70px;
  background-color: var(--bg-panel);
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
  .view-header h1 {
    font-size: 2rem;
  }

  .tags-grid {
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  }
}
</style>
