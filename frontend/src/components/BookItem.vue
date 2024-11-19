<template>
  <div class="book-item">
    <div
      class="book-cover"
      @click="openDialog"
    >
      <img
        :src="book.path"
        alt="Book Cover"
      />
      <span class="more-info">details</span>
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

const displayDialog = ref(false)
const props = defineProps({
  book: Object
})

function openDialog() {
  displayDialog.value = true
}
</script>

<style scoped>
img {
  width: 170px;
  height: 250px;
  object-fit: cover;
  border-radius: 10px;
}

.book-item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  width: 200px;
  margin: 10px;
  padding: 10px;
}

.book-cover {
  position: relative;
  width: 170px;
  height: 250px;
  border-radius: 20px;
  border: 2px solid transparent;
  transition: 0.1s ease-out;
}

.book-cover img {
  border-radius: 10px;
  transition: 0.1s;
  cursor: pointer;
}

.book-cover:hover img {
  filter: brightness(0.5);
}

.more-info {
  cursor: pointer;
  width: 70%;
  text-align: center;
  border-radius: 1rem;
  border: none;
  background-color: var(--main-color);
  color: #fff;
  font-size: 1rem;
  padding: .5rem 1rem;
  position: absolute;
  left: 50%;
  bottom: 0px;
  transform: translateX(-50%);
  opacity: 0;
  transition: 0.1s ease-out;
}

.book-cover:hover .more-info {
  opacity: 1;
  bottom: 90px;
}

.book-info {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  text-align: left;
  margin-top: 16px;
  width: 170px;
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

@media (max-width: 768px) {
  .grid {
    justify-content: space-between;
  }

  .book-item {
    width: 150px;
    margin: 0;
    padding: 0;
  }

  .book-cover {
    width: 150px;
    height: 220px;
  }

  img {
    width: 150px;
    height: 220px;
  }
}
</style>
