<template>
  <div class="library-header">
    <div class="top-bar">

      <div class="header-title">
        <h1>Library</h1>
        <span
          class="count-badge"
          v-if="booksQuantity !== undefined"
        >{{ booksQuantity }}</span>
      </div>

      <div class="search-area">
        <span class="p-input-icon-left w-full">
          <InputText
            v-model="searchText"
            placeholder="Search by title, ISBN..."
            class="main-search"
            @input="emitFilter('search', searchText)"
          />
        </span>
      </div>

      <div class="actions">
        <Button
          icon="pi pi-filter"
          class="p-button-outlined p-button-secondary"
          :class="{ 'p-button-info': hasActiveFilters }"
          @click="visibleFilters = true"
          v-tooltip.bottom="'Filtros Avançados'"
        />

        <Button
          label="New Book"
          icon="pi pi-plus"
          class="add-button"
          @click="openAddBookModal"
        />
      </div>
    </div>

    <div
      class="active-filters"
      v-if="hasActiveFilters"
    >
      <Chip
        v-if="readState !== 'all'"
        :label="readState === 'read' ? 'Lidos' : 'Não Lidos'"
        removable
        @remove="resetFilter('readState')"
        class="filter-chip"
      />
      <Chip
        v-for="a in selectedAuthors"
        :key="a.name"
        :label="a.name"
        removable
        @remove="removeArrayFilter('author', a)"
        class="filter-chip"
      />
      <Chip
        v-for="p in selectedPublishers"
        :key="p.name"
        :label="p.name"
        removable
        @remove="removeArrayFilter('publisher', p)"
        class="filter-chip"
      />
      <Chip
        v-for="t in selectedTags"
        :key="t.name"
        :label="t.name"
        removable
        @remove="removeArrayFilter('tags', t)"
        class="filter-chip"
      />
    </div>

    <Sidebar
      v-model:visible="visibleFilters"
      position="right"
      class="filters-sidebar"
      :modal="true"
    >
      <h3>Filters & Sort</h3>

      <div class="filter-group">
        <label>Status de Leitura</label>
        <SelectButton
          v-model="readState"
          :options="['all', 'read', 'unread']"
          @change="emitFilter('readState', readState)"
          class="w-full"
        />
      </div>

      <div class="filter-group">
        <label>Ordenar Por</label>
        <div class="sort-row">
          <Dropdown
            v-model="sortField"
            :options="sortOptions"
            optionLabel="label"
            optionValue="value"
            class="w-full"
            @change="emitFilter('sortField', sortField)"
          />
          <Button
            @click="toggleSortOrder"
            :icon="sortOrder === 'asc' ? 'pi pi-sort-amount-down' : 'pi pi-sort-amount-up-alt'"
            class="p-button-outlined"
          />
        </div>
      </div>

      <div class="filter-group">
        <label>Tags</label>
        <MultiSelect
          v-model="selectedTags"
          :options="tagsList"
          optionLabel="name"
          placeholder="Select tags"
          display="chip"
          filter
          class="w-full"
          @change="emitFilter('tags', selectedTags)"
        />
      </div>

      <div class="filter-group">
        <label>Autores</label>
        <MultiSelect
          v-model="selectedAuthors"
          :options="authorsList"
          optionLabel="name"
          placeholder="Select authors"
          display="chip"
          filter
          class="w-full"
          @change="emitFilter('author', selectedAuthors)"
        />
      </div>

      <div class="filter-group">
        <label>Editoras</label>
        <MultiSelect
          v-model="selectedPublishers"
          :options="publishersList"
          optionLabel="name"
          placeholder="Select publishers"
          display="chip"
          filter
          class="w-full"
          @change="emitFilter('publisher', selectedPublishers)"
        />
      </div>

      <div class="sidebar-footer">
        <Button
          label="Limpar Filtros"
          icon="pi pi-times"
          class="p-button-text p-button-danger w-full"
          @click="clearAllFilters"
        />
      </div>
    </Sidebar>

    <AddBookDialog
      v-model:visible="addBookDialogVisible"
      @save="onBookSaved"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, defineEmits, defineProps } from 'vue'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Sidebar from 'primevue/sidebar'
import SelectButton from 'primevue/selectbutton'
import MultiSelect from 'primevue/multiselect'
import Dropdown from 'primevue/dropdown'
import Chip from 'primevue/chip'
import AddBookDialog from './AddBookDialog.vue'
import api from '../services/api.js'

const emit = defineEmits(['filter-change', 'refresh'])
const props = defineProps({
  booksQuantity: Number
})

