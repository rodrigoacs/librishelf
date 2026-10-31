<template>
  <div class="library-container">

    <div
      class="header-section"
      :class="{ collapsed: headerCollapsed }"
      @focusin="headerCollapsed = false"
    >
      <LibraryHeader
        ref="header"
        :books-quantity="totalRecords"
        :library-total="libraryTotal"
        :filters="filters"
        :view="viewMode"
        :selecting="selecting"
        @toggle-select="toggleSelecting"
        @filter-change="handleFilterChange"
        @view-change="setViewMode"
        @reset="clearFilters"
        @book-created="refreshData"
      />
    </div>

    <div
      class="content-section"
      :class="{ 'is-selecting': selecting }"
    >

      <div
        v-if="loading && books.length === 0"
        class="books-grid"
        aria-busy="true"
      >
        <div
          v-for="n in 12"
          :key="n"
          class="book-skeleton"
        >
          <AppSkeleton
            height="100%"
            class="cover-skeleton"
          />
          <div class="info-skeleton">
            <AppSkeleton
              width="85%"
              height="1rem"
              class="mb-2"
            />
            <AppSkeleton
              width="60%"
              height="0.8rem"
            />
          </div>
        </div>
      </div>

      <EmptyState
        v-else-if="error && books.length === 0"
        variant="error"
        :title="t('library.load_error')"
        @action="refreshData"
      />

      <div
        v-else-if="books.length > 0"
        class="books-grid-wrapper"
      >
        <TransitionGroup
          v-if="viewMode === 'grid'"
          name="book-list"
          tag="div"
          class="books-grid"
        >
          <BookItem
            v-for="item in books"
            :key="item.book_id || item.id"
            :book="item"
            quick-actions
            open-in-url
            :selectable="selecting"
            :selected="selectedIds.has(item.book_id || item.id)"
            @toggle-select="toggleSelected"
            @open="openBook"
            @updated="onBookUpdated"
            @deleted="onBookDeleted"
          />
        </TransitionGroup>

        <BookRowHeader
          v-if="viewMode !== 'grid'"
          :sort-field="filters.sortField"
          :sort-order="filters.sortOrder"
          :selecting="selecting"
          @sort="sortByColumn"
        />
        <ul
          v-if="viewMode !== 'grid'"
          class="books-list"
          :aria-label="t('library.results')"
        >
          <BookRow
            v-for="item in books"
            :key="item.book_id || item.id"
            :book="item"
            open-in-url
            :selectable="selecting"
            :selected="selectedIds.has(item.book_id || item.id)"
            @toggle-select="toggleSelected"
            @open="openBook"
            @updated="onBookUpdated"
            @deleted="onBookDeleted"
          />
        </ul>

        <BatchBar
          v-if="selecting"
          :ids="[...selectedIds]"
          :all-selected="books.length > 0 && selectedIds.size === books.length"
          @select-all="toggleSelectAll"
          @cancel="toggleSelecting"
          @done="afterBatch"
        />

        <div
          v-if="books.length < totalRecords"
          ref="sentinel"
          class="sentinel"
        >
          <i
            v-if="loadingMore"
            class="pi pi-spin pi-spinner loading-more-icon"
            :aria-label="t('common.loading')"
          ></i>
        </div>
      </div>

      <!-- Estante vazia de verdade (sem filtro): o próximo passo é cadastrar -->
      <EmptyState
        v-else-if="!isFiltered(filters)"
        icon="pi pi-book"
        :title="t('home.emptyTitle')"
        :text="t('home.emptyText')"
        :action-label="t('home.addFirst')"
        action-icon="pi pi-plus"
        @action="header?.openAddBook()"
      />

      <EmptyState
        v-else
        icon="pi pi-search"
        :title="t('library.empty_title')"
        :text="t('library.empty_msg')"
        :action-label="t('library.clear_all')"
        action-icon="pi pi-filter-slash"
        action-class="btn-outlined btn-secondary"
        @action="clearFilters"
      />

    </div>

    <!-- Celular: adicionar livro no botão flutuante, acima da barra de gestos -->
    <Transition name="fab">
      <button
        v-if="phone && !selecting"
        type="button"
        class="fab-add"
        data-press
        :aria-label="t('home.addBook')"
        @click="header?.openAddBook()"
      >
        <i
          class="pi pi-plus"
          aria-hidden="true"
        ></i>
      </button>
    </Transition>

    <!-- Livro aberto: vem da URL (?book=<id>), então o voltar do navegador
         fecha o livro e recarregar a página o abre de novo -->
    <BookDialog
      v-if="openBookId"
      :key="openBookId"
      :book-id="openBookId"
      :cover-version="openBookCoverVersion"
      in-url
      :model-value="true"
      @update:model-value="open => !open && closeBook()"
      @updated="onBookUpdated"
      @deleted="onBookDeleted"
    />
  </div>
