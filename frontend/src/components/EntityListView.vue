<template>
  <div class="entity-container">
    <div class="view-header">
      <div class="header-content">
        <h1>{{ t(`${i18nKey}.title`) }}</h1>
        <p>{{ t(`${i18nKey}.subtitle`) }}</p>
      </div>

      <div
        class="search-wrapper"
        role="search"
      >
        <i
          class="pi pi-search"
          aria-hidden="true"
        ></i>
        <label
          :for="`${i18nKey}-search`"
          class="sr-only"
        >{{ t(`${i18nKey}.search_ph`) }}</label>
        <input
          :id="`${i18nKey}-search`"
          v-model="search"
          type="search"
          :placeholder="t(`${i18nKey}.search_ph`)"
          class="modern-input"
          autocomplete="off"
        />
      </div>
    </div>

    <div class="content-body">
      <div
        v-if="loading"
        class="entity-grid"
        aria-busy="true"
      >
        <div
          v-for="n in 8"
          :key="n"
          class="skeleton-card"
        ></div>
      </div>

      <div
        v-else-if="loadError"
        class="empty-state"
        role="alert"
      >
        <i
          class="pi pi-exclamation-triangle"
          aria-hidden="true"
        ></i>
        <p>{{ t(errorKey) }}</p>
        <Button
          :label="t('common.retry')"
          icon="pi pi-refresh"
          class="p-button-outlined p-button-secondary"
          @click="load"
        />
      </div>

      <div
        v-else-if="filteredItems.length === 0"
        class="empty-state"
      >
        <i
          :class="['pi', icon]"
          aria-hidden="true"
        ></i>
        <p>{{ t(emptyKey) }}</p>
      </div>

      <ul
        v-else
        class="entity-grid"
      >
        <li
          v-for="(item, index) in filteredItems"
          :key="item.name"
        >
          <router-link
            :to="{ path: '/books', query: { [queryParam]: item.name } }"
            class="entity-card"
            :style="variant === 'tag' ? { '--accent-color': tagColor(item.name) } : undefined"
          >
            <span
              class="avatar-wrapper"
              aria-hidden="true"
            >
              <span
                v-if="variant === 'initials'"
                class="initials"
              >{{ initials(item.name) }}</span>
              <span
                v-else-if="variant === 'tag'"
                class="hash-symbol"
              >#</span>
              <i
                v-else
                :class="['pi', icon]"
              ></i>
            </span>

            <span class="entity-info">
              <span class="entity-name">{{ item.name }}</span>
              <span class="entity-meta">
                {{ item.count ? t(`${i18nKey}.bookCount`, { count: item.count }, item.count) : t(viewKey) }}
              </span>
            </span>

            <i
              class="pi pi-chevron-right arrow-icon"
              aria-hidden="true"
            ></i>
          </router-link>
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup>
import { tagColor } from '../utils/tagColors.js'
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import Button from 'primevue/button'

/**
 * Tela de lista usada por Autores, Editoras e Tags (antes eram três arquivos
 * quase idênticos). Cada item leva para /books já filtrado.
 */
const props = defineProps({
  i18nKey: { type: String, required: true },          // 'authors' | 'publishers' | 'tags'
  fetcher: { type: Function, required: true },
  queryParam: { type: String, required: true },       // 'author' | 'publisher' | 'tags'
  icon: { type: String, default: 'pi-folder' },
  variant: { type: String, default: 'icon' },         // 'initials' | 'icon' | 'tag'
  emptyKey: { type: String, required: true },
  errorKey: { type: String, required: true },
  viewKey: { type: String, required: true }
})

const { t } = useI18n()


const items = ref([])
const loading = ref(true)
const loadError = ref(false)
const search = ref('')

const filteredItems = computed(() => {
  const term = search.value.trim().toLocaleLowerCase()
  if (!term) return items.value
  return items.value.filter(item => item.name.toLocaleLowerCase().includes(term))
})

function initials(name) {
  if (!name) return '?'
  // "Sobrenome, Nome" vira "Nome Sobrenome" antes de pegar as letras.
  const [last, first] = name.split(',').map(part => part.trim())
  const ordered = first ? `${first} ${last}` : name
  const words = ordered.split(/\s+/).filter(word => /^\p{L}/u.test(word))
  if (words.length === 0) return name.trim().charAt(0).toUpperCase() || '?'
  const letters = words.length === 1 ? words[0].slice(0, 2) : words[0][0] + words.at(-1)[0]
  return letters.toUpperCase()
}


async function load() {
  loading.value = true
  loadError.value = false

  try {
    const response = await props.fetcher()
    items.value = response
      .map(item => (typeof item === 'string' ? { name: item, count: null } : item))
      .sort((a, b) => a.name.localeCompare(b.name))
  } catch (error) {
    loadError.value = true
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.entity-container {
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

.entity-grid {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1.5rem;
}

.entity-card {
  --accent-color: var(--main-color);
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
  text-decoration: none;
  color: inherit;
  height: 100%;
}

.entity-card:hover,
.entity-card:focus-visible {
  transform: translateY(-3px);
  border-color: var(--accent-color);
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
  color: var(--accent-color);
  font-size: 1.2rem;
}

.initials {
  font-weight: 700;
  font-size: 1.1rem;
  letter-spacing: 1px;
}

.hash-symbol {
  font-family: 'Georgia', serif;
  font-weight: 700;
  font-size: 1.5rem;
}

.entity-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.entity-name {
  color: var(--text-primary);
  font-size: 1rem;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.entity-meta {
  font-size: 0.8rem;
  color: var(--text-muted);
  margin-top: 0.2rem;
}

.arrow-icon {
  color: var(--text-muted);
  transition: transform 0.2s, color 0.2s;
}

.entity-card:hover .arrow-icon,
.entity-card:focus-visible .arrow-icon {
  color: var(--text-primary);
  transform: translateX(3px);
}

.skeleton-card {
  height: 98px;
  background-color: var(--bg-hover);
  border-radius: 12px;
  animation: pulse 1.5s infinite;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  padding: 4rem 1rem;
  color: var(--text-muted);
  text-align: center;
}

.empty-state>i {
  font-size: 2.5rem;
}

@keyframes pulse {
  0% {
    opacity: 0.6;
  }

  50% {
    opacity: 1;
  }

  100% {
    opacity: 0.6;
  }
}

@media (max-width: 640px) {
  .entity-container {
    padding: 1.25rem;
  }

  .header-content h1 {
    font-size: 2rem;
  }

  .search-wrapper {
    max-width: none;
  }
}
</style>