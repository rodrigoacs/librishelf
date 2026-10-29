<template>
  <div
    class="cover-drop"
    :class="{ invalid: Boolean(error) }"
  >
    <button
      :id="id"
      type="button"
      class="drop-zone"
      :class="{ dragging, filled: showImage }"
      :aria-label="showImage ? t('bookForm.cover.change') : t('bookForm.cover.choose')"
      :aria-describedby="error ? `${id}-error` : `${id}-hint`"
      @click="fileInput?.click()"
      @dragenter.prevent="dragging = true"
      @dragover.prevent="dragging = true"
      @dragleave.prevent="onDragLeave"
      @drop.prevent="onDrop"
    >
      <img
        v-if="showImage"
        :src="imageUrl"
        alt=""
        class="cover-image"
        @error="broken = true"
      />
      <span
        v-if="showImage"
        class="change-overlay"
        aria-hidden="true"
      >
        <i class="pi pi-image"></i>
        {{ t('bookForm.cover.change') }}
      </span>
      <span
        v-else
        class="empty-state"
        aria-hidden="true"
      >
        <i class="pi pi-image"></i>
        <span class="empty-title">{{ dragging ? t('bookForm.cover.dropNow') : t('bookForm.cover.drop') }}</span>
      </span>
    </button>
    <small
      v-if="error"
      :id="`${id}-error`"
      class="field-error"
    >
      <i
        class="pi pi-exclamation-circle"
        aria-hidden="true"
      ></i>
      {{ error }}
    </small>
    <small
      v-else
      :id="`${id}-hint`"
      class="field-hint"
      :data-title="showImage ? t('bookForm.cover.change') : t('bookForm.cover.drop')"
    >{{ caption || t('bookForm.cover.hint', { mb: MAX_UPLOAD_MB }) }}</small>
    <input
      ref="fileInput"
      type="file"
      accept="image/*"
      class="hidden-input"
      tabindex="-1"
      aria-hidden="true"
      @change="onPick"
    />
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { MAX_UPLOAD_MB } from '../../config/site.js'

/**
 * Área da capa no tamanho de uma capa (2:3): clique ou arraste uma imagem.
 * Mostra a capa atual, a escolhida ou a que a busca por ISBN achou.
 */
const props = defineProps({
  id: { type: String, required: true },
  imageUrl: { type: String, default: '' },
  caption: { type: String, default: '' },
  error: { type: String, default: '' }
})

const emit = defineEmits(['select'])
const { t } = useI18n()

const fileInput = ref(null)
const dragging = ref(false)
const broken = ref(false)

watch(() => props.imageUrl, () => { broken.value = false })

const showImage = computed(() => Boolean(props.imageUrl) && !broken.value)

function onDragLeave(event) {
  if (!event.currentTarget.contains(event.relatedTarget)) dragging.value = false
}

function onDrop(event) {
  dragging.value = false
  const file = event.dataTransfer?.files?.[0]
  if (file) emit('select', file)
}

function onPick(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (file) emit('select', file)
}
</script>

<style scoped>
.cover-drop {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  width: 100%;
}

.drop-zone {
  position: relative;
  width: 100%;
  aspect-ratio: 2 / 3;
  padding: 0;
  border: 2px dashed var(--border-hover);
  border-radius: var(--radius-md);
  background: var(--bg-input);
  color: var(--text-secondary);
  font: inherit;
  cursor: pointer;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: border-color 0.15s ease, background-color 0.15s ease;
}

.drop-zone:hover,
.drop-zone.dragging {
  border-color: var(--main-color);
  background: rgba(var(--main-color-rgb), 0.08);
  color: var(--text-primary);
}

.drop-zone.filled {
  border-style: solid;
  border-color: transparent;
}

.invalid .drop-zone {
  border-color: var(--red);
}

.drop-zone:focus-visible {
  outline: var(--focus-ring);
  outline-offset: 3px;
}

.cover-image {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.change-overlay {
  position: absolute;
  inset: auto 0 0 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  padding: 0.6rem;
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.75));
  color: #ffffff;
  font-size: var(--fs-sm);
  font-weight: 600;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.drop-zone:hover .change-overlay,
.drop-zone:focus-visible .change-overlay {
  opacity: 1;
}

@media (hover: none) {
  .change-overlay {
    opacity: 1;
  }
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.6rem;
  padding: 1rem;
  text-align: center;
}

.empty-state .pi {
  font-size: var(--fs-2xl);
  color: var(--text-muted);
}

.drop-zone:hover .empty-state .pi,
.drop-zone.dragging .empty-state .pi {
  color: var(--main-color);
}

.empty-title {
  font-size: var(--fs-sm);
  font-weight: 600;
  line-height: 1.35;
}

.field-hint {
  color: var(--text-muted);
  font-size: var(--fs-xs);
  text-align: center;
}

.field-error {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  color: var(--red);
  font-size: var(--fs-xs);
  font-weight: 500;
}

.hidden-input {
  display: none;
}

/* Celular: miniatura ao lado do texto, para o formulário começar logo */
@media (max-width: 1023.98px) {
  .cover-drop {
    flex-direction: row;
    align-items: center;
    gap: 0.9rem;
  }

  .drop-zone {
    width: 76px;
    flex-shrink: 0;
    border-radius: var(--radius-md);
  }

  .empty-title,
  .change-overlay {
    display: none;
  }

  .empty-state .pi {
    font-size: var(--fs-xl);
  }

  .field-hint,
  .field-error {
    text-align: left;
    justify-content: flex-start;
    font-size: var(--fs-sm);
  }

  .field-hint::before {
    content: attr(data-title);
    display: block;
    color: var(--text-primary);
    font-weight: 600;
    margin-bottom: 0.15rem;
  }
}
</style>
