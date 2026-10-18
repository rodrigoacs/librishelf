<template>
  <span
    class="generated-cover"
    :style="{ '--cover-color': colorFor(title || author) }"
    aria-hidden="true"
  >
    <span class="frame">
      <span class="title">{{ title }}</span>
      <span class="rule"></span>
      <span
        v-if="author"
        class="author"
      >{{ author }}</span>
    </span>
  </span>
</template>

<script setup>
import { colorFor } from '../utils/tagColors.js'

/**
 * Capa desenhada para livros sem imagem: cor tirada do título (sempre a
 * mesma para o mesmo livro), título e autor escritos. Decorativa — quem
 * usa já mostra o título como texto acessível.
 */
defineProps({
  title: { type: String, default: '' },
  author: { type: String, default: '' }
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
  font-family: 'Georgia', serif;
  font-weight: 700;
  font-size: 11cqi;
  line-height: 1.15;
  display: -webkit-box;
  -webkit-line-clamp: 5;
  -webkit-box-orient: vertical;
  overflow: hidden;
  overflow-wrap: anywhere;
}

.rule {
  width: 30%;
  border-top: 1px solid rgba(255, 255, 255, 0.55);
  margin: auto 0 6%;
}

.author {
  font-size: 6.5cqi;
  opacity: 0.85;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
