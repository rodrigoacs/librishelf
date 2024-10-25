<template>
  <div class="card">
    <Search
      path="books"
      :books-quantity="filteredBooks.length"
    />
    <DataView
      :value="filteredBooks"
      layout="grid"
    >
      <template #grid="slotProps">
        <div class="grid">
          <BookItem
            v-for="(item, index) in slotProps.items"
            :key="index"
            :book="item"
          />
        </div>
      </template>
    </DataView>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import DataView from 'primevue/dataview'
import Search from '../components/Search.vue'
import BookItem from '../components/BookItem.vue'
import { fetchBooks } from '../../../backend/src/services/api.js'

const books = ref([])
const filteredBooks = ref([])
const route = useRoute()

function filterBooks() {
  const searchQuery = route.query.search?.toLowerCase() || ''
  const authorQuery = route.query.author?.split(',').map(a => a.toLowerCase()) || []
  const publisherQuery = route.query.publisher?.split(',').map(p => p.toLowerCase()) || []
  const sortField = route.query.sort || ''
  const sortOrder = route.query.order || 'asc'

  filteredBooks.value = books.value.filter(book => {
    const matchesTitle = book.title.toLowerCase().includes(searchQuery)
    const matchesAuthor = authorQuery.length === 0 || authorQuery.some(author => book.authors.toLowerCase().includes(author))
    const matchesPublisher = publisherQuery.length === 0 || publisherQuery.some(publisher => book.publisher?.toLowerCase().includes(publisher))
    return matchesTitle && matchesAuthor && matchesPublisher
  })

  if (sortField) {
    filteredBooks.value.sort((a, b) => {
      if (sortOrder === 'asc') {
        return a[sortField].localeCompare(b[sortField])
      } else {
        return b[sortField].localeCompare(a[sortField])
      }
    })
  }
}

onMounted(() => {
  fetchBooks('id,title,authors,path,publisher')
    .then(data => {
      books.value = data
      filterBooks()
    })
    .catch(error => console.error('Error fetching data:', error))
})

watch(route, filterBooks)
</script>

<style scoped>
.card {
  padding: 0 1rem;
  height: 95vh;
  width: 85vw;
  overflow-y: scroll;
}

.grid {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-evenly;
  background-color: #121212;
}
</style>
