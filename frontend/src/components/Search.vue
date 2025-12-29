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
        @change="emitFilter('readState', readState)"
        class="select-button"
      />

      <span class="p-input-icon-left search-input-container">
        <i class="pi pi-search" />
        <InputText
          v-model="searchText"
          placeholder="Search by title or ISBN"
          class="search-input"
          @input="emitFilter('search', searchText)"
        />
      </span>

      <MultiSelect
        v-model="selectedAuthors"
        :options="authorsList"
        optionLabel="name"
        placeholder="Filter by author"
        filter
        display="chip"
        @change="emitFilter('author', selectedAuthors)"
        class="multiselect"
        :maxSelectedLabels="1"
      />

      <MultiSelect
        v-model="selectedPublishers"
        :options="publishersList"
        optionLabel="name"
        placeholder="Filter by publisher"
        filter
        display="chip"
        @change="emitFilter('publisher', selectedPublishers)"
        class="multiselect"
        :maxSelectedLabels="1"
      />

      <div class="sort-area">
        <Dropdown
          v-model="sortField"
          :options="['title', 'authors', 'pubDate', 'readDate']"
          placeholder="Sort by"
          class="dropdown"
          @change="emitFilter('sortField', sortField)"
        />
        <Button
          @click="toggleSortOrder"
          :icon="sortOrder === 'asc' ? 'pi pi-sort-amount-down' : 'pi pi-sort-amount-up-alt'"
          class="button"
        />
      </div>
    </div>
  </div>

  <AddBookDialog
    v-model:visible="addBookDialogVisible"
    @save="onBookSaved"
  />
</template>

<script setup>
import { ref, onMounted, defineProps, defineEmits } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import Button from 'primevue/button'
import MultiSelect from 'primevue/multiselect'
import InputText from 'primevue/inputtext'
import Dropdown from 'primevue/dropdown'
import SelectButton from 'primevue/selectbutton'
import AddBookDialog from '../components/AddBookDialog.vue'
import api from '../services/api.js'

const props = defineProps({
  path: String,
  booksQuantity: Number,
  loading: Boolean
})

const emit = defineEmits(['updateReadState', 'filter-change', 'refresh'])
const router = useRouter()
const route = useRoute()

const addBookDialogVisible = ref(false)
const readState = ref('all')
const searchText = ref('')
const sortField = ref('title')
const sortOrder = ref('asc')

const selectedAuthors = ref([])
const authorsList = ref([])

const selectedPublishers = ref([])
const publishersList = ref([])

function emitFilter(key, value) {
  emit('filter-change', { key, value })
  updateUrlParams()
}

function toggleSortOrder() {
  sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc'
  emitFilter('sortOrder', sortOrder.value)
}

function openAddBookModal() {
  addBookDialogVisible.value = true
}

function onBookSaved() {
  emit('refresh')
}

function updateUrlParams() {
  const query = {}
  if (searchText.value) query.search = searchText.value
  if (readState.value !== 'all') query.readState = readState.value
  if (sortField.value !== 'title') query.sort = sortField.value
  if (sortOrder.value !== 'asc') query.order = sortOrder.value

  if (selectedAuthors.value.length) {
    query.author = selectedAuthors.value.map(a => a.name).join(',')
  }
  if (selectedPublishers.value.length) {
    query.publisher = selectedPublishers.value.map(p => p.name).join(',')
  }

  router.replace({ query })
}

async function loadFilterOptions() {
  try {
    const [authorsData, publishersData] = await Promise.all([
      api.getAuthors(),
      api.getPublishers()
    ])

    authorsList.value = authorsData.map(a => ({ name: a.name || a }))
    publishersList.value = publishersData.map(p => ({ name: p.name || p }))

  } catch (error) {
    console.error('Erro ao carregar filtros:', error)
  }
}

onMounted(() => {
  loadFilterOptions()

  if (route.query.search) {
    searchText.value = route.query.search
    emitFilter('search', searchText.value)
  }
})
</script>

<style scoped>
.search-input-container {
  position: relative;
  width: 50%;
}

.search-input-container i {
  position: absolute;
  top: 50%;
  left: 0.75rem;
  transform: translateY(-50%);
  color: #888;
  z-index: 1;
}

.search-input {
  width: 100%;
  padding-left: 2.5rem;
}

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
  width: 20rem;
}

::v-deep .p-multiselect .p-multiselect-label {
  color: var(--text-color);
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
    width: 100%;
  }

  .search-input-container,
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
