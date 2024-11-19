<template>
  <Dialog
    v-model:visible="visible"
    :modal="true"
    class="dialog-overlay"
    :dismissableMask="true"
  >
    <template #container="{ closeCallback }">
      <div class="dialog-content">
        <img
          :src="book.path"
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
                placeholder="Edit tags"
              />
              <div v-else>
                <Chip
                  v-for="(tag, index) in book.tags.split(',')"
                  :key="tag"
                  :label="tag"
                  :style="{ backgroundColor: getChipColor(), color: '#000' }"
                  class="book-chip"
                />
              </div>
            </div>
            <div class="book-read-date">
              <i
                v-if="bookRead"
                class="pi pi-bookmark-fill bookmark-icon"
              ></i>
              <Calendar
                v-model="book.read_date"
                :disabled="!isEditing"
                dateFormat="dd/mm/yy"
                class="calendar-input"
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
import { ref, watch, defineProps, defineEmits } from 'vue'
import Chip from 'primevue/chip'
import Dialog from 'primevue/dialog'
import Calendar from 'primevue/calendar'
import Button from 'primevue/button'
import { fetchBookDetails, updateBookDetails } from '../../../backend/src/services/api.js'

const props = defineProps({
  modelValue: Boolean,
  bookId: Number
})
const emits = defineEmits(['update:modelValue'])
const visible = ref(props.modelValue)
const bookRead = ref(false)
const isEditing = ref(false)
const book = ref({
  path: '',
  title: '',
  authors: '',
  publisher: '',
  tags: '',
  isbn: '',
  read_date: '',
  pubdate: ''
})
const colors = [
  'var(--red)',
  'var(--green)',
  'var(--blue)',
  'var(--purple)',
  'var(--yellow)',
  'var(--orange)'
]

let shuffledColors = []

function shuffleColors() {
  shuffledColors = [...colors].sort(() => Math.random() - 0.5)
}

function getChipColor() {
  if (shuffledColors.length === 0) {
    shuffleColors()
  }

  return shuffledColors.pop()
}

function editMode() {
  isEditing.value = !isEditing.value
}

async function saveBookDetails() {
  const updatedBook = {
    title: book.value.title,
    authors: book.value.authors,
    publisher: book.value.publisher,
    tags: book.value.tags,
    isbn: book.value.isbn,
    pubdate: book.value.pubdate instanceof Date ? book.value.pubdate.toISOString().split('T')[0] : null,
    read_date: book.value.read_date ? book.value.read_date.toISOString().split('T')[0] : null
  }

  try {
    await updateBookDetails(props.bookId, updatedBook)
    isEditing.value = false
  } catch (error) {
    console.error('Error updating book details:', error)
  }
}

watch(() => props.modelValue, (newValue) => {
  visible.value = newValue
})

watch(visible, (newValue) => {
  emits('update:modelValue', newValue)
  if (newValue) {
    fetchBookDetails(props.bookId)
      .then((response) => {
        book.value = response
        book.value.read_date = response.read_date ? new Date(response.read_date) : null
        book.value.pubdate = response.pubdate ? new Date(response.pubdate) : ''
        bookRead.value = response.read_date ? true : false
      })
      .catch(error => {
        console.error('Error fetching book details:', error)
      })
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
  color: var(--main-color);
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
  background-color: var(--main-color);
  color: var(--text-color);
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
