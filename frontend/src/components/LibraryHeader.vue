<template>
  <div class="library-header-wrapper">
    <div class="top-bar">

      <div class="header-title">
        <h1>Library</h1>
        <span
          class="count-badge"
          v-if="booksQuantity !== undefined"
        >{{ booksQuantity }}</span>
      </div>

      <div class="search-area">
        <div class="search-input-wrapper">
          <i class="pi pi-search search-icon" />
          <input
            v-model="searchText"
            placeholder="Buscar por título, ISBN..."
            class="custom-search-input"
            @input="emitFilter('search', searchText)"
          />
          <i
            v-if="searchText"
            class="pi pi-times clear-icon"
            @click="clearSearch"
          ></i>
        </div>
      </div>

      <div class="actions">
        <Button
          icon="pi pi-filter"
          class="p-button-rounded p-button-text action-btn"
          :class="{ 'active-filter': hasActiveFilters }"
          @click="visibleFilters = true"
          v-tooltip.bottom="'Filtros Avançados'"
        />

        <Button
          label="Novo"
          icon="pi pi-plus"
          class="p-button-rounded btn-action-primary add-btn"
          @click="openAddBookModal"
        />
      </div>
    </div>

    <div
      class="active-filters-bar"
      v-if="hasActiveFilters"
    >
      <div class="filter-label">Filtrando por:</div>
      <div class="chips-container">
        <Chip
          v-if="readState !== 'all'"
          :label="readState === 'read' ? 'Lidos' : 'Não Lidos'"
          removable
          @remove="resetFilter('readState')"
          class="custom-chip theme-border"
        />
        <Chip
          v-for="a in selectedAuthors"
          :key="a.name"
          :label="a.name"
          removable
          @remove="removeArrayFilter('author', a)"
          class="custom-chip theme-border"
        />
        <Chip
          v-for="p in selectedPublishers"
          :key="p.name"
          :label="p.name"
          removable
          @remove="removeArrayFilter('publisher', p)"
          class="custom-chip theme-border"
        />
        <Chip
          v-for="t in selectedTags"
          :key="t.name"
          :label="'#' + t.name"
          removable
          @remove="removeArrayFilter('tags', t)"
          class="custom-chip theme-border"
        />
      </div>
      <Button
        label="Limpar tudo"
        class="p-button-text p-button-sm p-button-danger clear-all-btn"
        @click="clearAllFilters"
      />
    </div>

    <Sidebar
      v-model:visible="visibleFilters"
      position="right"
      class="custom-sidebar"
      :modal="true"
    >
      <div class="sidebar-header">
        <h3>Filtros & Ordenação</h3>
        <p>Refine sua visualização</p>
      </div>

      <div class="sidebar-content">
        <div class="filter-group">
          <label>Status de Leitura</label>
          <SelectButton
            v-model="readState"
            :options="['all', 'read', 'unread']"
            :optionLabel="opt => opt === 'all' ? 'Todos' : (opt === 'read' ? 'Lidos' : 'Não Lidos')"
            @change="emitFilter('readState', readState)"
            class="w-full custom-selectbutton"
          />
        </div>

        <div class="filter-group">
          <label>Ano de leitura</label>
          <Dropdown
            v-model="readYear"
            :options="yearOptions"
            optionLabel="label"
            optionValue="value"
            placeholder="Selecione o ano"
            class="w-full custom-dropdown"
            panelClass="custom-panel"
            @change="emitFilter('readYear', readYear)"
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
              class="custom-dropdown"
              panelClass="custom-panel"
              @change="emitFilter('sortField', sortField)"
            />
            <Button
              @click="toggleSortOrder"
              :icon="sortOrder === 'asc' ? 'pi pi-sort-amount-down' : 'pi pi-sort-amount-up-alt'"
              class="p-button-outlined p-button-secondary sort-btn"
            />
          </div>
        </div>

        <div class="filter-group">
          <label>Tags</label>
          <MultiSelect
            v-model="selectedTags"
            :options="tagsList"
            optionLabel="name"
            placeholder="Selecione tags"
            :maxSelectedLabels="2"
            selectedItemsLabel="{0} tags selecionadas"
            filter
            class="w-full custom-multiselect"
            panelClass="custom-panel"
            @change="emitFilter('tags', selectedTags)"
          />
        </div>

        <div class="filter-group">
          <label>Autores</label>
          <MultiSelect
            v-model="selectedAuthors"
            :options="authorsList"
            optionLabel="name"
            placeholder="Selecione autores"
            :maxSelectedLabels="2"
            selectedItemsLabel="{0} autores selecionados"
            filter
            class="w-full custom-multiselect"
            panelClass="custom-panel"
            @change="emitFilter('author', selectedAuthors)"
          />
        </div>

        <div class="filter-group">
          <label>Editoras</label>
          <MultiSelect
            v-model="selectedPublishers"
            :options="publishersList"
            optionLabel="name"
            placeholder="Selecione editoras"
            :maxSelectedLabels="2"
            selectedItemsLabel="{0} editoras selecionadas"
            filter
            class="w-full custom-multiselect"
            panelClass="custom-panel"
            @change="emitFilter('publisher', selectedPublishers)"
          />
        </div>
      </div>

      <div class="sidebar-footer">
        <Button
          label="Limpar Filtros"
          icon="pi pi-filter-slash"
          class="p-button-outlined p-button-danger w-full"
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

