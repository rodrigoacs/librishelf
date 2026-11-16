<template>
  <!-- Capa grande ao lado dos detalhes (escondida no celular) -->
  <div
    class="cover-section"
    :style="missing ? { '--cover-color': colorFor(title || authors) } : undefined"
    :class="{ 'no-cover': missing }"
  >
    <img
      v-if="!missing"
      :src="url"
      class="blur-bg"
      alt=""
      aria-hidden="true"
    />
    <div class="image-container">
      <div class="cover-wrapper">
        <img
          v-if="!missing"
          :key="url"
          :src="url"
          :alt="t('bookDialog.bookCover')"
          class="main-cover"
          @error="event => emit('error', event)"
        />
        <GeneratedCover
          v-else
          class="main-cover"
          :title="title"
          :author="authors"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { useI18n } from 'vue-i18n'
import GeneratedCover from '../GeneratedCover.vue'
import { colorFor } from '../../utils/tagColors.js'

/**
 * Capa do livro aberto sobre o fundo desfocado dela. Sem imagem (missing):
 * capa desenhada e fundo na cor do livro. `error` repassa o erro do <img>
 * para o pai decidir (coverFallbackExhausted).
 */
defineProps({
  url: { type: String, default: '' },
  missing: { type: Boolean, default: false },
  title: { type: String, default: '' },
  authors: { type: String, default: '' }
})
const emit = defineEmits(['error'])

const { t } = useI18n()
</script>

<style scoped>
.cover-section {
  flex: 1;
  max-width: 350px;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
  padding: 0;
  background-color: #09090b;
}

.cover-section.no-cover {
  background: color-mix(in srgb, var(--cover-color) 30%, #09090b);
}

.blur-bg {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  filter: blur(30px) brightness(0.5);
  z-index: 1;
  transform: scale(1.2);
}

.image-container {
  position: relative;
  z-index: 2;
  padding: var(--space-7);
  display: flex;
  justify-content: center;
  width: 100%;
}

.cover-wrapper {
  position: relative;
  width: 100%;
  max-width: 250px;
  aspect-ratio: 2/3;
  border-radius: var(--radius-md);
  overflow: hidden;
  box-shadow: var(--shadow-3);
}

.main-cover {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: filter 0.3s ease;
}

@media (max-width: 1023.98px) {
  /* Celular/tablet em pé: capa compacta em cima */
  .cover-section {
    flex: none;
    max-width: 100%;
    height: 190px;
    border-bottom: 1px solid var(--border-color);
  }

  /* Capa inteira e pequena, em vez de um recorte gigante. */
  .image-container {
    padding: var(--space-4);
    height: 100%;
    box-sizing: border-box;
  }

  .cover-wrapper {
    width: auto;
    height: 100%;
    max-width: none;
  }
}

/* Celular: a capa pequena fica ao lado do título (BookView) */
@media (max-width: 639.98px) {
  .cover-section {
    display: none;
  }
}
</style>
