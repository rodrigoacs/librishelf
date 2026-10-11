<template>
  <div class="library-header-wrapper">
    <div class="top-bar">

      <div class="header-title">
        <h1>{{ t('menu.library') }}</h1>
        <span
          class="count-badge"
          v-if="booksQuantity !== undefined"
        >{{ booksQuantity }}</span>
      </div>

      <div class="search-area">
        <div
          class="search-input-wrapper"
          role="search"
        >
          <i
            class="pi pi-search search-icon"
            aria-hidden="true"
          />
          <label
            for="library-search"
            class="sr-only"
          >{{ t('library.search_label') }}</label>
          <input
            id="library-search"
            v-model="searchText"
            type="search"
            :placeholder="t('library.search_ph')"
            class="custom-search-input"
            autocomplete="off"
            @input="emitFilter('search', searchText)"
          />
          <button
            v-if="searchText"
            type="button"
            class="clear-icon"
            :aria-label="t('library.clear_search')"
            @click="clearSearch"
          >
            <i
              class="pi pi-times"
              aria-hidden="true"
            ></i>
          </button>
        </div>
      </div>

      <div class="actions">
        <Button
          icon="pi pi-filter"
          class="p-button-rounded p-button-text action-btn"
          :class="{ 'active-filter': hasActiveFilters }"
          @click="visibleFilters = true"
          v-tooltip.bottom="t('library.filters_adv')"
          :aria-label="t('library.filters_adv')"
          :aria-expanded="visibleFilters"
        />

        <Button
          :label="t('common.new')"
          icon="pi pi-plus"
          class="p-button-rounded btn-action-primary add-btn"
          @click="addBookDialogVisible = true"
        />
      </div>
    </div>

    <div
      class="active-filters-bar"
      v-if="hasActiveFilters"
    >
      <div class="filter-label">{{ t('library.filtering_by') }}</div>
      <div class="chips-container">
        <Chip
          v-if="filters.readState !== 'all'"
          :label="filters.readState === 'read' ? t('library.read') : t('library.unread')"
          removable
          @remove="emitFilter('readState', 'all')"
          class="custom-chip theme-border"
        />
        <Chip
          v-if="hasReadYear"
          :label="t('library.read_year_chip', { year: filters.readYear })"
          removable
          @remove="emitFilter('readYear', 'all')"
          class="custom-chip theme-border"
        />
        <Chip
          v-if="filters.isbnStatus === 'invalid'"
          :label="t('library.invalid_isbn_chip')"
          removable
          @remove="emitFilter('isbnStatus', 'all')"
          class="custom-chip theme-border"
        />
        <Chip
          v-for="name in filters.author"
          :key="`author-${name}`"
          :label="name"
          removable
          @remove="removeFromList('author', name)"
          class="custom-chip theme-border"
        />
        <Chip
          v-for="name in filters.publisher"
          :key="`publisher-${name}`"
          :label="name"
          removable
          @remove="removeFromList('publisher', name)"
          class="custom-chip theme-border"
        />
        <Chip
          v-for="name in filters.tags"
          :key="`tag-${name}`"
          :label="'#' + name"
          removable
          @remove="removeFromList('tags', name)"
          class="custom-chip tag-chip"
          :style="{ '--tag-color': tagColor(name) }"
        />
      </div>
      <Button
        :label="t('library.clear_all')"
        class="p-button-text p-button-sm p-button-danger clear-all-btn"
        @click="emit('reset')"
      />
    </div>

    <Sidebar
      v-model:visible="visibleFilters"
      position="right"
      class="custom-sidebar"
      :modal="true"
      :aria-label="t('library.filters_adv')"
    >
      <div class="sidebar-header">
        <h3>{{ t('library.filters_adv') }}</h3>
        <p>{{ t('library.refine_view') }}</p>
      </div>

      <div class="sidebar-content">
        <div class="filter-group">
          <label id="filter-read-status">{{ t('library.read_status') }}</label>
          <SelectButton
            :modelValue="filters.readState"
            :options="['all', 'read', 'unread']"
            :optionLabel="opt => opt === 'all' ? t('library.all') : (opt === 'read' ? t('library.read') : t('library.unread'))"
            :allowEmpty="false"
            aria-labelledby="filter-read-status"
            @update:modelValue="value => emitFilter('readState', value)"
            class="w-full custom-selectbutton"
          />
        </div>

        <div class="filter-group">
          <label for="filter-read-year">{{ t('library.read_year') }}</label>
          <Dropdown
            inputId="filter-read-year"
            :modelValue="hasReadYear ? filters.readYear : 'all'"
            :options="yearOptions"
            optionLabel="label"
            optionValue="value"
            :placeholder="t('library.select_year')"
            class="w-full custom-dropdown"
            panelClass="custom-panel"
            @update:modelValue="value => emitFilter('readYear', value)"
          />
        </div>

        <div class="filter-group">
          <label for="filter-sort">{{ t('library.sort_by') }}</label>
          <div class="sort-row">
            <Dropdown
              inputId="filter-sort"
              :modelValue="filters.sortField"
              :options="sortOptions"
              optionLabel="label"
              optionValue="value"
              class="custom-dropdown"
              panelClass="custom-panel"
              @update:modelValue="value => emitFilter('sortField', value)"
            />
            <Button
              @click="emitFilter('sortOrder', filters.sortOrder === 'asc' ? 'desc' : 'asc')"
              :icon="filters.sortOrder === 'asc' ? 'pi pi-sort-amount-down' : 'pi pi-sort-amount-up-alt'"
              :aria-label="filters.sortOrder === 'asc' ? t('library.sort_asc') : t('library.sort_desc')"
              v-tooltip.bottom="filters.sortOrder === 'asc' ? t('library.sort_asc') : t('library.sort_desc')"
              class="p-button-outlined p-button-secondary sort-btn"
            />
          </div>
        </div>

        <div class="filter-group">
          <label for="filter-tags">{{ t('library.tags') }}</label>
          <MultiSelect
            inputId="filter-tags"
            :modelValue="filters.tags"
            :options="tagsList"
            optionLabel="name"
            optionValue="name"
            :placeholder="t('library.select_tags')"
            :maxSelectedLabels="2"
            :selectedItemsLabel="`{0} ${t('library.selected_tags')}`"
            filter
            class="w-full custom-multiselect"
            panelClass="custom-panel"
            @update:modelValue="value => emitFilter('tags', value)"
          />
        </div>

        <div class="filter-group">
          <label for="filter-authors">{{ t('library.authors') }}</label>
          <MultiSelect
            inputId="filter-authors"
            :modelValue="filters.author"
            :options="authorsList"
            optionLabel="name"
            optionValue="name"
            :placeholder="t('library.select_authors')"
            :maxSelectedLabels="2"
            :selectedItemsLabel="`{0} ${t('library.selected_authors')}`"
            filter
            class="w-full custom-multiselect"
            panelClass="custom-panel"
            @update:modelValue="value => emitFilter('author', value)"
          />
        </div>

        <div class="filter-group">
          <label for="filter-publishers">{{ t('library.publishers') }}</label>
          <MultiSelect
            inputId="filter-publishers"
            :modelValue="filters.publisher"
            :options="publishersList"
            optionLabel="name"
            optionValue="name"
            :placeholder="t('library.select_publishers')"
            :maxSelectedLabels="2"
            :selectedItemsLabel="`{0} ${t('library.selected_publishers')}`"
            filter
            class="w-full custom-multiselect"
            panelClass="custom-panel"
            @update:modelValue="value => emitFilter('publisher', value)"
          />
        </div>
      </div>

      <div class="sidebar-footer">
        <Button
          :label="t('library.clear_all')"
          icon="pi pi-filter-slash"
          class="p-button-outlined p-button-danger w-full"
          @click="emit('reset')"
        />
      </div>
    </Sidebar>

    <AddBookDialog
      v-model:visible="addBookDialogVisible"
      @save="onBookCreated"
    />
  </div>