const readYear = ref(null) // Inicialize como null

const yearOptions = computed(() => {
  const currentYear = new Date().getFullYear()

  // Gera array de objetos: [{ label: '2025', value: '2025' }, ...]
  const years = Array.from({ length: currentYear - 1999 }, (_, i) => {
    const year = (currentYear - i).toString()
    return { label: year, value: year }
  })

  // Adiciona a opção "Todos" no topo com valor null (para limpar o filtro)
  return [{ label: 'Todos os anos', value: null }, ...years]
})

const hasActiveFilters = computed(() => {
  return readState.value !== 'all' ||
    selectedAuthors.value.length > 0 ||
    selectedPublishers.value.length > 0 ||
    selectedTags.value.length > 0
})

function emitFilter(key, value) {
  emit('filter-change', { key, value })
}

function clearSearch() {
  searchText.value = ''
  emitFilter('search', '')
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
.library-header-wrapper {
  display: flex;
  flex-direction: column;
  width: 100%;
  background-color: rgba(18, 18, 18, 0.85);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  padding: 1rem 1.5rem;
}

.top-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1.5rem;
}

.header-title {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  white-space: nowrap;
}

.header-title h1 {
  font-size: 1.5rem;
  margin: 0;
  font-family: 'Georgia', serif;
  font-weight: 700;
  color: #fff;
  letter-spacing: -0.5px;
}

.count-badge {
  background-color: var(--main-color, #4caf50);
  color: #000;
  font-weight: 800;
  font-size: 0.75rem;
  padding: 0.15rem 0.6rem;
  border-radius: 20px;
}

.search-area {
  flex: 1;
  max-width: 600px;
}

.search-input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;
}

.search-icon {
  position: absolute;
  left: 1rem;
  color: #71717a;
  pointer-events: none;
}

.clear-icon {
  position: absolute;
  right: 1rem;
  color: #71717a;
  cursor: pointer;
  font-size: 0.8rem;
}

.clear-icon:hover {
  color: #fff;
}

.custom-search-input {
  width: 100%;
  background-color: #27272a;
  border: 1px solid transparent;
  color: #fff;
  padding: 0.75rem 2.5rem;
  border-radius: 50px;
  font-family: inherit;
  font-size: 0.95rem;
  transition: all 0.2s ease;
}

