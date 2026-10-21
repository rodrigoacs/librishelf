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

        <!-- Ordenar à mão, ao lado da busca (antes só dentro da gaveta de filtros).
             Dropdown do PrimeVue, e não <select>: a lista nativa não segue o tema. -->
        <Dropdown
          :modelValue="filters.sortField"
          :options="sortOptions"
          optionLabel="label"
          optionValue="value"
          :aria-label="t('library.sort_by')"
          class="sort-quick"
          panelClass="custom-panel sort-quick-panel"
          scrollHeight="22rem"
          @update:modelValue="value => emitFilter('sortField', value)"
        >
          <template #value>
            <span class="sort-quick-content">
              <i
                class="pi pi-sort-alt sort-quick-icon"
                aria-hidden="true"
              ></i>
              <span class="sort-quick-prefix">{{ t('library.sort_short') }}</span>
              <span class="sort-quick-value">{{ currentSortLabel }}</span>
            </span>
          </template>
        </Dropdown>
      </div>

      <div class="actions">
        <div
          class="view-toggle"
          role="group"
          :aria-label="t('library.view_label')"
        >
          <button
            v-for="mode in viewModes"
            :key="mode.value"
            type="button"
            class="view-btn"
            :class="{ active: view === mode.value }"
            :aria-pressed="view === mode.value"
            :aria-label="mode.label"
            v-tooltip.bottom="mode.label"
            @click="emit('view-change', mode.value)"
          >
            <i
              :class="mode.icon"
              aria-hidden="true"
            ></i>
          </button>
        </div>

        <Button
          icon="pi pi-check-square"
          class="p-button-rounded p-button-text action-btn"
          :class="{ 'active-filter': selecting }"
          :aria-pressed="selecting"
          :aria-label="t('batch.selectMode')"
          v-tooltip.bottom="t('batch.selectMode')"
          @click="emit('toggle-select')"
        />

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
          :label="readStateLabel(filters.readState)"
          removable
          @remove="emitFilter('readState', 'all')"
          class="custom-chip theme-border"
        />
        <Chip
          v-if="hasReadYear"
          :label="readPeriodLabel"
          removable
          @remove="clearReadPeriod"
          class="custom-chip theme-border"
        />
        <Chip
          v-if="filters.series"
          :label="t('series.chip', { series: filters.series })"
          removable
          @remove="emitFilter('series', '')"
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
          <Dropdown
            :modelValue="filters.readState"
            :options="readStateOptions"
            optionLabel="label"
            optionValue="value"
            aria-labelledby="filter-read-status"
            class="w-full custom-dropdown"
            panelClass="custom-panel"
            @update:modelValue="value => emitFilter('readState', value)"
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
            @update:modelValue="setReadYear"
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
import MultiSelect from 'primevue/multiselect'
import Dropdown from 'primevue/dropdown'
import Chip from 'primevue/chip'
import AddBookDialog from './AddBookDialog.vue'
import api from '../services/api.js'
import { useI18n } from 'vue-i18n'

const { t, locale } = useI18n()

// Os filtros vêm do useLibrary (fonte única); este componente só exibe e emite
// mudanças. Assim filtros vindos da URL, do "Limpar" do estado vazio etc.
// aparecem aqui como chips.
const props = defineProps({
  booksQuantity: Number,
  filters: { type: Object, required: true },
  view: { type: String, default: 'grid' },
  selecting: { type: Boolean, default: false }
})

const emit = defineEmits(['filter-change', 'reset', 'book-created', 'view-change', 'toggle-select'])

const viewModes = computed(() => [
  { value: 'grid', icon: 'pi pi-th-large', label: t('library.view_grid') },
  { value: 'list', icon: 'pi pi-list', label: t('library.view_list') }
])

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

const currentSortLabel = computed(() => sortOptions.value.find(option => option.value === props.filters.sortField)?.label ?? '')