</template>

<script setup>
import { tagColor } from '../utils/tagColors.js'
import { ref, computed, watch, onMounted } from 'vue'
import Button from 'primevue/button'
import Sidebar from 'primevue/sidebar'
import SelectButton from 'primevue/selectbutton'
import MultiSelect from 'primevue/multiselect'
import Dropdown from 'primevue/dropdown'
import Chip from 'primevue/chip'
import AddBookDialog from './AddBookDialog.vue'
import api from '../services/api.js'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

// Os filtros vêm do useLibrary (fonte única); este componente só exibe e emite
// mudanças. Assim filtros vindos da URL, do "Limpar" do estado vazio etc.
// aparecem aqui como chips.
const props = defineProps({
  booksQuantity: Number,
  filters: { type: Object, required: true }
})

const emit = defineEmits(['filter-change', 'reset', 'book-created'])

const visibleFilters = ref(false)
const addBookDialogVisible = ref(false)

const searchText = ref(props.filters.search || '')
watch(() => props.filters.search, (value) => {
  if (value !== searchText.value) searchText.value = value || ''
})

const authorsList = ref([])
const publishersList = ref([])
const tagsList = ref([])

const FIRST_YEAR = 1950

const sortOptions = computed(() => [
  { label: t('library.sort.recent'), value: 'recent' },
  { label: t('library.sort.title'), value: 'title' },
  { label: t('library.sort.author'), value: 'authors' },
  { label: t('library.sort.read_date'), value: 'readDate' },
  { label: t('library.sort.pub_date'), value: 'pubDate' },
  { label: t('library.sort.rating'), value: 'rating' }
])

