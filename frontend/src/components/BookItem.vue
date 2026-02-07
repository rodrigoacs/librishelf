<template>
  <div
    class="book-card"
    @click="openDialog"
  >
    <div class="cover-wrapper">
      <img
        :src="bookCoverUrl"
        @error="handleImageError"
        alt="Book Cover"
        loading="lazy"
      />
      <div class="cover-overlay"></div>

      <div
        v-if="isRead"
        class="bookmark-ribbon"
        title="Lido"
      >
      </div>
    </div>

    <div class="book-details">
      <h3
        class="book-title"
        :title="book.title"
      >{{ book.title }}</h3>
      <p
        class="book-author"
        :title="book.authors"
      >{{ book.authors }}</p>
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
  book: { type: Object, required: true }
})

const emit = defineEmits(['refresh'])
const displayDialog = ref(false)

const isRead = computed(() => {
  const date = props.book.read_date
  return date && !date.startsWith('0101')
})

const bookCoverUrl = computed(() => {
  const id = props.book.book_id || props.book.id
  if (!id) return '/placeholder.png'
  return `${API_URL}/uploads/${id}.avif`
})

function handleImageError(event) {
  const img = event.target

  if (img.dataset.errorHandled) return

  const src = img.src

  if (src.includes('.avif')) {
    img.src = src.replace('.avif', '.jpg')
  }
  else {
    img.dataset.errorHandled = true
    img.src = "data:image/svg+xml;charset=UTF-8,%3Csvg%20width%3D%22300%22%20height%3D%22450%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Crect%20width%3D%22100%25%22%20height%3D%22100%25%22%20fill%3D%22%232a2a2a%22%2F%3E%3Cpath%20d%3D%22M100%20180%20L150%20130%20L200%20180%22%20stroke%3D%22%23444%22%20stroke-width%3D%225%22%20fill%3D%22none%22%2F%3E%3C%2Fsvg%3E"
  }
}

function openDialog() {
  displayDialog.value = true
}
</script>

<style scoped>
.book-card {
  display: flex;
  flex-direction: column;
  width: 100%;
  background-color: var(--bg-panel);
  border-radius: 12px;
  overflow: hidden;
  transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s;
  cursor: pointer;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  position: relative;
}

@media (hover: hover) {
  .book-card:hover {
    transform: translateY(-5px);
    box-shadow: 0 12px 20px rgba(0, 0, 0, 0.3);
    border-color: var(--border-hover);
  }
}

.book-card:active {
  transform: scale(0.98);
}

.cover-wrapper {
  position: relative;
  width: 100%;
  aspect-ratio: 2 / 3;
  overflow: hidden;
  background-color: var(--bg-hover);
  isolation: isolate;
}

.cover-wrapper img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.3s ease;
  position: relative;
  z-index: 1;
  will-change: transform;
  backface-visibility: hidden;
}

.book-card:hover .cover-wrapper img {
  transform: scale(1.05);
}

.cover-overlay {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 40%;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.6) 0%, transparent 100%);
  pointer-events: none;
  z-index: 2;
}

.bookmark-ribbon {
  position: absolute;
  top: -2px;
  right: 12px;
  width: 28px;
  height: 42px;
  background-color: var(--main-color);
  clip-path: polygon(0 0, 100% 0, 100% 100%, 50% 80%, 0 100%);
  filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.5));
  display: flex;
  justify-content: center;
  padding-top: 6px;
  z-index: 3;
  transition: height 0.2s ease;
}

.book-card:hover .bookmark-ribbon {
  height: 48px;
}

.bookmark-ribbon i {
  color: var(--text-inverse);
  font-size: 0.8rem;
  font-weight: bold;
}

.book-details {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  z-index: 2;
  background-color: var(--bg-panel);
}

.book-title {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  line-clamp: 2;
  overflow: hidden;
  line-height: 1.3;
}

.book-author {
  font-size: 0.85rem;
  color: var(--text-secondary);
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
