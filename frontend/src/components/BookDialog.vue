<template>
  <Dialog
    v-model:visible="visible"
    header="Details"
    :modal="true"
    :style="{ width: '800px' }"
  >
    <template #header>
      <div class="header-wrapper">
        <span style="font-size: 1.5rem; font-weight: bold;">Details</span>
        <Button
          v-if="!isEditing"
          icon="pi pi-cog"
          @click="editMode"
        />
        <Button
          v-if="isEditing"
          icon="pi pi-save"
          class="p-button-success"
          @click="saveBookDetails"
        />
      </div>
    </template>

    <div class="dialog-content">
      <img
        :src="book.path"
        alt="Book Cover"
      />
      <div class="book-info">
        <div class="top">
          <input
            class="book-title"
            v-model="book.title"
            :readonly="!isEditing"
          />

          <input
            class="book-authors"
            v-model="book.authors"
            :readonly="!isEditing"
          />

          <div class="book-tags">
            <i class="pi pi-tags" />
            <input
              v-if="isEditing"
              v-model="book.tags"
              placeholder="Edit tags"
            />
            <Chip
              v-else
              v-for="(tag, index) in book.tags.split(',')"
              :key="tag"
              :label="tag"
              :style="{ backgroundColor: getChipColor(index), color: '#18181b', fontWeight: '700', fontSize: '0.9rem' }"
            />
          </div>

          <div class="read-wrapper">
            <Checkbox
              v-model="bookRead"
              inputId="book-read"
              class="book-read"
              :disabled="!isEditing"
              binary
              icon="pi pi-book"
            >
              <template #icon>
                <i
                  v-if="bookRead"
                  style="color: var(--main-color);"
                  class="pi pi-bookmark-fill"
                />
                <i
                  v-else
                  style="color: var(--main-color);"
                  class="pi pi-bookmark"
                />
              </template>
            </Checkbox>

            <span
              v-if="bookRead"
              class="book-read-date"
            >
              <Calendar
                v-model="book.read_date"
                :disabled="!isEditing"
                dateFormat="dd/mm/yy"
              />
            </span>
          </div>
        </div>

        <div class="bottom">
          <span class="book-publisher">
            Publisher:
            <input
              v-if="isEditing"
              v-model="book.publisher"
            />
            <span v-else>{{ book.publisher }}</span>
          </span>

          <span class="book-isbn">
            ISBN:
            <input
              v-if="isEditing"
              v-model="book.isbn"
            />
            <span v-else>{{ book.isbn }}</span>
          </span>

          <span class="book-pubdate">
            <Calendar
              v-model="book.pubdate"
              :disabled="!isEditing"
              dateFormat="dd/mm/yy"
            />
          </span>
        </div>
      </div>
    </div>
  </Dialog>
</template>


<script setup>
import { fetchBookDetails, updateBookDetails } from '../../../backend/src/services/api.js'
import { ref, watch, defineProps, defineEmits } from 'vue'
import Chip from 'primevue/chip'
import Dialog from 'primevue/dialog'
import Calendar from 'primevue/calendar'
import Checkbox from 'primevue/checkbox'
import Button from 'primevue/button'

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

function getChipColor(index) {
  return colors[index % colors.length]
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
    pubdate: book.value.pubdate,
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
        bookRead.value = response.read_date ? true : false
      })
      .catch(error => {
        console.error('Error fetching book details:', error)
      })
  }
})
</script>

<style scoped>
img {
  max-width: 270px;
  height: 40vh;
  object-fit: cover;
  border-radius: 0.5rem;
}

.p-calendar {
  width: 120px;
}

.top {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.bottom {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.dialog-content {
  display: flex;
  flex-direction: row;
  padding: 0px 16px 16px 16px;
  justify-content: flex-start;
  gap: 2rem;
}

i {
  color: var(--main-color);
  width: 1.2rem;
}

.p-button {
  background: none;
  border: none;
  border-radius: 50%;
  color: #a1a1aa;
}

.book-info {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: space-between;
  text-align: left;
}

.read-wrapper {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 0.5rem;
}

.header-wrapper {
  display: flex;
  width: 100%;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
}

.book-title {
  font-size: 1.4rem;
  font-weight: bold;
  border: none;
  background: none;
  width: 450px;
  color: var(--text-color);
}

.book-authors {
  font-size: 1.2rem;
  color: var(--main-color);
  font-weight: 700;
  border: none;
  background: none;
  width: 450px;
}

.book-publisher,
.book-isbn,
.book-read-date,
.book-pubdate {
  font-size: 0.8rem;
}

.book-tags {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}
</style>