const yearOptions = computed(() => {
  const currentYear = new Date().getFullYear()
  const years = Array.from({ length: currentYear - FIRST_YEAR + 1 }, (_, i) => {
    const year = String(currentYear - i)
    return { label: year, value: year }
  })
  return [{ label: t('library.sort.all_years'), value: 'all' }, ...years]
})

const hasReadYear = computed(() => Boolean(props.filters.readYear) && props.filters.readYear !== 'all')

const hasActiveFilters = computed(() => {
  const f = props.filters
  return f.readState !== 'all' ||
    hasReadYear.value ||
    f.isbnStatus === 'invalid' ||
    f.author.length > 0 ||
    f.publisher.length > 0 ||
    f.tags.length > 0
})

function emitFilter(key, value) {
  emit('filter-change', { key, value })
}

function clearSearch() {
  searchText.value = ''
  emitFilter('search', '')
}

function removeFromList(key, name) {
  emitFilter(key, props.filters[key].filter(item => item !== name))
}

async function loadOptions() {
  try {
    const [authorsData, publishersData, tagsData] = await Promise.all([
      api.getAuthors(),
      api.getPublishers(),
      api.getTags()
    ])
    authorsList.value = authorsData
    publishersList.value = publishersData
    tagsList.value = tagsData
  } catch (error) {
    console.error('Erro ao carregar filtros:', error)
  }
}

function onBookCreated() {
  emit('book-created')
  loadOptions()
}

onMounted(loadOptions)

// A Library chama isto depois de editar/excluir um livro: autores, editoras e
// tags novos aparecem nos filtros sem recarregar a página.
defineExpose({ reloadOptions: loadOptions })
</script>

<style scoped>
.library-header-wrapper {
  display: flex;
  flex-direction: column;
  width: 100%;
  background-color: var(--bg-panel);
  border-bottom: 1px solid var(--border-color);
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
  color: var(--text-primary);
  letter-spacing: -0.5px;
}

.count-badge {
  background-color: var(--main-color);
  color: var(--text-inverse);
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
  color: var(--text-muted);
  pointer-events: none;
}

.clear-icon {
  position: absolute;
  right: 1rem;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 0.8rem;
}

.clear-icon {
  background: none;
  border: none;
  padding: 0.25rem;
  display: flex;
  align-items: center;
  border-radius: 50%;
}

.clear-icon:hover {
  color: var(--text-primary);
}

.custom-search-input::-webkit-search-cancel-button {
  -webkit-appearance: none;
  appearance: none;
}

.custom-search-input {
  width: 100%;
  background-color: var(--bg-input);
  border: 1px solid transparent;
  color: var(--text-primary);
  padding: 0.75rem 2.5rem;
  border-radius: 50px;
  font-family: inherit;
  font-size: 0.95rem;
  transition: all 0.2s ease;
}

.custom-search-input:focus {
  background-color: var(--bg-panel);
  border-color: var(--main-color);
  box-shadow: 0 0 0 2px rgba(var(--main-color-rgb), 0.2);
  outline: none;
}

.actions {
  display: flex;
  gap: 0.75rem;
  align-items: center;
}

.action-btn {
  color: var(--text-secondary) !important;
  width: 42px;
  height: 42px;
}

.action-btn:hover {
  background-color: var(--bg-hover) !important;
  color: var(--text-primary) !important;
}

