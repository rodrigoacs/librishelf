<template>
  <div class="book-item">
    <div
      class="book-cover"
      @click="openDialog"
    >
      <img
        :src="bookCoverUrl"
        @error="handleImageError"
        alt="Book Cover"
      />
      <span class="more-info">details</span>
    </div>

    <div class="book-info">
      <span class="book-title">{{ book.title }}</span>
      <span class="book-authors">{{ book.authors }}</span>
    </div>

    <BookDialog
      v-if="displayDialog"
      :bookId="book.book_id || book.id"
      :modelValue="displayDialog"
      @update:modelValue="displayDialog = $event"
      @refresh="emit('refresh')"
    />
  </div>
</template>

<script setup>
import { defineProps, defineEmits, ref, computed } from 'vue'
import BookDialog from './BookDialog.vue'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3050'

const props = defineProps({
  book: {
    type: Object,
    required: true
  }
})

const emit = defineEmits(['refresh'])

const displayDialog = ref(false)

const bookCoverUrl = computed(() => {
  const id = props.book.book_id || props.book.id

  if (!id) return '/placeholder_cover.png'

  return `${API_URL}/uploads/${id}.jpg`
})

function openDialog() {
  displayDialog.value = true
}

function handleImageError(event) {
  if (event.target.dataset.errorHandled) return
  event.target.dataset.errorHandled = true

  event.target.style.opacity = '0'
  event.target.src = "data:image/svg+xml;charset=UTF-8,%3Csvg%20width%3D%22170%22%20height%3D%22250%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Crect%20width%3D%22100%25%22%20height%3D%22100%25%22%20fill%3D%22%23333333%22%2F%3E%3Ctext%20x%3D%2250%25%22%20y%3D%2250%25%22%20fill%3D%22white%22%20text-anchor%3D%22middle%22%20dy%3D%22.3em%22%3ENo%20Cover%3C%2Ftext%3E%3C%2Fsvg%3E"
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
  background-color: var(--main-color, #4caf50);
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
