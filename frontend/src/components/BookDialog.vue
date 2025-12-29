<template>
  <Dialog
    v-model:visible="visible"
    :modal="true"
    class="dialog-overlay"
    :dismissableMask="true"
    @hide="closeDialog"
  >
    <template #container>
      <div class="dialog-content">
        <img
          :src="bookCoverUrl"
          @error="handleImageError"
          alt="Book Cover"
          class="book-cover"
        />

        <div class="book-info">
          <div class="top">
            <div class="header-row">
              <input
                class="book-title"
                v-model="book.title"
                :readonly="!isEditing"
              />
              <Button
                v-if="!isEditing"
                icon="pi pi-cog"
                class="edit-button"
                @click="editMode"
              />
              <Button
                v-if="isEditing"
                icon="pi pi-save"
                class="save-button"
                @click="saveBookDetails"
              />
            </div>

            <input
              class="book-authors"
              v-model="book.authors"
              :readonly="!isEditing"
            />

            <div class="book-tags">
              <input
                v-if="isEditing"
                v-model="book.tags"
                class="edit-tags"
                placeholder="Tags separadas por vírgula"
              />
              <div v-else>
                <Chip
                  v-for="tag in (book.tags ? book.tags.split(',') : [])"
                  :key="tag"
                  :label="tag.trim()"
                  :style="{ backgroundColor: getChipColor(), color: '#000' }"
                  class="book-chip"
                />
              </div>
            </div>

            <div class="book-read-date">
              <i
                v-if="book.read_date"
                class="pi pi-bookmark-fill bookmark-icon"
              ></i>
              <Calendar
                v-model="book.read_date"
                :disabled="!isEditing"
                dateFormat="dd/mm/yy"
                class="calendar-input"
                placeholder="Não lido"
              />
            </div>
          </div>

          <div class="bottom">
            <div class="book-publisher">
              <span>Editora: </span>
              <input
                v-if="isEditing"
                v-model="book.publisher"
                class="editable-input"
              />
              <span v-else>{{ book.publisher }}</span>
            </div>

            <div class="book-isbn">
              <span>ISBN: </span>
              <input
                v-if="isEditing"
                v-model="book.isbn"
                class="editable-input"
              />
              <span v-else>{{ book.isbn }}</span>
            </div>

            <div class="book-pubdate">
              <span>Data de Publicação: </span>
              <Calendar
                v-model="book.pubdate"
                :disabled="!isEditing"
                dateFormat="dd/mm/yy"
                class="calendar-input"
              />
            </div>
          </div>
        </div>
      </div>
    </template>
  </Dialog>
</template>

<script setup>
import { ref, watch, defineProps, defineEmits, computed, onMounted } from 'vue'
import Chip from 'primevue/chip'
import Dialog from 'primevue/dialog'
import Calendar from 'primevue/calendar'
import Button from 'primevue/button'
import api from '../services/api.js'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3050'

const props = defineProps({
  modelValue: Boolean,
  bookId: Number
})

const emits = defineEmits(['update:modelValue', 'refresh'])

const visible = ref(props.modelValue)
const isEditing = ref(false)

const book = ref({
  title: 'Carregando...',
  authors: '',
  publisher: '',
  tags: '',
  isbn: '',
  read_date: null,
  pubdate: null
})

const colors = ['var(--red)', 'var(--green)', 'var(--blue)', 'var(--purple)', 'var(--yellow)', 'var(--orange)']
let shuffledColors = []

function shuffleColors() {
  shuffledColors = [...colors].sort(() => Math.random() - 0.5)
}

function getChipColor() {
  if (shuffledColors.length === 0) shuffleColors()
  return shuffledColors.pop()
}

const bookCoverUrl = computed(() => {
  if (!props.bookId) return '/placeholder.png'
  return `${API_URL}/uploads/${props.bookId}.jpg`
})

function handleImageError(e) {
  if (e.target.dataset.errorHandled) return
  e.target.dataset.errorHandled = true
  e.target.src = "data:image/svg+xml;charset=UTF-8,%3Csvg%20width%3D%22300%22%20height%3D%22500%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Crect%20width%3D%22100%25%22%20height%3D%22100%25%22%20fill%3D%22%232a2a2a%22%2F%3E%3Ctext%20x%3D%2250%25%22%20y%3D%2250%25%22%20fill%3D%22%23aaaaaa%22%20text-anchor%3D%22middle%22%20font-family%3D%22sans-serif%22%20dy%3D%22.3em%22%3ENo%20Cover%3C%2Ftext%3E%3C%2Fsvg%3E"
}