const visibleFilters = ref(false)
const addBookDialogVisible = ref(false)

const searchText = ref('')
const readState = ref('all')
const sortField = ref('recent')
const sortOrder = ref('desc')

const selectedAuthors = ref([])
const authorsList = ref([])

const selectedPublishers = ref([])
const publishersList = ref([])

const selectedTags = ref([])
const tagsList = ref([])

const sortOptions = [
  { label: 'Adicionados Recentemente', value: 'recent' },
  { label: 'Título', value: 'title' },
  { label: 'Autor', value: 'authors' },
  { label: 'Data de Leitura', value: 'readDate' },
  { label: 'Data de Publicação', value: 'pubDate' }
]

const hasActiveFilters = computed(() => {
  return readState.value !== 'all' ||
    selectedAuthors.value.length > 0 ||
    selectedPublishers.value.length > 0 ||
    selectedTags.value.length > 0
})

function emitFilter(key, value) {
  emit('filter-change', { key, value })
}

function removeArrayFilter(type, item) {
  if (type === 'author') {
    selectedAuthors.value = selectedAuthors.value.filter(a => a.name !== item.name)
    emitFilter('author', selectedAuthors.value)
  }
  if (type === 'publisher') {
    selectedPublishers.value = selectedPublishers.value.filter(p => p.name !== item.name)
    emitFilter('publisher', selectedPublishers.value)
  }
  if (type === 'tags') {
    selectedTags.value = selectedTags.value.filter(t => t.name !== item.name)
    emitFilter('tags', selectedTags.value)
  }
}

function resetFilter(key) {
  if (key === 'readState') {
    readState.value = 'all'
    emitFilter('readState', 'all')
  }
}

function clearAllFilters() {
  readState.value = 'all'
  selectedAuthors.value = []
  selectedPublishers.value = []
  selectedTags.value = []
  searchText.value = ''
  sortField.value = 'recent'

  emitFilter('readState', 'all')
  emitFilter('author', [])
  emitFilter('publisher', [])
  emitFilter('tags', [])
  emitFilter('search', '')
  emitFilter('sortField', 'recent')
}

function toggleSortOrder() {
  sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc'
  emitFilter('sortOrder', sortOrder.value)
}

function openAddBookModal() { addBookDialogVisible.value = true }
function onBookSaved() { emit('refresh') }

onMounted(async () => {
  try {
    const [authorsData, publishersData, tagsData] = await Promise.all([
      api.getAuthors(),
      api.getPublishers(),
      api.getTags()
    ])
    authorsList.value = authorsData.map(a => ({ name: a.name || a }))
    publishersList.value = publishersData.map(p => ({ name: p.name || p }))
    tagsList.value = tagsData.map(t => ({ name: t.name || t }))
  } catch (error) {
    console.error("Erro ao carregar filtros:", error)
  }
})
</script>

<style scoped>
.library-header {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin-bottom: 1rem;
  width: 100%;
}

.top-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
}

.header-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  white-space: nowrap;
}

.header-title h1 {
  font-size: 1.5rem;
  margin: 0;
  color: var(--text-color);
}

.count-badge {
  background-color: var(--main-color);
  color: #000;
  font-weight: bold;
  font-size: 0.8rem;
  padding: 0.2rem 0.5rem;
  border-radius: 12px;
}

.search-area {
  flex: 1;
  max-width: 600px;
}

.main-search {
  width: 100%;
  border-radius: 2rem;
  background-color: #1e1e1e;
  border: 1px solid #333;
  color: #fff;
}

.actions {
  display: flex;
  gap: 0.5rem;
}

.add-button {
  background-color: var(--main-color);
  border: none;
}

.active-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
}

.filter-chip {
  background-color: #2a2a2a;
  color: #fff;
}

.filter-group {
  margin-bottom: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.filter-group label {
  font-weight: bold;
  color: var(--text-color);
  font-size: 0.9rem;
}

.sort-row {
  display: flex;
  gap: 0.5rem;
}

.w-full {
  width: 100%;
}

.sidebar-footer {
  margin-top: 2rem;
  border-top: 1px solid #333;
  padding-top: 1rem;
}

@media (max-width: 768px) {
  .top-bar {
    flex-wrap: wrap;
  }

  .header-title {
    width: 100%;
    justify-content: center;
    margin-bottom: 0.5rem;
  }

  .search-area {
    order: 2;
    min-width: 100%;
  }

  .actions {
    order: 3;
    width: 100%;
    justify-content: space-between;
    margin-top: 0.5rem;
  }
}
</style>
