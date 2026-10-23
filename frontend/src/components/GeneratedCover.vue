<template>
  <span
    class="generated-cover"
    :style="{ '--cover-color': colorFor(title || author) }"
    aria-hidden="true"
  >
    <span class="frame">
      <span
        class="title"
        :class="sizeClass"
      >{{ title }}</span>
      <span class="rule"></span>
      <span
        v-if="author"
        class="author"
      >{{ author }}</span>
    </span>
  </span>
</template>

<script setup>
import { computed } from 'vue'
import { colorFor } from '../utils/tagColors.js'

/**
 * Capa desenhada para livros sem imagem: cor tirada do título (sempre a
 * mesma para o mesmo livro), título e autor escritos. Decorativa — quem
 * usa já mostra o título como texto acessível.
 */
const props = defineProps({
  title: { type: String, default: '' },
  author: { type: String, default: '' }
})

// Título longo encolhe a letra em vez de vazar pela moldura; a palavra mais
// comprida também conta (uma palavra de 14 letras não cabe a 11cqi).
const sizeClass = computed(() => {
  const t = props.title || ''
  const longestWord = Math.max(0, ...t.split(/\s+/).map(w => w.length))
  if (t.length > 60 || longestWord > 13) return 'is-xlong'
  if (t.length > 40 || longestWord > 11) return 'is-long'
  if (t.length > 22) return 'is-medium'
  return ''
})
</script>

<style scoped>
.generated-cover {
  container-type: inline-size;
  display: flex;
  width: 100%;
  height: 100%;
  padding: 7%;
  box-sizing: border-box;
  background:
    linear-gradient(160deg,
      color-mix(in srgb, var(--cover-color) 78%, #000) 0%,
      color-mix(in srgb, var(--cover-color) 38%, #000) 100%);
}

.frame {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  border: 1px solid rgba(255, 255, 255, 0.35);
  padding: 14% 8% 10%;
  text-align: center;
  color: #fff;
  overflow: hidden;
}

.title {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 11cqi;
  line-height: 1.15;
  display: -webkit-box;
  -webkit-line-clamp: 5;
  -webkit-box-orient: vertical;
  overflow: hidden;
  overflow-wrap: anywhere;
  hyphens: auto;
  max-width: 100%;
  flex-shrink: 0;
}

.title.is-medium { font-size: 10cqi; }
.title.is-long { font-size: 8.75cqi; -webkit-line-clamp: 6; }
.title.is-xlong { font-size: 7.5cqi; -webkit-line-clamp: 7; }

.rule {
  width: 30%;
  border-top: 1px solid rgba(255, 255, 255, 0.55);
  margin: auto 0 6%;
  flex-shrink: 0;
}

.author {
  font-size: 6.5cqi;
  opacity: 0.85;
  max-width: 100%;
  overflow-wrap: anywhere;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
