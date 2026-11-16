<template>
  <FavoriteBooks
    v-if="favorites.length && defaultShelf"
    :items="favorites"
    @open="id => emit('open', id)"
  />

  <div class="shelf-toolbar">
    <div
      class="status-pills"
      role="group"
      :aria-label="t('publicPage.statusLabel')"
    >
      <PillButton
        v-for="option in statusOptions"
        :key="option.value"
        :label="option.label"
        :active="shelf.status === option.value"
        @click="emit('change', { status: option.value })"
      />
    </div>
    <div class="shelf-search">
      <SearchField
        id="public-shelf-search"
        v-model="searchInput"
        :placeholder="t('publicPage.searchPlaceholder')"
        :maxlength="100"
        size="sm"
        @clear="emit('change', { search: '' })"
      />
      <AppSelect
        :model-value="shelf.sort"
        :options="sortOptions"
        :aria-label="t('publicPage.sortLabel')"
        class="shelf-sort"
        @update:model-value="value => emit('change', { sort: value })"
      />
    </div>
  </div>

  <div
    v-if="loading && books.length === 0"
    class="books-grid"
    aria-busy="true"
    :aria-label="t('common.loading')"
  >
    <div
      v-for="n in 10"
      :key="n"
      class="book-skeleton"
    >
      <AppSkeleton
        class="cover-skeleton"
        height="auto"
        border-radius="var(--radius-md)"
      />
      <AppSkeleton
        width="85%"
        height="1rem"
      />
      <AppSkeleton
        width="60%"
        height="0.8rem"
      />
    </div>
  </div>

  <EmptyState
    v-else-if="error && books.length === 0"
    variant="error"
    :title="t('publicLibrary.error')"
    @action="emit('retry')"
  />

  <EmptyState
    v-else-if="books.length === 0 && !defaultShelf"
    icon="pi pi-filter-slash"
    :title="t('publicPage.noResults')"
    compact
  >
    <template #action>
      <AppButton
        :label="t('publicPage.clearFilters')"
        class="btn-outlined btn-secondary"
        @click="clear"
      />
    </template>
  </EmptyState>

  <EmptyState
    v-else-if="books.length === 0"
    icon="pi pi-book"
    :title="t('publicLibrary.empty')"
  />

  <template v-else>
    <p
      v-if="!defaultShelf"
      class="shelf-count"
      role="status"
    >{{ t('publicLibrary.count', { count: total }, total) }}</p>
    <div class="books-grid">
      <BookItem
        v-for="book in books"
        :key="book.book_id"
        :book="book"
        read-only
        :owner-username="username"
      />
    </div>

    <div
      v-if="books.length < total"
      ref="sentinel"
      class="sentinel"
    >
      <i
        v-if="loading"
        class="pi pi-spin pi-spinner loading-more-icon"
        :aria-label="t('common.loading')"
      ></i>
    </div>
  </template>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import AppButton from '../ui/AppButton.vue'
import AppSelect from '../ui/AppSelect.vue'
import AppSkeleton from '../ui/AppSkeleton.vue'
import EmptyState from '../ui/EmptyState.vue'
import SearchField from '../ui/SearchField.vue'
import PillButton from '../form/PillButton.vue'
import BookItem from '../BookItem.vue'
import FavoriteBooks from './FavoriteBooks.vue'
import { SHELF_SORTS, SHELF_STATUSES } from '../../utils/publicShelf.js'

/**
 * Aba Estante da página pública: favoritos, status, busca, ordem e a grade
 * com rolagem infinita. Os livros e o estado da URL são do pai:
 *   change({ status | search | sort }), clear, more (próxima página), retry, open(id).
 */
const props = defineProps({
  books: { type: Array, required: true },
  total: { type: Number, required: true },
  loading: { type: Boolean, default: false },
  error: { type: Boolean, default: false },
  favorites: { type: Array, default: () => [] },
  shelf: { type: Object, required: true },
  defaultShelf: { type: Boolean, default: true },
  username: { type: String, required: true }
})
const emit = defineEmits(['change', 'clear', 'more', 'retry', 'open'])

const SEARCH_DEBOUNCE = 350

const { t } = useI18n()

const statusOptions = computed(() => SHELF_STATUSES.map(value => ({ value, label: t(`publicPage.status.${value}`) })))
const sortOptions = computed(() => Object.keys(SHELF_SORTS).map(value => ({ value, label: t(`publicPage.sort.${value}`) })))

// Busca: digita à vontade, a URL (e a lista) muda depois de uma pausa
const searchInput = ref(props.shelf.search)
let searchTimer = null
watch(searchInput, value => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    if (value.trim() !== props.shelf.search) emit('change', { search: value })
  }, SEARCH_DEBOUNCE)
})
watch(() => props.shelf.search, value => {
  if (value !== searchInput.value.trim()) searchInput.value = value
})

function clear() {
  searchInput.value = ''
  emit('clear')
}

// Rolagem infinita, como na biblioteca do dono. Depois de cada página o
// sentinela é observado de novo: se ainda estiver à vista (tela alta), a
// próxima página vem sem precisar rolar.
const sentinel = ref(null)
const observer = new IntersectionObserver((entries) => {
  if (entries[0]?.isIntersecting && !props.loading && props.books.length < props.total) emit('more')
}, { rootMargin: '400px' })

function observeSentinel() {
  observer.disconnect()
  if (sentinel.value) observer.observe(sentinel.value)
}

watch(() => props.books, observeSentinel, { flush: 'post' })
onMounted(observeSentinel)

onBeforeUnmount(() => {
  observer.disconnect()
  clearTimeout(searchTimer)
})
</script>

<style scoped>
.shelf-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}

.status-pills {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.shelf-search {
  display: flex;
  flex: 1 1 22rem;
  gap: var(--space-2);
  max-width: 34rem;
}

.shelf-search > :first-child {
  flex: 1;
  min-width: 0;
}

.shelf-sort {
  flex: 0 0 11rem;
}

.shelf-count {
  margin: 0;
  color: var(--text-secondary);
  font-size: var(--fs-sm);
}

.books-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: var(--space-7);
  justify-content: center;
}

.sentinel {
  height: 80px;
  display: flex;
  justify-content: center;
  align-items: center;
  margin-top: var(--space-4);
}

.loading-more-icon {
  font-size: var(--fs-xl);
  color: var(--main-color);
}

.book-skeleton {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  min-width: 0;
}

.cover-skeleton {
  aspect-ratio: 2 / 3;
  height: auto !important;
  margin-bottom: var(--space-2);
}

@media (max-width: 639.98px) {
  .books-grid {
    grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
    gap: var(--space-4);
  }

  /* Status rolam na horizontal; busca e ordem embaixo, na largura toda */
  .status-pills {
    flex-wrap: nowrap;
    width: calc(100% + 2 * var(--page-pad-x));
    margin: 0 calc(-1 * var(--page-pad-x));
    padding: 0 var(--page-pad-x);
    overflow-x: auto;
    scrollbar-width: none;
  }

  .status-pills::-webkit-scrollbar {
    display: none;
  }

  .shelf-search {
    flex-basis: 100%;
    max-width: none;
  }

  .shelf-sort {
    flex-basis: 9.5rem;
  }
}
</style>
