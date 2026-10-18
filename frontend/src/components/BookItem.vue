<template>
  <div class="book-card-wrapper">
    <button
      type="button"
      class="book-card"
      :aria-label="ariaLabel"
      @click="displayDialog = true"
    >
      <span class="cover-wrapper">
        <img
          v-if="!coverMissing"
          :key="bookCoverUrl"
          :src="bookCoverUrl"
          :alt="''"
          loading="lazy"
          decoding="async"
          @error="onCoverError"
        />
        <GeneratedCover
          v-else
          :title="book.title"
          :author="book.authors"
        />
        <span
          class="cover-overlay"
          aria-hidden="true"
        ></span>

        <span
          v-if="isRead"
          class="bookmark-ribbon"
          :title="t('book.read_ribbon')"
          aria-hidden="true"
        ></span>
      </span>

      <span class="book-details">
        <span
          class="book-title"
          :title="book.title"
        >{{ book.title }}</span>
        <span
          class="book-author"
          :title="book.authors"
        >{{ book.authors }}</span>
      </span>
    </button>

    <BookDialog
      v-if="displayDialog"
      :bookId="bookId"
      :isReadOnly="readOnly"
      :ownerUsername="ownerUsername"
      :modelValue="displayDialog"
      @update:modelValue="displayDialog = $event"
      @updated="payload => emit('updated', payload)"
      @deleted="id => emit('deleted', id)"
    />
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import BookDialog from './BookDialog.vue'
import { coverUrl, coverFallbackExhausted } from '../utils/covers.js'
import GeneratedCover from './GeneratedCover.vue'

const { t } = useI18n()

const props = defineProps({
  book: { type: Object, required: true },
  coverVersion: { type: Number, default: 0 },
  readOnly: { type: Boolean, default: false },
  ownerUsername: { type: String, default: '' }
})

const emit = defineEmits(['updated', 'deleted'])
const displayDialog = ref(false)

const bookId = computed(() => props.book.book_id ?? props.book.id)
const isRead = computed(() => Boolean(props.book.read_date))
const bookCoverUrl = computed(() => coverUrl(bookId.value, props.coverVersion))

// Sem imagem (ou falhou): capa desenhada com título e autor, colorida pelo título.
const coverMissing = ref(false)
watch(bookCoverUrl, () => { coverMissing.value = false })

function onCoverError(event) {
  if (coverFallbackExhausted(event)) coverMissing.value = true
}

const ariaLabel = computed(() => {
  const parts = [props.book.title, props.book.authors].filter(Boolean)
  if (isRead.value) parts.push(t('book.read_ribbon'))
  return parts.join(' — ')
})
</script>

<style scoped>
.book-card-wrapper {
  display: flex;
  min-width: 0;
}

button.book-card {
  flex: 1;
  border: none;
  font: inherit;
  color: inherit;
  text-align: left;
  padding: 0;
  width: 100%;
  appearance: none;
}

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
  display: block;
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
  display: block;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  z-index: 2;
  background-color: var(--bg-panel);
}

.book-title {
  display: block;
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
  display: block;
  font-size: 0.85rem;
  color: var(--text-secondary);
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
