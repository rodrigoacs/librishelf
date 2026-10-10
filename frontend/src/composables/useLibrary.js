import { ref } from 'vue'
import api from '../services/api.js'

const SEARCH_DEBOUNCE_MS = 500

function defaultFilters() {
  return {
    search: '',
    readState: 'all',
    readYear: 'all',
    author: [],
    publisher: [],
    tags: [],
    sortField: 'recent',
    sortOrder: 'desc',
    page: 1,
    limit: 20
  }
}

function buildParams(filters) {
  const params = {
    page: filters.page,
    limit: filters.limit,
    sort: filters.sortField,
    order: filters.sortOrder
  }

  if (filters.search) params.search = filters.search

  if (filters.readState !== 'all') {
    params.readState = filters.readState === 'read' ? 'true' : 'false'
  }

  if (filters.author?.length > 0) {
    params.author = filters.author.map(a => a.name || a).join(',')
  }

  if (filters.publisher?.length > 0) {
    params.publisher = filters.publisher.map(p => p.name || p).join(',')
  }

  if (filters.tags?.length > 0) {
    params.tags = filters.tags.map(t => t.name || t).join(',')
  }

  if (filters.readYear && filters.readYear !== 'all') {
    params.readYear = filters.readYear
  }

  return params
}

export function useLibrary() {
  const books = ref([])
  const loading = ref(false)
  const loadingMore = ref(false)
  const error = ref(null)

  const totalRecords = ref(0)

  const filters = ref(defaultFilters())

  // Uma busca nova (filtro, ordenação, refresh) cancela a anterior em vez de ser
  // descartada: o resultado na tela sempre corresponde aos filtros atuais.
  // `requestId` impede que a resposta de uma requisição antiga sobrescreva a nova.
  let controller = null
  let requestId = 0
  let searchTimeout = null

  async function fetchBooks(isLoadMore = false) {
    if (isLoadMore) {
      if (loading.value || loadingMore.value) return
      if (books.value.length >= totalRecords.value) return
    }

    if (controller) controller.abort()
    controller = new AbortController()
    const currentRequest = ++requestId

    const nextPage = isLoadMore ? filters.value.page + 1 : 1

    if (isLoadMore) {
      loadingMore.value = true
    } else {
      loading.value = true
      loadingMore.value = false
    }

    error.value = null

    try {
      const params = buildParams({ ...filters.value, page: nextPage })
      const response = await api.getBooks(params, { signal: controller.signal })

      if (currentRequest !== requestId) return

      filters.value.page = nextPage
      totalRecords.value = response.total || 0

      if (isLoadMore) {
        if (response.result?.length > 0) {
          books.value.push(...response.result)
        }
      } else {
        books.value = response.result || []
      }
    } catch (err) {
      if (err.name === 'AbortError' || currentRequest !== requestId) return

      console.error('Erro no composable useLibrary:', err)
      error.value = 'Erro ao carregar livros.'
    } finally {
      if (currentRequest === requestId) {
        loading.value = false
        loadingMore.value = false
      }
    }
  }

  function loadMore() {
    fetchBooks(true)
  }

  function cancelPendingSearch() {
    if (searchTimeout) {
      clearTimeout(searchTimeout)
      searchTimeout = null
    }
  }

  function setFilter(key, value, { fetch = true } = {}) {
    filters.value[key] = value

    if (!fetch || key === 'page') return

    if (key === 'search') {
      cancelPendingSearch()
      searchTimeout = setTimeout(() => {
        searchTimeout = null
        fetchBooks(false)
      }, SEARCH_DEBOUNCE_MS)
      return
    }

    cancelPendingSearch()
    fetchBooks(false)
  }

  // Limpa todos os filtros de uma vez e faz uma única requisição.
  function resetFilters() {
    cancelPendingSearch()

    const { sortField, sortOrder, limit } = filters.value
    filters.value = { ...defaultFilters(), sortField, sortOrder, limit }

    fetchBooks(false)
  }

  return {
    books,
    totalRecords,
    loading,
    loadingMore,
    error,
    filters,
    fetchBooks: () => fetchBooks(false),
    loadMore,
    setFilter,
    resetFilters
  }
}
