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
      class="multiselect"
      @change="onAuthorsChange"
      display="chip"
    />
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import AutoComplete from 'primevue/autocomplete'
import MultiSelect from 'primevue/multiselect'

const title = ref('')
const filteredTitles = ref([])
const titles = ref([])
const router = useRouter()
const authors = ref([])
const selectedAuthors = ref([])

fetch('http://localhost:3000/library?fields=title')
  .then(response => response.json())
  .then(data => {
    titles.value = data.map(item => item.title)
  })
  .catch(error => console.error('Error fetching titles:', error))

fetch('http://localhost:3000/author')
  .then(response => response.json())
  .then(data => {
    authors.value = data
  })
  .catch(error => console.error('Error fetching authors:', error))

const search = (event) => {
  filteredTitles.value = titles.value.filter(title =>
    title.toLowerCase().includes(event.query.toLowerCase())
  )
}

const onTitleChange = () => {
  updateRoute()
}

const onAuthorsChange = () => {
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
  router.push({ path: '/library', query: Object.fromEntries(searchParams.entries()) })
}

watch(selectedAuthors, updateRoute)
</script>

<style scoped>
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