const sortOptions = computed(() => [
  { label: t('library.sort.recent'), value: 'recent' },
  { label: t('library.sort.title'), value: 'title' },
  { label: t('library.sort.author'), value: 'authors' },
  { label: t('library.sort.read_date'), value: 'readDate' },
  { label: t('library.sort.pub_date'), value: 'pubDate' },
  { label: t('library.sort.rating'), value: 'rating' },
  { label: t('library.sort.series'), value: 'series' }
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

const READ_STATE_KEYS = {
  all: 'library.all',
  want: 'status.want',
  reading: 'status.reading',
  read: 'library.read',
  unread: 'library.unread'
}

const readStateOptions = computed(() =>
  ['all', 'want', 'reading', 'read', 'unread'].map(value => ({ value, label: t(READ_STATE_KEYS[value]) }))
)

function readStateLabel(value) {
  return t(READ_STATE_KEYS[value] ?? 'library.all')
}

// "Lidos em 2025" ou "Lidos em março de 2025" (quando veio do gráfico mensal).
const readPeriodLabel = computed(() => {
  const { readYear, readMonth } = props.filters
  if (!readMonth) return t('library.read_year_chip', { year: readYear })
  const month = new Date(Number(readYear), readMonth - 1, 1)
    .toLocaleDateString(locale.value === 'en' ? 'en-US' : 'pt-BR', { month: 'long', year: 'numeric' })
  return t('library.read_month_chip', { period: month })
})

// Trocar o ano tira o mês (ele só existe junto com o ano de onde veio).
function setReadYear(value) {
  emit('filter-change', { key: 'readMonth', value: null, silent: true })
  emitFilter('readYear', value)
}

function clearReadPeriod() {
  emit('filter-change', { key: 'readMonth', value: null, silent: true })
  emitFilter('readYear', 'all')
}

const hasActiveFilters = computed(() => {
  const f = props.filters
  return f.readState !== 'all' ||
    hasReadYear.value ||
    f.isbnStatus === 'invalid' ||
    Boolean(f.series) ||
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
  font-size: var(--fs-xl);
  margin: 0;
  font-family: var(--font-display);
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: -0.5px;
}

.count-badge {
  background-color: var(--main-solid);
  color: var(--on-main);
  font-weight: 800;
  font-size: var(--fs-xs);
  padding: 0.15rem 0.6rem;
  border-radius: 20px;
}

.view-toggle {
  display: inline-flex;
  padding: 3px;
  gap: 2px;
  border-radius: 999px;
  border: 1px solid var(--border-color);
  background: var(--bg-app);
}

.view-btn {
  width: 34px;
  height: 34px;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease;
}

.view-btn:hover {
  color: var(--text-primary);
}

.view-btn.active {
  background: var(--main-solid);
  color: var(--on-main);
}

.view-btn:focus-visible {
  outline: 2px solid var(--main-color);
  outline-offset: 2px;
}

.search-area {
  flex: 1;
  max-width: 760px;
  display: flex;
  align-items: center;
  gap: 0.6rem;
  min-width: 0;
}

.search-area .search-input-wrapper {
  flex: 1;
  min-width: 0;
}

.sort-quick.p-dropdown {
  flex-shrink: 0;
  height: 2.75rem;
  align-items: center;
  border-radius: 999px;
  border: 1px solid var(--border-color);
  background: var(--bg-input);
  box-shadow: none;
}

.sort-quick.p-dropdown:not(.p-disabled):hover {
  border-color: var(--border-hover);
}

.sort-quick.p-dropdown.p-focus {
  border-color: var(--main-color);
  box-shadow: 0 0 0 2px rgba(var(--main-color-rgb), 0.2);
}

.sort-quick :deep(.p-dropdown-label) {
  display: flex;
  align-items: center;
  padding: 0 0.25rem 0 0.95rem;
  background: transparent;
  border: none;
}

.sort-quick :deep(.p-dropdown-trigger) {
  width: 2.25rem;
  background: transparent;
  color: var(--text-secondary);
}

.sort-quick-content {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  min-width: 0;
  font-size: var(--fs-sm);
  color: var(--text-secondary);
}

.sort-quick-icon {
  display: none;
  font-size: var(--fs-sm);
}

.sort-quick-value {
  color: var(--text-primary);
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 11rem;
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
  font-size: var(--fs-sm);
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
  font-size: var(--fs-md);
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
  font-size: var(--fs-md);
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
  font-size: var(--fs-sm);
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
  font-size: var(--fs-sm);
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
  font-size: var(--fs-sm);
  white-space: nowrap;
}

.sidebar-header {
  margin-bottom: 2rem;
}

.sidebar-header h3 {
  margin: 0;
  font-size: var(--fs-xl);
  color: var(--text-primary);
}

.sidebar-header p {
  margin: 0.5rem 0 0;
  color: var(--text-secondary);
  font-size: var(--fs-md);
}

.sidebar-content {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.filter-group label {
  display: block;
  font-size: var(--fs-sm);
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
    font-size: var(--fs-lg);
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

  .sort-quick.p-dropdown {
    height: 2.6rem;
  }

  .sort-quick :deep(.p-dropdown-label) {
    padding-left: 0.8rem;
  }

  .sort-quick-prefix {
    display: none;
  }

  .sort-quick-icon {
    display: inline;
  }

  .sort-quick-value {
    display: none;
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

.p-dropdown-label {
  background-color: #00000000;
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
  background-color: var(--main-solid) !important;
  border-color: var(--main-solid) !important;
  color: var(--on-main) !important;
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

/* Lista do "Ordenar" ao lado da busca */
.sort-quick-panel.p-dropdown-panel {
  min-width: 13rem;
  margin-top: 0.35rem;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.3);
}

.sort-quick-panel .p-dropdown-items {
  padding: 0.35rem;
}

.sort-quick-panel .p-dropdown-item {
  border-radius: 8px;
  padding: 0.6rem 0.85rem;
  font-size: var(--fs-sm);
}

/* Tela de toque: área de toque de 44px sem mudar o desenho de 34px */
@media (pointer: coarse) {
  .view-btn {
    position: relative;
  }

  .view-btn::after {
    content: '';
    position: absolute;
    inset: -5px;
    border-radius: 50%;
  }
}
</style>