.custom-search-input:focus {
  background-color: #18181b;
  border-color: var(--main-color, #4caf50);
  box-shadow: 0 0 0 2px rgba(var(--main-color-rgb), 0.2);
  outline: none;
}

.actions {
  display: flex;
  gap: 0.75rem;
  align-items: center;
}

.action-btn {
  color: #a1a1aa !important;
  width: 42px;
  height: 42px;
}

.action-btn:hover {
  background-color: rgba(255, 255, 255, 0.1) !important;
  color: #fff !important;
}

.action-btn.active-filter {
  color: var(--main-color, #4caf50) !important;
  background-color: rgba(var(--main-color-rgb), 0.1) !important;
}

.add-btn {
  font-weight: 600;
  padding: 0.6rem 1.2rem;
  font-size: 0.9rem;
}

.active-filters-bar {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-top: 1rem;
  padding-top: 0.8rem;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
  animation: slideDown 0.2s ease-out;
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.filter-label {
  font-size: 0.8rem;
  color: #71717a;
  text-transform: uppercase;
  font-weight: 600;
}

.chips-container {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  flex: 1;
}

.custom-chip {
  background-color: #27272a;
  color: #e4e4e7;
  font-size: 0.85rem;
  border: 1px solid #3f3f46;
}

.custom-chip.theme-border {
  border-color: rgba(var(--main-color-rgb), 0.3);
  background-color: rgba(var(--main-color-rgb), 0.05);
  color: #fff;
}

.clear-all-btn {
  font-size: 0.8rem;
  white-space: nowrap;
}

.sidebar-header {
  margin-bottom: 2rem;
}

.sidebar-header h3 {
  margin: 0;
  font-size: 1.5rem;
  color: #fff;
}

.sidebar-header p {
  margin: 0.5rem 0 0;
  color: #a1a1aa;
  font-size: 0.9rem;
}

.sidebar-content {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.filter-group label {
  display: block;
  font-size: 0.85rem;
  color: #a1a1aa;
  margin-bottom: 0.5rem;
  font-weight: 600;
  text-transform: uppercase;
}

.sort-row {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  width: 100%;
}

.sort-row .custom-dropdown {
  flex: 1;
  width: auto !important;
  min-width: 0;
}

.sort-btn {
  flex-shrink: 0;
}

.sidebar-footer {
  margin-top: auto;
  padding-top: 2rem;
}

@media (max-width: 768px) {
  .top-bar {
    flex-wrap: wrap;
    gap: 1rem;
  }

  .header-title {
    width: 100%;
    justify-content: center;
  }

  .search-area {
    order: 3;
    min-width: 100%;
  }

  .actions {
    order: 2;
    width: 100%;
    justify-content: space-between;
  }

  .add-btn {
    width: auto;
  }

  .active-filters-bar {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>

<style>
.custom-sidebar.p-sidebar {
  background-color: #18181b !important;
  border-left: 1px solid #27272a;
  width: 24rem !important;
}

@media (max-width: 768px) {
  .custom-sidebar.p-sidebar {
    width: 90vw !important;
  }
}

.custom-sidebar .p-sidebar-header {
  display: none !important;
}

.custom-sidebar .p-sidebar-content {
  padding: 2rem !important;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.custom-sidebar .p-dropdown,
.custom-sidebar .p-multiselect {
  background-color: #27272a;
  border: 1px solid #3f3f46;
  border-radius: 8px;
  transition: all 0.2s;
  height: 42px;
  display: flex;
  align-items: center;
}

.custom-sidebar .p-multiselect-label-container {
  display: flex;
  align-items: center;
  padding-top: 0;
  padding-bottom: 0;
}

.custom-sidebar .p-dropdown:not(.p-disabled):hover,
.custom-sidebar .p-multiselect:not(.p-disabled):hover,
.custom-sidebar .p-dropdown.p-focus,
.custom-sidebar .p-multiselect.p-focus {
  border-color: var(--main-color, #4caf50) !important;
  box-shadow: 0 0 0 1px rgba(var(--main-color-rgb), 0.2) !important;
}

.custom-sidebar .p-dropdown-label,
.custom-sidebar .p-multiselect-label {
  color: #e4e4e7;
}

.custom-selectbutton .p-button {
  background-color: #27272a;
  border: 1px solid #3f3f46;
  color: #a1a1aa;
  transition: all 0.2s;
}

.custom-selectbutton .p-button:hover {
  background-color: #3f3f46;
}

.custom-selectbutton .p-button.p-highlight {
  background-color: var(--main-color, #4caf50) !important;
  border-color: var(--main-color, #4caf50) !important;
  color: #ffffff !important;
  font-weight: 700;
}

.custom-panel.p-dropdown-panel,
.custom-panel.p-multiselect-panel {
  background-color: #18181b !important;
  border: 1px solid #3f3f46 !important;
}

.custom-panel .p-dropdown-item,
.custom-panel .p-multiselect-item {
  color: #e4e4e7 !important;
}

.custom-panel .p-dropdown-item:hover,
.custom-panel .p-multiselect-item:hover {
  background-color: #27272a !important;
}

.custom-panel .p-dropdown-item.p-highlight,
.custom-panel .p-multiselect-item.p-highlight {
  color: var(--main-color, #4caf50) !important;
  background-color: rgba(var(--main-color-rgb), 0.1) !important;
}
</style>
