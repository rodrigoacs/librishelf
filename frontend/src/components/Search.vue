<template>
  <div class="search-wrapper">
    <div class="first-row">
      <h1 style="color: var(--text-color)">Library ({{ booksQuantity }})</h1>
      <div class="first-row">

        <Button
          label="add book"
          icon="pi pi-plus"
          class="add-button"
          @click="openAddBookModal"
        />
      </div>
    </div>
    <div class="second-row">
      <SelectButton
        :options="['all', 'read', 'unread']"
        v-model="readState"
        @change="emit('updateReadState', readState)"
        class="select-button"
      />
      <AutoComplete
        placeholder="search by title"
        :suggestions="filteredTitles"
        v-model="title"
        @complete="search"
        @change="onTitleChange"
        class="search-input"
      />
      <MultiSelect
        v-model="selectedAuthors"
        :options="authors"
        optionLabel="name"
        placeholder="filter by author"
        filter
        @change="onAuthorsChange"
        class="multiselect"
        :maxSelectedLabels="2"
      />
      <MultiSelect
        v-model="selectedPublishers"
        :options="publishers"
        optionLabel="name"
        placeholder="filter by publisher"
        filter
        @change="onPublishersChange"
        class="multiselect"
        :maxSelectedLabels="2"
      />
      <div class="sort-area">
        <Dropdown
          v-model="sortField"
          :options="['authors', 'title']"
          placeholder="sort by"
          class="dropdown"
        />
        <Button
          @click="sortBooks(sortField)"
          :icon="sortField ? (sortOrder === 'asc' ? 'pi pi-sort-alpha-down' : 'pi pi-sort-alpha-up') : 'pi pi-sort'"
          class="button"
        />
      </div>
    </div>
  </div>

  <AddBookDialog
    v-model:visible="addBookDialogVisible"
    @save="saveNewBook"
  />
</template>

<script setup>
import { ref, onMounted, defineProps, watch, defineEmits } from 'vue'
import { useRouter } from 'vue-router'
import Button from 'primevue/button'
import MultiSelect from 'primevue/multiselect'
import AutoComplete from 'primevue/autocomplete'
import AddBookDialog from '../components/AddBookDialog.vue'
import Dropdown from 'primevue/dropdown'
import SelectButton from 'primevue/selectbutton'
import { fetchTitles, fetchAuthors, fetchPublishers } from '../../../backend/src/services/api.js'

const emit = defineEmits(['updateReadState'])
const readState = ref('all')
const addBookDialogVisible = ref(false)
const title = ref('')
const filteredTitles = ref([])
const titles = ref([])
const authors = ref([])
const selectedAuthors = ref([])
const publishers = ref([])
const selectedPublishers = ref([])
const sortField = ref('')
const sortOrder = ref('asc')
const router = useRouter()
const props = defineProps({
  path: String,
  booksQuantity: Number
})

function search(event) {
  filteredTitles.value = titles.value.filter(title => title.toLowerCase().includes(event.query.toLowerCase()))
}

function onTitleChange() {
  updateRoute()
}

function onAuthorsChange() {
  fetchAndSetPublishers()
  updateRoute()
}

function onPublishersChange() {
  fetchAndSetAuthors()
  updateRoute()
}

function openAddBookModal() {
  addBookDialogVisible.value = true
}

function saveNewBook(book) {
  console.log('Book saved:', book)
}

function updateRoute() {
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

  router.push({ path: `/${props.path}`, query: Object.fromEntries(searchParams.entries()) })
}

function sortBooks(field) {
  if (sortField.value !== field) {
    sortField.value = field
    sortOrder.value = 'asc'
  } else {
    sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc'
  }
  console.log('Sort field:', sortField.value, 'Sort order:', sortOrder.value)
  updateRoute()
}


function fetchAndSetPublishers() {
  const authorQuery = selectedAuthors.value.map(author => author.name).join(',')
  fetchPublishers(authorQuery)
    .then(data => {
      publishers.value = [...new Set(data.map(item => item.name))].map(publisher => ({ name: publisher }))
    })
    .catch(error => console.error('Error fetching publishers:', error))
}

function fetchAndSetAuthors() {
  const publisherQuery = selectedPublishers.value.map(publisher => publisher.name).join(',')
  fetchAuthors(publisherQuery)
    .then(data => {
      authors.value = [...new Set(data.map(item => item.name))].map(author => ({ name: author }))
    })
    .catch(error => console.error('Error fetching authors:', error))
}

onMounted(async () => {
  try {
    const [titlesData, authorsData] = await Promise.all([fetchTitles(), fetchAuthors()])
    titles.value = titlesData.map(item => item.title)
    authors.value = authorsData
    fetchAndSetPublishers()
  } catch (error) {
    console.error('Error loading initial data:', error)
  }
})

watch(selectedAuthors, fetchAndSetPublishers)
watch(selectedAuthors, updateRoute)
watch(selectedPublishers, updateRoute)
</script>

<style scoped>
.button {
  background-color: var(--main-color);
  color: var(--text-color);
  border: 1px solid var(--main-color);
}

.first-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
}

.second-row {
  display: flex;
  justify-content: flex-start;
  align-items: center;
  gap: 1rem;
}

.select-button {
  margin-right: 1rem;
  display: flex;
  align-items: center;
  height: 2.5rem;
}

.dropdown {
  width: 12rem;
}

.multiselect {
  width: 24rem;
}

.search-input {
  width: 50%;
}

::v-deep .p-multiselect .p-multiselect-label {
  color: var(--text-color);
}

.p-multiselect:not(.p-disabled).p-focus,
.p-autocomplete-input:not(.p-disabled).p-focus,
.p-dropdown:not(.p-disabled).p-focus {
  outline: 1px solid var(--main-color);
  outline-offset: -1px;
  box-shadow: none;
  border-color: #52525b;
}

.search-wrapper {
  display: flex;
  flex-direction: column;
  margin-bottom: 1rem;
  width: 100%;
}

.add-button {
  background-color: var(--main-color);
  color: var(--text-color);
  border: 1px solid var(--main-color);
  width: 10rem;
}

.add-button:hover {
  background-color: var(--primary-color-dark);
}

::v-deep .p-autocomplete-input {
  width: 100%;
}

.add-book-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.sort-area {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

@media (max-width: 768px) {

  .sort-area,
  .sort-area div {
    width: 100%;
  }

  .search-wrapper {
    gap: 0.5rem;
  }

  .second-row {
    flex-direction: column;
    gap: 0.5rem;
  }

  .search-input,
  .multiselect,
  .dropdown,
  .add-button {
    width: 100%;
  }

  h1 {
    font-size: 1.25rem;
  }
}
</style>