</template>

<script setup>
import { scrollBehavior } from '../utils/motion.js'
import { computed, nextTick, onMounted, onUnmounted, ref, watch, watchEffect } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import LibraryHeader from '../components/LibraryHeader.vue'
import BookRowHeader from '../components/BookRowHeader.vue'
import BookItem from '../components/BookItem.vue'
import BookRow from '../components/BookRow.vue'
import BookDialog from '../components/BookDialog.vue'
import { bookIdFromQuery, withBook, withoutBook, closeWithBack } from '../utils/bookQuery.js'
import { holdScroll, isHistoryReturn, rememberPages, recallPages, routeKey } from '../services/scrollRestore.js'
import BatchBar from '../components/BatchBar.vue'
import { queryToFilters, queryToView, filtersToQuery, sameQuery, VIEW_MODES } from '../utils/libraryQuery.js'
import AppSkeleton from '../components/ui/AppSkeleton.vue'
import EmptyState from '../components/ui/EmptyState.vue'
import { useLibrary, isFiltered } from '../composables/useLibrary.js'
import { useIsPhone } from '../composables/useIsPhone.js'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const {
  books,
  totalRecords,
  libraryTotal,
  loading,
  loadingMore,
  error,
  filters,
  fetchBooks,
  loadMore,
  restorePages,
  setFilter,
  setFilters,
  resetFilters,
  updateBookInList,
  removeBookFromList
} = useLibrary()

const sentinel = ref(null)
const header = ref(null)
const phone = useIsPhone()
let observer = null

function refreshData() {
  fetchBooks()
}

// R6: no celular/tablet, barra do app + cabeçalho preso somavam 26% da tela a
// 390 × 700. Rolando para baixo o cabeçalho recolhe (passa por baixo da barra
// do app); qualquer rolagem para cima, foco nele ou modo seleção traz de volta.
const headerCollapsed = ref(false)
const COLLAPSE_QUERY = '(max-width: 1023.98px)'
let lastScrollY = 0
let scrollFrame = 0
function onWindowScroll() {
  if (scrollFrame) return
  scrollFrame = requestAnimationFrame(() => {
    scrollFrame = 0
    const y = window.scrollY
    const canCollapse = window.matchMedia?.(COLLAPSE_QUERY).matches && !selecting.value &&
      !document.querySelector('.header-section')?.contains(document.activeElement)
    if (!canCollapse || y < 160) headerCollapsed.value = false
    else if (y > lastScrollY + 6) headerCollapsed.value = true
    else if (y < lastScrollY - 6) headerCollapsed.value = false
    lastScrollY = y
  })
}

// A Biblioteca rola na janela (antes num contêiner próprio): o voltar do
// navegador devolve a posição e o cabeçalho fica preso no topo (sticky).
function scrollToTop() {
  window.scrollTo({ top: 0, behavior: scrollBehavior() })
}

function handleFilterChange({ key, value, silent = false }) {
  // silent: muda o filtro sem buscar (vem junto com outra mudança que busca).
  setFilter(key, value, { fetch: !silent })
  if (!silent) scrollToTop()
}

// Cabeçalho das colunas (modo lista): campo e ordem numa busca só
function sortByColumn({ field, order }) {
  setFilters({ sortField: field, sortOrder: order, page: 1 })
  scrollToTop()
}

function clearFilters() {
  resetFilters()
  scrollToTop()
}