.action-btn.active-filter {
  color: var(--main-color) !important;
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
  border-top: 1px solid var(--border-color);
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
  color: var(--text-muted);
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
  background-color: var(--bg-input);
  color: var(--text-primary);
  font-size: 0.85rem;
  border: 1px solid var(--border-color);
}

.custom-chip.tag-chip {
  color: var(--tag-color);
  background: color-mix(in srgb, var(--tag-color) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--tag-color) 40%, transparent);
}

.custom-chip.theme-border {
  border-color: rgba(var(--main-color-rgb), 0.3);
  background-color: rgba(var(--main-color-rgb), 0.05);
  color: var(--text-primary);
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
  color: var(--text-primary);
}

.sidebar-header p {
  margin: 0.5rem 0 0;
  color: var(--text-secondary);
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
  color: var(--text-secondary);
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
  /* Celular: duas linhas só — título e ações em cima, busca embaixo. O
     cabeçalho é fixo no topo, então cada pixel aqui é um pixel a menos de estante. */
  .library-header-wrapper {
    padding: 0.75rem 1rem;
  }

  .top-bar {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas:
      "title actions"
      "search search";
    gap: 0.6rem 0.75rem;
  }

  .header-title {
    grid-area: title;
    gap: 0.6rem;
  }

  .header-title h1 {
    font-size: 1.3rem;
  }

  .actions {
    grid-area: actions;
    gap: 0.25rem;
  }

  .search-area {
    grid-area: search;
    min-width: 0;
    max-width: none;
  }

  .custom-search-input {
    padding-top: 0.6rem;
    padding-bottom: 0.6rem;
  }

  .add-btn {
    width: auto;
    padding: 0.5rem 0.95rem;
  }

  /* Filtros ativos numa linha só: os chips rolam para o lado e o
     "Limpar tudo" fica sempre à mão no fim. */
  .active-filters-bar {
    margin-top: 0.6rem;
    gap: 0.5rem;
    flex-wrap: nowrap;
  }

  .filter-label {
    display: none;
  }

  .chips-container {
    flex: 1;
    min-width: 0;
    flex-wrap: nowrap;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .chips-container::-webkit-scrollbar {
    display: none;
  }

  .chips-container .custom-chip {
    flex-shrink: 0;
  }

  .clear-all-btn {
    flex-shrink: 0;
    padding: 0.35rem 0.5rem !important;
  }
}
</style>

<style>
.custom-sidebar.p-sidebar {
  background-color: var(--bg-panel) !important;
  border-left: 1px solid var(--border-color);
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
  background-color: var(--bg-input);
  border: 1px solid var(--border-color);
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
  border-color: var(--main-color) !important;
  box-shadow: 0 0 0 1px rgba(var(--main-color-rgb), 0.2) !important;
}

.custom-sidebar .p-dropdown-label,
.custom-sidebar .p-multiselect-label {
  color: var(--text-primary);
}

.custom-selectbutton .p-button {
  background-color: var(--bg-input);
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  transition: all 0.2s;
}

.custom-selectbutton .p-button:hover {
  background-color: var(--bg-hover);
}

.p-selectbutton .p-button.p-highlight::before {
  background-color: #00000000 !important;
}

.p-multiselect-panel .p-multiselect-header {
  background-color: var(--bg-panel) !important;
  border-bottom: 1px solid var(--border-color) !important;
}

.custom-selectbutton .p-button.p-highlight {
  background-color: var(--main-color) !important;
  border-color: var(--main-color) !important;
  color: var(--text-primary) !important;
  font-weight: 700;
}

.custom-panel.p-dropdown-panel,
.custom-panel.p-multiselect-panel {
  background-color: var(--bg-panel) !important;
  border: 1px solid var(--border-color) !important;
}

.custom-panel .p-dropdown-item,
.custom-panel .p-multiselect-item {
  color: var(--text-primary) !important;
}

.custom-panel .p-dropdown-item:hover,
.custom-panel .p-multiselect-item:hover {
  background-color: var(--bg-hover) !important;
}

.custom-panel .p-dropdown-item.p-highlight,
.custom-panel .p-multiselect-item.p-highlight {
  color: var(--main-color) !important;
  background-color: rgba(var(--main-color-rgb), 0.1) !important;
}
</style>