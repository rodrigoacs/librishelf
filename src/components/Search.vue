<template>
  <div class="search-wrapper">
    <AutoComplete
      placeholder="Search by Title"
      :suggestions="filteredTitles"
      v-model="title"
      @complete="search"
      @change="onTitleChange"
    />
    <MultiSelect
      v-model="selectedAuthors"
      :options="authors"
      optionLabel="name"
      placeholder="Filter by Author"
      filter
      @change="onAuthorsChange"
      class="multiselect"
      display="chip"
    />
    <MultiSelect
      v-model="selectedPublishers"
      :options="publishers"
      optionLabel="name"
      placeholder="Filter by Publisher"
      filter
      @change="onPublishersChange"
      class="multiselect"
      display="chip"
    />
  </div>
  <div class="sort-buttons">
    <Button
      label="Sort by Title"
      @click="sortBooks('title')"
      :icon="sortField === 'title' ? (sortOrder === 'asc' ? 'pi pi-sort-alpha-down' : 'pi pi-sort-alpha-up') : 'pi pi-sort'"
    />
    <Button
      label="Sort by Author"
      @click="sortBooks('authors')"
      :icon="sortField === 'authors' ? (sortOrder === 'asc' ? 'pi pi-sort-alpha-down' : 'pi pi-sort-alpha-up') : 'pi pi-sort'"
    />
  </div>
</template>

<script setup>
import { ref, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import AutoComplete from 'primevue/autocomplete'
import MultiSelect from 'primevue/multiselect'
import Button from 'primevue/button'
import { fetchTitles, fetchAuthors, fetchPublishers } from '../services/api'

const title = ref('')
const filteredTitles = ref([])
const titles = ref([])
const router = useRouter()
const authors = ref([])
const selectedAuthors = ref([])
const publishers = ref([])
const selectedPublishers = ref([])
const sortField = ref('')
const sortOrder = ref('asc')

const search = (event) => {
  filteredTitles.value = titles.value.filter(title =>
    title.toLowerCase().includes(event.query.toLowerCase())
  )
}

const onTitleChange = () => {
  updateRoute()
}

const onAuthorsChange = () => {
  fetchAndSetPublishers()
  updateRoute()
}

const onPublishersChange = () => {
  updateRoute()
}

const updateRoute = () => {
  const searchParams = new URLSearchParams()
  if (title.value) {
    searchParams.set('search', title.value)
  }
  if (selectedAuthors.value.length) {
    searchParams.set('author', selectedAuthors.value.map(author => author.name).join(','))
  }
  if (selectedPublishers.value.length) {
    searchParams.set('publisher', selectedPublishers.value.map(publisher => publisher.name).join(','))
  }
  searchParams.set('sort', sortField.value)
  searchParams.set('order', sortOrder.value)
  router.push({ path: '/library', query: Object.fromEntries(searchParams.entries()) })
}

const sortBooks = (field) => {
  if (sortField.value === field) {
    sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortField.value = field
    sortOrder.value = 'asc'
  }
  updateRoute()
}

const fetchAndSetPublishers = () => {
  const authorQuery = selectedAuthors.value.map(author => author.name).join(',')
  fetchPublishers(authorQuery)
    .then(data => {
      publishers.value = [...new Set(data.map(item => item.name))].map(publisher => ({ name: publisher }))
    })
    .catch(error => console.error('Error fetching publishers:', error))
}

onMounted(() => {
  fetchTitles()
    .then(data => {
      titles.value = data.map(item => item.title)
    })
    .catch(error => console.error('Error fetching titles:', error))

  fetchAuthors()
    .then(data => {
      authors.value = data
    })
    .catch(error => console.error('Error fetching authors:', error))

  fetchAndSetPublishers()
})

watch(selectedAuthors, fetchAndSetPublishers)
watch(selectedAuthors, updateRoute)
watch(selectedPublishers, updateRoute)
</script>

<style scoped>
.p-button {
  width: 10%;
}

.sort-buttons {
  display: flex;
  gap: 1rem;
  margin-bottom: 1rem;
}

.search-wrapper {
  display: flex;
  gap: 1rem;
  margin-bottom: 1rem;
  width: 100%;
}

.multiselect,
.p-autocomplete {
  width: 50%;
}

::v-deep .p-autocomplete-input {
  width: 100%;
}
</style>