function editMode() {
  isEditing.value = !isEditing.value
}

function closeDialog() {
  isEditing.value = false
}

function formatDate(date) {
  if (!date) return null
  const d = new Date(date)
  if (isNaN(d.getTime())) return null
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function isValidReadDate(dateString) {
  if (!dateString) return false
  if (dateString.startsWith('0101')) return false
  return true
}

async function saveBookDetails() {
  const updatedBook = {
    title: book.value.title,
    authors: book.value.authors,
    publisher: book.value.publisher,
    tags: book.value.tags ? book.value.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
    isbn: book.value.isbn,
    pubdate: formatDate(book.value.pubdate),
    read_date: formatDate(book.value.read_date)
  }

  try {
    await api.updateBook(props.bookId, updatedBook)
    isEditing.value = false
    emits('refresh')
  } catch (error) {
    console.error('Error updating book details:', error)
    alert('Erro ao atualizar: ' + error.message)
  }
}

async function loadBookData() {
  console.log('Iniciando carga do livro ID:', props.bookId)

  if (!props.bookId) return

  try {
    const response = await api.getBookById(props.bookId)

    book.value.title = response.title || ''
    book.value.authors = response.authors || ''
    book.value.isbn = response.isbn || ''
    book.value.publisher = response.publisher_name || response.publisher || ''
    book.value.tags = response.tags || ''

    book.value.pubdate = response.publication_date
      ? new Date(new Date(response.publication_date).getUTCFullYear(), new Date(response.publication_date).getUTCMonth(), new Date(response.publication_date).getUTCDate())
      : null

    if (isValidReadDate(response.read_date)) {
      const d = new Date(response.read_date)
      book.value.read_date = new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
    } else {
      book.value.read_date = null
    }

  } catch (error) {
    console.error('Erro ao buscar detalhes:', error)
    book.value.title = 'Erro ao carregar dados'
  }
}

watch(() => props.modelValue, (newValue) => {
  visible.value = newValue
})

watch(visible, (newValue) => {
  emits('update:modelValue', newValue)
})

onMounted(() => {
  if (visible.value) {
    loadBookData()
  }
})
</script>

<style scoped>
.dialog-content {
  display: flex;
  flex-direction: row;
  gap: 1rem;
}

.book-cover {
  height: 500px;
  object-fit: cover;
  border-radius: 1rem 0 0 1rem;
}

.book-info {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  color: #f5f5f5;
  width: 100%;
  padding: 1rem;
}

.top,
.bottom {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.book-title,
.book-authors,
.edit-tags,
.editable-input {
  background: none;
  border: none;
  width: 100%;
  color: #f5f5f5;
}

.book-title {
  font-size: 1.8rem;
  font-weight: bold;
}

.book-authors {
  font-size: 1.2rem;
  color: #a1a1a1;
}

.book-tags {
  display: flex;
  gap: 0.5rem;
}

.book-chip {
  font-weight: 700;
  font-size: 0.9rem;
  margin-right: 0.5rem;
  padding: 0.25rem 0.5rem;
  border-radius: 12px;
}

.book-read-date {
  display: flex;
  align-items: center;
  font-size: 0.9rem;
}

.bookmark-icon {
  margin-right: 0.5rem;
  color: var(--main-color, #4caf50);
}

.calendar-input {
  color: #f5f5f5;
}

.book-publisher,
.book-isbn,
.book-pubdate {
  font-size: 0.9rem;
}

.save-button,
.edit-button {
  background-color: var(--main-color, #4caf50);
  color: var(--text-color, #fff);
  border: none;
}

@media (max-width: 768px) {
  .dialog-content {
    flex-direction: column;
    gap: 0;
  }

  .book-cover {
    border-radius: 1rem 1rem 0 0;
  }

  .book-title {
    font-size: 1.5rem;
  }

  .book-authors {
    font-size: 1rem;
  }

  .book-tags,
  .book-chip,
  .book-read-date,
  .bottom,
  .editable-input {
    font-size: 0.8rem;
  }

  .book-info,
  .top,
  .header-row,
  .book-read-date {
    gap: 0.5rem;
  }

  .book-tags {
    gap: 0.25rem;
  }
}
</style>
