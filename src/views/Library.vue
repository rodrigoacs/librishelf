<template>
  <div class="card">
    <Search />
    <DataView
      :value="filteredBooks"
      layout="grid"
    >
      <template #grid="slotProps">
        <div class="grid">
          <div
            v-for="(item, index) in slotProps.items"
            :key="index"
            class="book-item"
          >
            <div class="book-cover">
              <img
                :src="item.path"
                alt="Book Cover"
                style="max-width: 140px; height: 220px; object-fit: cover;"
              />
              <i class="pi pi-info-circle" />
            </div>
            <div class="book-info">
              <span class="book-title">{{ item.title }}</span>
              <span class="book-authors">{{ item.authors }}</span>
            </div>
          </div>
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

const books = ref([])
const filteredBooks = ref([])
const route = useRoute()

onMounted(() => {
  fetch('http://localhost:3000/library?fields=title,authors,path')
    .then(response => response.json())
    .then(data => {
      books.value = data
      filterBooks()
    })
    .catch(error => console.error('Error fetching data:', error))
})

const filterBooks = () => {
  const searchQuery = route.query.search?.toLowerCase() || ''
  const authorQuery = route.query.author?.split(',').map(a => a.toLowerCase()) || []

  filteredBooks.value = books.value.filter(book => {
    const matchesTitle = book.title.toLowerCase().includes(searchQuery)
    const matchesAuthor = authorQuery.length === 0 || authorQuery.some(author => book.authors.toLowerCase().includes(author))
    return matchesTitle && matchesAuthor
  })
}

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
  background-color: #181818;
}

.book-item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  width: 200px;
  height: 300px;
  margin: 10px;
  padding: 10px;
  border-radius: 10px;
}

.book-cover:hover {
  transform: scale(1.1);
}

.book-cover:hover img {
  filter: grayscale(100%) brightness(50%) blur(4px);
}

.book-cover {
  width: 150px;
  height: 250px;
  object-fit: cover;
}

.book-cover i {
  display: none;
  font-size: 2rem;
  color: var(--primary-color);
  cursor: pointer;
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
}

.book-cover:hover i {
  display: block;
}

.book-info {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  text-align: left;
  margin-top: 16px;
}

.book-info span {
  margin-bottom: 5px;
}

.book-title {
  font-size: .8rem;
  font-weight: bold;
}

.book-authors {
  font-size: .8rem;
}
</style>