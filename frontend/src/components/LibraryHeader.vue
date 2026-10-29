<template>
  <div class="library-header-wrapper">
    <div class="top-bar">

      <div class="header-title">
        <PageHeader
          compact
          :title="t('menu.library')"
        />
        <span
          class="count-badge"
          v-if="booksQuantity !== undefined"
          aria-live="polite"
        >{{ countLabel }}</span>
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
            ref="searchInput"
            v-model="searchText"
            type="search"
            :placeholder="longPlaceholderFits ? t('library.search_ph') : t('library.search_ph_short')"
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
             AppSelect, e não <select>: a lista nativa não segue o tema. -->
        <AppSelect
          :modelValue="filters.sortField"
          :options="sortOptions"
          optionLabel="label"
          optionValue="value"
          :aria-label="t('library.sort_by')"
          class="sort-quick"
          panel-class="sort-quick-panel"
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
        </AppSelect>
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

        <AppButton
          icon="pi pi-check-square"
          class="btn-rounded btn-text action-btn"
          :class="{ 'active-filter': selecting }"
          :aria-pressed="selecting"
          :aria-label="t('batch.selectMode')"
          v-tooltip.bottom="t('batch.selectMode')"
          @click="emit('toggle-select')"
        />

        <AppButton
          icon="pi pi-filter"
          class="btn-rounded btn-text action-btn"
          :class="{ 'active-filter': hasActiveFilters }"
          @click="visibleFilters = true"
          v-tooltip.bottom="t('library.filters_adv')"
          :aria-label="t('library.filters_adv')"
          :aria-expanded="visibleFilters"
        />

        <AppButton
          :label="t('home.addBook')"
          :aria-label="t('home.addBook')"
          icon="pi pi-plus"
          class="btn-rounded btn-primary add-btn"
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
        <AppChip
          v-if="filters.readState !== 'all'"
          :label="readStateLabel(filters.readState)"
          removable
          @remove="emitFilter('readState', 'all')"
          class="custom-chip theme-border"
        />
        <AppChip
          v-if="hasReadYear"
          :label="readPeriodLabel"
          removable
          @remove="clearReadPeriod"
          class="custom-chip theme-border"
        />
        <AppChip
          v-if="filters.series"
          :label="t('series.chip', { series: filters.series })"
          removable
          @remove="emitFilter('series', '')"
          class="custom-chip theme-border"
        />
        <AppChip
          v-if="filters.isbnStatus === 'invalid'"
          :label="t('library.invalid_isbn_chip')"
          removable
          @remove="emitFilter('isbnStatus', 'all')"
          class="custom-chip theme-border"
        />
        <AppChip
          v-for="name in filters.author"
          :key="`author-${name}`"
          :label="name"
          removable
          @remove="removeFromList('author', name)"
          class="custom-chip theme-border"
        />
        <AppChip
          v-for="name in filters.publisher"
          :key="`publisher-${name}`"
          :label="name"
          removable
          @remove="removeFromList('publisher', name)"
          class="custom-chip theme-border"
        />
        <AppChip
          v-for="name in filters.tags"
          :key="`tag-${name}`"
          :label="'#' + name"
          removable
          @remove="removeFromList('tags', name)"
          class="custom-chip tag-chip"
          :style="{ '--tag-color': tagColor(name) }"
        />
      </div>
      <AppButton
        :label="t('library.clear_all')"
        class="btn-text btn-sm btn-secondary clear-all-btn"
        @click="emit('reset')"
      />
    </div>

    <AppDialog
      v-model:visible="visibleFilters"
      drawer
      dialog-class="filters-drawer"
      :aria-label="t('library.filters_adv')"
    >
      <div class="drawer-body">
        <div class="sidebar-header">
          <div>
            <h3>{{ t('library.filters_adv') }}</h3>
            <p>{{ t('library.refine_view') }}</p>
          </div>
          <IconButton
            icon="pi pi-times"
            :label="t('common.close')"
            @click="visibleFilters = false"
          />
        </div>

        <div class="sidebar-content">
          <!-- Celular: o alternador grade/lista sai do cabeçalho e mora aqui
               (no cabeçalho ele empurrava o título para baixo das ações) -->
          <div class="filter-group view-group">
            <span
              id="filter-view"
              class="group-label"
            >{{ t('library.view_label') }}</span>
            <div
              class="view-toggle view-toggle-wide"
              role="group"
              aria-labelledby="filter-view"
            >
              <button
                v-for="mode in viewModes"
                :key="mode.value"
                type="button"
                class="view-btn view-btn-wide"
                :class="{ active: view === mode.value }"
                :aria-pressed="view === mode.value"
                @click="emit('view-change', mode.value)"
              >
                <i
                  :class="mode.icon"
                  aria-hidden="true"
                ></i>
                <span>{{ mode.label }}</span>
              </button>
            </div>
          </div>

          <div class="filter-group">
            <label id="filter-read-status">{{ t('library.read_status') }}</label>
            <AppSelect
              :modelValue="filters.readState"
              :options="readStateOptions"
              optionLabel="label"
              optionValue="value"
              aria-labelledby="filter-read-status"
              class="w-full"
              @update:modelValue="value => emitFilter('readState', value)"
            />
          </div>

          <div class="filter-group">
            <label for="filter-read-year">{{ t('library.read_year') }}</label>
            <AppSelect
              inputId="filter-read-year"
              :modelValue="hasReadYear ? filters.readYear : 'all'"
              :options="yearOptions"
              optionLabel="label"
              optionValue="value"
              :placeholder="t('library.select_year')"
              class="w-full"
              @update:modelValue="setReadYear"
            />
          </div>

          <div class="filter-group">
            <label for="filter-sort">{{ t('library.sort_by') }}</label>
            <div class="sort-row">
              <AppSelect
                inputId="filter-sort"
                :modelValue="filters.sortField"
                :options="sortOptions"
                optionLabel="label"
                optionValue="value"
                class="custom-dropdown"
                @update:modelValue="value => emitFilter('sortField', value)"
              />
              <AppButton
                @click="emitFilter('sortOrder', filters.sortOrder === 'asc' ? 'desc' : 'asc')"
                :icon="filters.sortOrder === 'asc' ? 'pi pi-sort-amount-down' : 'pi pi-sort-amount-up-alt'"
                :aria-label="filters.sortOrder === 'asc' ? t('library.sort_asc') : t('library.sort_desc')"
                v-tooltip.bottom="filters.sortOrder === 'asc' ? t('library.sort_asc') : t('library.sort_desc')"
                class="btn-outlined btn-secondary sort-btn"
              />
            </div>
          </div>

          <div class="filter-group">
            <label for="filter-tags">{{ t('library.tags') }}</label>
            <AppMultiSelect
              inputId="filter-tags"
              :modelValue="filters.tags"
              :options="tagsList"
              optionLabel="name"
              optionValue="name"
              :placeholder="t('library.select_tags')"
              :max-labels="2"
              :selected-label="`{0} ${t('library.selected_tags')}`"
              filter
              class="w-full"
              @update:modelValue="value => emitFilter('tags', value)"
            />
          </div>

          <div class="filter-group">
            <label for="filter-authors">{{ t('library.authors') }}</label>
            <AppMultiSelect
              inputId="filter-authors"
              :modelValue="filters.author"
              :options="authorsList"
              optionLabel="name"
              optionValue="name"
              :placeholder="t('library.select_authors')"
              :max-labels="2"
              :selected-label="`{0} ${t('library.selected_authors')}`"
              filter
              class="w-full"
              @update:modelValue="value => emitFilter('author', value)"
            />
          </div>

          <div class="filter-group">
            <label for="filter-publishers">{{ t('library.publishers') }}</label>
            <AppMultiSelect
              inputId="filter-publishers"
              :modelValue="filters.publisher"
              :options="publishersList"
              optionLabel="name"
              optionValue="name"
              :placeholder="t('library.select_publishers')"
              :max-labels="2"
              :selected-label="`{0} ${t('library.selected_publishers')}`"
              filter
              class="w-full"
              @update:modelValue="value => emitFilter('publisher', value)"
            />
          </div>
        </div>

        <div class="sidebar-footer">
          <AppButton
            :label="t('library.clear_all')"
            icon="pi pi-filter-slash"
            class="btn-outlined btn-danger w-full"
            @click="emit('reset')"
          />
        </div>
      </div>
    </AppDialog>

    <AddBookDialog
      v-model:visible="addBookDialogVisible"
      @save="onBookCreated"
    />
  </div>
