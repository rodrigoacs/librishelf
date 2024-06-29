<template>
  <div class="book-item">
    <div class="book-cover">
      <img
        :src="book.path"
        alt="Book Cover"
        style="max-width: 140px; height: 220px; object-fit: cover;"
      />
      <i
        @click="openDialog"
        class="pi pi-info-circle"
      />
    </div>
    <div class="book-info">
      <span class="book-title">{{ book.title }}</span>
      <span class="book-authors">{{ book.authors }}</span>
    </div>
    <BookDialog
      :bookId="book.id"
      :modelValue="displayDialog"
      @update:modelValue="displayDialog = $event"
    />
  </div>
</template>

<script setup>
import { defineProps, ref } from 'vue'
import BookDialog from './BookDialog.vue'

const props = defineProps({
  book: Object
})

const displayDialog = ref(false)

function openDialog() {
  displayDialog.value = true
}
</script>

<style scoped>
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
  color: var(--main-color);
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
