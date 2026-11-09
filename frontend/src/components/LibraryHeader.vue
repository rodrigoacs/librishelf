<template>
  <div class="library-header-wrapper">
    <div class="top-bar">

      <div class="header-title">
        <PageHeader
          compact
          :title="t('menu.library')"
        />
        <span
          v-if="booksQuantity !== undefined"
          class="count-badge"
          aria-live="polite"
        >{{ countLabelLong }}</span>
      </div>

      <div class="search-area">
        <SearchField
          id="library-search"
          ref="searchInput"
          class="search-input-wrapper"
          :model-value="searchText"
          :label="t('library.search_label')"
          :placeholder="longPlaceholderFits ? t('library.search_ph') : t('library.search_ph_short')"
          @update:model-value="onSearch"
        />

        <!-- Ordenar à mão, ao lado da busca (antes só dentro da gaveta de filtros).
             AppSelect, e não <select>: a lista nativa não segue o tema. -->
        <AppSelect
          :model-value="filters.sortField"
          :options="sortOptions"
          option-label="label"
          option-value="value"
          :aria-label="t('library.sort_by')"
          class="sort-quick"
          panel-class="sort-quick-panel"
          @update:model-value="value => emitFilter('sortField', value)"
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
        <LibraryViewToggle
          :model-value="view"
          :aria-label="t('library.view_label')"
          @update:model-value="value => emit('view-change', value)"
        />

        <AppButton
          v-tooltip.bottom="t('batch.selectMode')"
          icon="pi pi-check-square"
          class="btn-rounded btn-text action-btn"
          :class="{ 'active-filter': selecting }"
          :aria-pressed="selecting"
          :aria-label="t('batch.selectMode')"
          @click="emit('toggle-select')"
        />

        <AppButton
          v-tooltip.bottom="t('library.filters_adv')"
          icon="pi pi-filter"
          class="btn-rounded btn-text action-btn"
          :class="{ 'active-filter': hasActiveFilters }"
          :aria-label="t('library.filters_adv')"
          :aria-expanded="visibleFilters"
          @click="visibleFilters = true"
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

    <LibraryFilterChips
      v-if="phone"
      :filters="filters"
      :active="hasActiveFilters"
      :other-chips="otherChips"
      :authors="authorsList"
      :publishers="publishersList"
      :tags="tagsList"
      @filter-change="forward"
      @remove="removeFromList"
      @reset="emit('reset')"
    />

    <LibraryActiveFilters
      v-if="hasActiveFilters && !phone"
      :filters="filters"
      :other-chips="otherChips"
      @remove="removeFromList"
      @reset="emit('reset')"
    />

    <LibraryFiltersDrawer
      v-model:visible="visibleFilters"
      :filters="filters"
      :view="view"
      :authors="authorsList"
      :publishers="publishersList"
      :tags="tagsList"
      @filter-change="forward"
      @view-change="value => emit('view-change', value)"
      @reset="emit('reset')"
    />

    <AddBookDialog
      v-model:visible="addBookDialogVisible"
      @save="onBookCreated"
    />
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import PageHeader from './ui/PageHeader.vue'
import SearchField from './ui/SearchField.vue'
import AppButton from './ui/AppButton.vue'
import AppSelect from './ui/AppSelect.vue'
import AddBookDialog from './AddBookDialog.vue'
import LibraryViewToggle from './library/LibraryViewToggle.vue'
import LibraryFilterChips from './library/LibraryFilterChips.vue'
import LibraryActiveFilters from './library/LibraryActiveFilters.vue'
import LibraryFiltersDrawer from './library/LibraryFiltersDrawer.vue'
import { useIsPhone } from '../composables/useIsPhone.js'
import { isFiltered } from '../composables/useLibrary.js'
import { useLibraryFilterOptions, hasReadYear } from '../composables/useLibraryFilterOptions.js'
import api from '../services/api.js'
import { librarySearchRequest, takeLibrarySearchRequest } from '../services/librarySearch.js'

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

const visibleFilters = ref(false)
const addBookDialogVisible = ref(false)
const phone = useIsPhone()
const { sortOptions, readStateLabel, readPeriodLabel } = useLibraryFilterOptions()

const currentSortLabel = computed(() => sortOptions.value.find(option => option.value === props.filters.sortField)?.label ?? '')

// A ordenação e a busca não contam como filtro aqui (a busca tem o campo)
const hasActiveFilters = computed(() => isFiltered({ ...props.filters, search: '' }))

// Os outros filtros ativos (status, período, série, ISBN) também viram chip
const otherChips = computed(() => {
  const f = props.filters
  const chips = []
  if (f.readState !== 'all') chips.push({ key: 'state', label: readStateLabel(f.readState), remove: () => emitFilter('readState', 'all') })
  if (hasReadYear(f)) chips.push({ key: 'year', label: readPeriodLabel(f), remove: clearReadPeriod })
  if (f.series) chips.push({ key: 'series', label: t('series.chip', { series: f.series }), remove: () => emitFilter('series', '') })
  if (f.isbnStatus === 'invalid') chips.push({ key: 'isbn', label: t('library.invalid_isbn_chip'), remove: () => emitFilter('isbnStatus', 'all') })
  return chips
})