function onBookUpdated({ book }) {
  updateBookInList(book)
  header.value?.reloadOptions()
}

function onBookDeleted(id) {
  removeBookFromList(id)
  header.value?.reloadOptions()
}

function setupIntersectionObserver() {
  if (observer) observer.disconnect()

  observer = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting && !loadingMore.value && !loading.value) {
      loadMore()
    }
  }, {
    rootMargin: '400px',
    threshold: 0.1
  })

  if (sentinel.value) {
    observer.observe(sentinel.value)
  }
}

watchEffect(() => {
  if (sentinel.value) {
    setupIntersectionObserver()
  }
})

// ---------------------------------------------------------------------------
// Seleção para ações em lote
// ---------------------------------------------------------------------------
const selecting = ref(false)
watch(selecting, value => { if (value) headerCollapsed.value = false })
const selectedIds = ref(new Set())

function toggleSelecting() {
  selecting.value = !selecting.value
  selectedIds.value = new Set()
}

function toggleSelected(id) {
  const next = new Set(selectedIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selectedIds.value = next
}

// "Selecionar todos" vale para os livros já carregados na tela.
function toggleSelectAll() {
  const all = books.value.map(book => book.book_id ?? book.id)
  selectedIds.value = selectedIds.value.size === all.length ? new Set() : new Set(all)
}

function afterBatch() {
  selecting.value = false
  selectedIds.value = new Set()
  refreshData()
  header.value?.reloadOptions()
}

function onKeydown(event) {
  if (event.key === 'Escape' && selecting.value && !document.querySelector('dialog[open]')) toggleSelecting()
}

// Grade ou lista: vem da URL (?view=list); sem ela, a última escolha neste navegador.
const VIEW_STORAGE_KEY = 'library-view'

function storedView() {
  try {
    const value = localStorage.getItem(VIEW_STORAGE_KEY)
    return VIEW_MODES.includes(value) ? value : 'grid'
  } catch {
    return 'grid'
  }
}

const viewMode = ref(queryToView(route.query) || storedView())

function setViewMode(mode) {
  if (!VIEW_MODES.includes(mode)) return
  viewMode.value = mode
  try { localStorage.setItem(VIEW_STORAGE_KEY, mode) } catch { /* modo privado */ }
}

// Filtros ⇄ URL. A URL é atualizada com replace (não enche o histórico a cada
// tecla) e, se ela mudar por fora (link de Autores, voltar do navegador),
// os filtros acompanham.
// O ?book= do livro aberto fica de fora da comparação e é mantido.
watch([filters, viewMode], () => {
  const next = filtersToQuery(filters.value, viewMode.value)
  if (!sameQuery(withoutBook(route.query), next)) {
    const book = bookIdFromQuery(route.query)
    router.replace({ query: book ? withBook(next, book) : next })
  }
}, { deep: true })

watch(() => route.query, (query) => {
  if (route.name !== 'library') return
  if (sameQuery(withoutBook(query), filtersToQuery(filters.value, viewMode.value))) return
  const view = queryToView(query)
  if (view) viewMode.value = view
  setFilters(queryToFilters(query))
})

// ---------------------------------------------------------------------------
// Livro aberto na URL
// ---------------------------------------------------------------------------
const openBookId = computed(() => (route.name === 'library' ? bookIdFromQuery(route.query) : null))
const openBookCoverVersion = computed(() => {
  const item = books.value.find(book => (book.book_id ?? book.id) === openBookId.value)
  return item ? item.cover_version : undefined
})

function openBook(id) {
  router.push({ query: withBook(route.query, id) })
}

function closeBook() {
  if (!bookIdFromQuery(route.query)) return
  const without = router.resolve({ query: withoutBook(route.query) }).fullPath
  if (closeWithBack(window.history.state, route.fullPath, without)) router.back()
  else router.replace({ query: withoutBook(route.query) })
}

// ---------------------------------------------------------------------------
// Voltar para a Biblioteca: mesmas páginas carregadas e mesma rolagem
// ---------------------------------------------------------------------------
onBeforeRouteLeave(() => {
  rememberPages(routeKey(route), filters.value.page)
})

onMounted(async () => {
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('scroll', onWindowScroll, { passive: true })
  // Filtros da URL (inclusive os que vêm de Autores/Editoras/Categorias) entram
  // no estado compartilhado: aparecem como chips e podem ser removidos.
  const pages = isHistoryReturn() ? recallPages(routeKey(route)) : 1
  if (pages <= 1) {
    setFilters(queryToFilters(route.query))
    return
  }
  // O router espera (scrollBehavior) até as páginas voltarem e renderizarem
  const release = holdScroll()
  setFilters(queryToFilters(route.query), { fetch: false })
  try {
    await restorePages(pages)
    await nextTick()
  } finally {
    release()
  }
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('scroll', onWindowScroll)
  if (scrollFrame) cancelAnimationFrame(scrollFrame)
  if (observer) observer.disconnect()
})
</script>

<style scoped>
.library-container {
  width: 100%;
  flex: 1;
  display: flex;
  flex-direction: column;
  background-color: var(--bg-app);
  position: relative;
}

/* Preso abaixo da barra do app no celular (--app-bar-height, main.css) */
.header-section {
  position: sticky;
  top: var(--app-bar-height, 0px);
  z-index: 100;
  transition: transform 0.2s ease;
}

/* Recolhido: sobe para trás da barra do app (z-index 200) */
.header-section.collapsed {
  transform: translateY(calc(-100% - var(--app-bar-height, 0px)));
}

@media (prefers-reduced-motion: reduce) {
  .header-section {
    transition: none;
  }
}

.content-section {
  padding: 1.5rem 2rem 4rem 2rem;
  flex: 1;
  max-width: 1800px;
  margin: 0 auto;
  width: 100%;
}

.books-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 2rem;
  width: 100%;
}

