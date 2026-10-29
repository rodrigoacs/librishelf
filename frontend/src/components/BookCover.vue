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
  // books.cover_version: número = tem capa; null = não tem (desenha sem pedir
  // a imagem); sem o campo = tenta a imagem
  version: { type: [Number, null], default: undefined }
})

const src = computed(() => coverUrl(props.bookId, props.version))
const failed = ref(false)
watch(src, () => { failed.value = false })
const missing = computed(() => !src.value || failed.value)

function onError(event) {
  if (coverFallbackExhausted(event)) failed.value = true
}
</script>

<style scoped>
.book-cover {
  display: block;
  aspect-ratio: 2 / 3;
  overflow: hidden;
  border-radius: var(--radius-sm);
  background: var(--bg-input);
}

.book-cover img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
</style>