// Placeholder curto ("Buscar livros") sempre que o longo ("Pesquisar por
// título, autor ou ISBN") não cabe no campo: antes era cortado no meio da
// palavra no celular e também a 1440 px, ao lado do ordenar.
const searchInput = ref(null)
const longPlaceholderFits = ref(true)
let measureCtx = null
function measurePlaceholder() {
  const el = searchInput.value?.input
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
  if (typeof ResizeObserver !== 'undefined' && searchInput.value?.input) {
    placeholderObserver = new ResizeObserver(() => measurePlaceholder())
    placeholderObserver.observe(searchInput.value.input)
  }
  document.fonts?.ready?.then(measurePlaceholder)
})
onBeforeUnmount(() => placeholderObserver?.disconnect())
watch(locale, () => nextTick(measurePlaceholder))

const searchText = ref(props.filters.search || '')
watch(() => props.filters.search, (value) => {
  if (value !== searchText.value) searchText.value = value || ''
})

// Celular: selo tingido com a palavra ("152 livros", "12 de 150")
const countLabelLong = computed(() => {
  const label = countLabel.value
  return label === String(props.booksQuantity) ? t('library.countBooks', { n: props.booksQuantity }, props.booksQuantity) : label
})

// Com filtro ou busca: "12 de 150"; sem filtro, só o total
const countLabel = computed(() => {
  const shown = props.booksQuantity
  const total = props.libraryTotal
  if (isFiltered(props.filters) && total !== null && total !== shown) return t('library.count_of', { shown, total })
  return String(shown)
})

function emitFilter(key, value) {
  emit('filter-change', { key, value })
}

// Mudança vinda dos chips ou da gaveta ({ key, value, silent? })
function forward(change) {
  emit('filter-change', change)
}

function onSearch(value) {
  searchText.value = value
  emitFilter('search', value)
}

function removeFromList({ key, name }) {
  emitFilter(key, props.filters[key].filter(item => item !== name))
}

// Tirar o período tira o mês junto (ele só existe junto com o ano)
function clearReadPeriod() {
  emit('filter-change', { key: 'readMonth', value: null, silent: true })
  emitFilter('readYear', 'all')
}

const authorsList = ref([])
const publishersList = ref([])
const tagsList = ref([])

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

// Lupa da barra do topo (celular): foco na busca, com o teclado aberto
function focusSearchIfRequested() {
  if (takeLibrarySearchRequest()) nextTick(() => searchInput.value?.focus())
}
onMounted(focusSearchIfRequested)
watch(librarySearchRequest, focusSearchIfRequested)

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
  /* Mesma faixa das outras telas (.page > .page-header): título no recuo da
     página, alinhado com o conteúdo embaixo */
  padding: var(--space-4) var(--page-pad-x);
}

/* Título, busca logo depois (ocupando o espaço livre) e ações no canto */
.top-bar {
  display: flex;
  justify-content: flex-start;
  align-items: center;
  gap: var(--space-6);
}

.header-title :deep(.page-header.compact .page-header-title) {
  font-size: var(--page-title-size);
}

.header-title {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  white-space: nowrap;
}

.search-area {
  flex: 1;
  max-width: 760px;
  display: flex;
  align-items: center;
  gap: var(--space-2);
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
  padding: 0 var(--space-3) 0 var(--space-4);
}

.sort-quick-content {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
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

.actions {
  display: flex;
  gap: var(--space-3);
  align-items: center;
  margin-left: auto;
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
  padding: var(--space-2) var(--space-5);
  font-size: var(--fs-md);
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
    gap: var(--space-2) var(--space-3);
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
    padding-block: var(--space-3);
  }

  .top-bar {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas:
      "title actions"
      "search search";
    gap: var(--space-2) var(--space-3);
  }

  /* Contagem embaixo do título: ao lado, as ações a cobriam ("12 de 150"
     não cabe na coluna do título) */
  /* Quantidade na linha do título, como no celular */
  .header-title {
    grid-area: title;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
  }

  .actions {
    grid-area: actions;
    gap: var(--space-1);
  }

  .search-area {
    grid-area: search;
    min-width: 0;
    max-width: none;
  }

  .sort-quick :deep(.app-select-trigger) {
    padding-left: var(--space-3);
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
    padding: var(--space-2) var(--space-4);
  }
}

/* Celular: "Adicionar livro" vira o botão flutuante (Library.vue); título
   e selo tingido na mesma linha; filtros em chips abaixo da busca */
@media (max-width: 639.98px) {
  .add-btn {
    display: none;
  }

  .library-header-wrapper {
    padding-bottom: var(--space-2);
  }

  /* A 320 px as quatro ações somavam ~290 px e cobriam o título e o
     contador. O alternador grade/lista vai para a gaveta de filtros e o título
     ganha a coluna de volta; se ainda faltar espaço, corta com reticências em
     vez de passar por baixo das ações. */
  .top-bar .view-toggle {
    display: none;
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
</style>

<style>
/* Lista do "Ordenar" ao lado da busca */
.sort-quick-panel {
  min-width: 13rem;
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