.books-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.book-skeleton {
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
  aspect-ratio: 2/3.5;
}

.cover-skeleton {
  border-radius: var(--radius-md);
  flex: 1;
}

.info-skeleton {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.sentinel {
  grid-column: 1 / -1;
  height: 80px;
  display: flex;
  justify-content: center;
  align-items: center;
  margin-top: 1rem;
}

.loading-more-icon {
  font-size: var(--fs-xl);
  color: var(--main-color);
}

.book-list-enter-active,
.book-list-leave-active {
  transition: all 0.4s ease;
}

.book-list-enter-from,
.book-list-leave-to {
  opacity: 0;
  transform: translateY(20px);
}

.book-list-move {
  transition: transform 0.4s ease;
}

/* Seleção em lote no celular: a BatchBar fica fixa no pé da janela e publica
   em --batch-bar-height quanto ocupa; sem esta folga a última linha ficava
   embaixo dela, sem como rolar além. */
@media (max-width: 1023.98px) {
  .content-section.is-selecting {
    padding-bottom: calc(var(--batch-bar-height, 0px) + 1rem);
  }
}

/* Botão flutuante (só existe no celular) */
.fab-add {
  position: fixed;
  right: calc(var(--space-4) + var(--safe-right, 0px));
  bottom: calc(var(--space-4) + var(--safe-bottom, 0px));
  z-index: 120;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  border: none;
  border-radius: var(--radius-lg);
  background: var(--main-solid);
  color: var(--on-main);
  box-shadow: var(--shadow-3);
  cursor: pointer;
}

.fab-add .pi {
  font-size: 1.35rem;
}

.fab-add:focus-visible {
  outline: var(--focus-ring);
  outline-offset: 3px;
}

.fab-enter-active {
  transition: transform var(--dur-spring) var(--ease-spring), opacity var(--dur-short) linear;
}

.fab-leave-active {
  transition: transform var(--dur-short) var(--ease-exit), opacity var(--dur-short) linear;
}

.fab-enter-from,
.fab-leave-to {
  opacity: 0;
  transform: scale(0.6);
}

@media (max-width: 639.98px) {
  .content-section {
    padding: 1rem 1rem calc(88px + var(--safe-bottom, 0px));
  }

  .books-grid {
    grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
    gap: 1rem;
  }
}
</style>