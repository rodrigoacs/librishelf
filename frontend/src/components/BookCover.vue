<template>
  <span class="book-cover">
    <img
      v-if="!missing"
      :key="src"
      :src="src"
      alt=""
      loading="lazy"
      decoding="async"
      @error="onError"
    />
    <GeneratedCover
      v-else
      :title="title"
      :author="author"
    />
  </span>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import GeneratedCover from './GeneratedCover.vue'
import { coverUrl, coverFallbackExhausted } from '../utils/covers.js'

/**
 * Capa de um livro (AVIF → JPG → capa desenhada). Decorativa: quem usa
 * mostra o título como texto.
 */
const props = defineProps({
  bookId: { type: Number, required: true },
  title: { type: String, default: '' },
  author: { type: String, default: '' },
  version: { type: Number, default: 0 }
})

const src = computed(() => coverUrl(props.bookId, props.version))
const missing = ref(false)
watch(src, () => { missing.value = false })

function onError(event) {
  if (coverFallbackExhausted(event)) missing.value = true
}
</script>

<style scoped>
.book-cover {
  display: block;
  aspect-ratio: 2 / 3;
  overflow: hidden;
  border-radius: 6px;
  background: var(--bg-input);
}

.book-cover img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
</style>