</template>

<script setup>
import PageHeader from './ui/PageHeader.vue'
import { tagColor } from '../utils/tagColors.js'
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import AppButton from './ui/AppButton.vue'
import AppDialog from './ui/AppDialog.vue'
import IconButton from './form/IconButton.vue'
import AppMultiSelect from './ui/AppMultiSelect.vue'
import AppSelect from './ui/AppSelect.vue'
import AppChip from './ui/AppChip.vue'
import AddBookDialog from './AddBookDialog.vue'
import api from '../services/api.js'
import { useI18n } from 'vue-i18n'

const { t, locale } = useI18n()

// Os filtros vêm do useLibrary (fonte única); este componente só exibe e emite
// mudanças. Assim filtros vindos da URL, do "Limpar" do estado vazio etc.
// aparecem aqui como chips.
const props = defineProps({
  // undefined = ainda sem contagem (o selo não aparece)
  booksQuantity: { type: Number, default: undefined },
  libraryTotal: { type: Number, default: null },
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

// Placeholder curto ("Buscar livros") sempre que o longo ("Pesquisar por
// título, autor ou ISBN") não cabe no campo: antes era cortado no meio da
// palavra no celular e também a 1440 px, ao lado do ordenar.
const searchInput = ref(null)
const longPlaceholderFits = ref(true)
let measureCtx = null
function measurePlaceholder() {
  const el = searchInput.value
  if (!el || !el.clientWidth) return
  const style = getComputedStyle(el)
  const available = el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
  measureCtx ||= document.createElement('canvas').getContext('2d')
  if (!measureCtx) return
  measureCtx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
  longPlaceholderFits.value = measureCtx.measureText(t('library.search_ph')).width <= available
}
let placeholderObserver = null
onMounted(() => {
  measurePlaceholder()
  if (typeof ResizeObserver !== 'undefined' && searchInput.value) {
    placeholderObserver = new ResizeObserver(() => measurePlaceholder())
    placeholderObserver.observe(searchInput.value)
  }
  document.fonts?.ready?.then(measurePlaceholder)
})
onBeforeUnmount(() => placeholderObserver?.disconnect())
watch(locale, () => nextTick(measurePlaceholder))

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

// Com filtro ou busca: "12 de 150"; sem filtro, só o total
const countLabel = computed(() => {
  const shown = props.booksQuantity
  const total = props.libraryTotal
  const filtered = hasActiveFilters.value || Boolean(props.filters.search)
  if (filtered && total !== null && total !== shown) return t('library.count_of', { shown, total })
  return String(shown)
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
defineExpose({ reloadOptions: loadOptions, openAddBook: () => { addBookDialogVisible.value = true } })
</script>

<style scoped>
.library-header-wrapper {
  container: libheader / inline-size;
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

.count-badge {
  background-color: var(--main-solid);
  color: var(--on-main);
  font-weight: 800;
  font-size: var(--fs-xs);
  padding: 0.15rem 0.6rem;
  border-radius: var(--radius-lg);
}

.view-toggle {
  display: inline-flex;
  padding: 3px;
  gap: 2px;
  border-radius: var(--radius-pill);
  border: 1px solid var(--border-color);
  background: var(--bg-app);
}

.view-btn {
  width: 34px;
  height: 34px;
  border: none;
  border-radius: var(--radius-pill);
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
  outline: var(--focus-ring);
  outline-offset: var(--focus-offset);
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

.sort-quick {
  flex-shrink: 0;
}

.sort-quick :deep(.app-select-trigger) {
  min-height: 2.75rem;
  border-radius: var(--radius-pill);
  padding: 0 0.85rem 0 0.95rem;
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

/* 24 × 24 px no mouse (WCAG 2.5.8); no toque o ::after leva a 44 px, como
   no .view-btn (bloco sem escopo no fim do arquivo) */
.clear-icon {
  position: absolute;
  right: 1rem;
  width: 24px;
  height: 24px;
  padding: 0;
  background: none;
  border: none;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  cursor: pointer;
  font-size: var(--fs-sm);
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
  border-radius: var(--radius-pill);
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

.action-btn.btn {
  --btn-fg: var(--text-secondary);
  width: 42px;
  height: 42px;
}

.action-btn.btn:hover:not(:disabled) {
  --btn-bg: var(--bg-hover);
  --btn-fg: var(--text-primary);
}

.action-btn.btn.active-filter {
  --btn-fg: var(--main-color);
  --btn-bg: rgba(var(--main-color-rgb), 0.1);
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
  color: color-mix(in srgb, var(--tag-color) var(--tint-text), var(--text-primary));
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
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
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

.filter-group label,
.filter-group .group-label {
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
  width: auto;
  min-width: 0;
}

.sort-btn {
  flex-shrink: 0;
}

.sidebar-footer {
  margin-top: auto;
  padding-top: 2rem;
}

/* Grade/lista dentro da gaveta: só no celular (no resto ele fica no cabeçalho) */
.view-group {
  display: none;
}

.view-toggle-wide {
  display: flex;
  width: 100%;
}

.view-btn-wide {
  flex: 1;
  width: auto;
  height: 2.75rem;
  gap: 0.5rem;
  font: inherit;
  font-size: var(--fs-md);
  font-weight: 600;
}

/* Com o cabeçalho abaixo de 1000 px (janela até ~1300) numa linha só não
   cabem título, busca, ordenar e ações (a 1024 a busca ficava com 0 px): duas
   linhas — título e ações em cima, busca e ordenar embaixo. Container query
   (largura do próprio cabeçalho), porque depende do menu lateral. */
@container libheader (max-width: 999.98px) {
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
    min-width: 0;
  }

  .actions {
    grid-area: actions;
  }

  .search-area {
    grid-area: search;
    min-width: 0;
    max-width: none;
  }

  /* Na linha da busca sobra espaço: o valor do ordenar aparece inteiro */
  .sort-quick-value {
    max-width: none;
  }
}

/* Uma linha: o ordenar mostra o ícone e o valor inteiro (sem o "Ordenar:",
   que segue no nome acessível) e a busca fica com o resto */
@container libheader (min-width: 1000px) {
  .sort-quick-prefix {
    display: none;
  }

  .sort-quick-icon {
    display: inline;
  }

  .sort-quick-value {
    max-width: none;
  }
}

@media (max-width: 1023.98px) {

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

  /* Contagem embaixo do título: ao lado, as ações a cobriam ("12 de 150"
     não cabe na coluna do título) */
  .header-title {
    grid-area: title;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.15rem;
    min-width: 0;
  }

  .count-badge {
    padding: 0 0.45rem;
    white-space: nowrap;
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

  .sort-quick :deep(.app-select-trigger) {
    min-height: 2.6rem;
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

  .clear-all-btn.btn {
    flex-shrink: 0;
    padding: 0.35rem 0.5rem;
  }
}

/* Celular: a 320 px as quatro ações somavam ~290 px e cobriam o título e o
   contador. O alternador grade/lista vai para a gaveta de filtros e o título
   ganha a coluna de volta; se ainda faltar espaço, corta com reticências em
   vez de passar por baixo das ações. */
@media (max-width: 639.98px) {
  .top-bar .view-toggle {
    display: none;
  }

  .view-group {
    display: block;
  }

  .header-title,
  .header-title h1 {
    max-width: 100%;
  }

  .header-title h1 {
    overflow: hidden;
    text-overflow: ellipsis;
  }
}

@media (pointer: coarse) {
  .clear-icon::after {
    content: '';
    position: absolute;
    inset: -10px;
    border-radius: 50%;
  }
}
</style>

<style>
/* Gaveta de filtros (AppDialog drawer) */
.filters-drawer .drawer-body {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 1.5rem 1.5rem 1.75rem 2rem;
  overflow-y: auto;
}

/* Lista do "Ordenar" ao lado da busca */
.sort-quick-panel {
  min-width: 13rem;
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

/* "Adicionar livro" é mais longo que o antigo "Novo": abaixo de 420 px fica
   só o ícone (o nome continua no aria-label), para o título caber */
@media (max-width: 420px) {
  .add-btn .btn-label {
    display: none;
  }

  .add-btn.btn {
    width: 2.75rem;
    padding: 0;
    justify-content: center;
  }
}
</style>