import { ref } from 'vue'
import api from '../services/api.js'

export function useLibrary() {
  const books = ref([])
  const loading = ref(false)
  const loadingMore = ref(false)
  const error = ref(null)

  const totalRecords = ref(0)

  const filters = ref({
    search: '',
    readState: 'all',
    author: [],
    publisher: [],
    tags: [],
    sortField: 'recent',
    sortOrder: 'desc',
    page: 1,
    limit: 20
  })

  async function fetchBooks(isLoadMore = false) {
    if (loading.value || loadingMore.value) return
    if (isLoadMore && books.value.length >= totalRecords.value && totalRecords.value > 0) return

    if (isLoadMore) {
      loadingMore.value = true
      filters.value.page++
    } else {
      loading.value = true
      filters.value.page = 1
    }

    try {
      const params = {
        page: filters.value.page,
        limit: filters.value.limit,
        sort: filters.value.sortField,
        order: filters.value.sortOrder
      }

      if (filters.value.search) params.search = filters.value.search

      if (filters.value.readState !== 'all') {
        params.readState = filters.value.readState === 'read' ? 'true' : 'false'
      }

      if (filters.value.author && filters.value.author.length > 0) {
        params.author = filters.value.author.map(a => a.name || a).join(',')
      }

      if (filters.value.publisher && filters.value.publisher.length > 0) {
        params.publisher = filters.value.publisher.map(p => p.name || p).join(',')
      }

      if (filters.value.tags && filters.value.tags.length > 0) {
        params.tags = filters.value.tags.map(t => t.name || t).join(',')
      }

      if (filters.value.readYear && filters.value.readYear !== 'all') {
        params.readYear = filters.value.readYear
      }

      const response = await api.getBooks(params)

      totalRecords.value = response.total || 0

      if (isLoadMore) {
        if (response.result && response.result.length > 0) {
          books.value.push(...response.result)
        }
      } else {
        books.value = response.result || []
      }

    } catch (err) {
      console.error('Erro no composable useLibrary:', err)
      error.value = 'Erro ao carregar livros.'
    } finally {
      loading.value = false
      loadingMore.value = false
    }
  }

  function loadMore() {
    fetchBooks(true)
  }

  let timeout = null
  function setFilter(key, value) {
    filters.value[key] = value

    if (key === 'search') {
      if (timeout) clearTimeout(timeout)
      timeout = setTimeout(() => {
        fetchBooks(false)
      }, 500)
    } else {
      if (key !== 'page') fetchBooks(false)
    }
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
    setFilter
  }
}