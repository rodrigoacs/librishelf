<template>
  <Dialog
    v-model:visible="visible"
    header="Details"
    :modal="true"
    :style="{ width: '45vw' }"
  >
    <div class="dialog-content">
      <img
        :src="book.path"
        alt="Book Cover"
        style="max-width: 100%; height: 60vh; object-fit: cover;"
      />
      <div class="book-info">
        <div class="top">
          <span class="book-title">{{ book.title }}</span>
          <span class="book-authors"> {{ book.authors }}</span>
          <div class="book-tags">
            <i class="pi pi-tags"></i>
            <Chip
              v-for="tag in book.tags.split(',')"
              :key="tag"
              :label="tag"
            />
          </div>
        </div>
        <div class="bottom">
          <span class="book-publisher">Publisher: {{ book.publisher }}</span>
          <span class="book-isbn">ISBN: {{ book.isbn }}</span>
          <span class="book-read-date">Lido em: {{ book.read_date }}</span>
          <span class="book-pubdate">{{ book.pubdate }}</span>
        </div>
      </div>
    </div>
  </Dialog>
</template>

<script setup>
import { ref, watch, defineProps, defineEmits } from 'vue'
import Dialog from 'primevue/dialog'
import Chip from 'primevue/chip'
import { fetchBookDetails } from '../services/api'

const props = defineProps({
  modelValue: Boolean,
  bookId: Number
})
const emits = defineEmits(['update:modelValue'])
const visible = ref(props.modelValue)
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

watch(() => props.modelValue, (newValue) => {
  visible.value = newValue
})

watch(visible, (newValue) => {
  console.log('visible changed:', newValue)
  emits('update:modelValue', newValue)
  if (newValue) {
    fetchBookDetails(props.bookId)
      .then((response) => {
        book.value = response
      })
      .catch(error => {
        console.error('Error fetching book details:', error)
      })
  }
})
</script>

<style scoped>
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

.book-info {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: space-between;
  text-align: left;
}

.book-info span {
  margin-bottom: 5px;
}

.book-title {
  font-size: 2rem;
  font-weight: bold;
}

.book-authors {
  font-size: 1.2rem;
  color: var(--primary-color);
  font-weight: 700;
}

.book-publisher,
.book-isbn,
.book-read-date,
.book-pubdate {
  font-size: 0.9rem;
}

.book-tags {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}
</style>
