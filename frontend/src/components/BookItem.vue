<template>
  <div class="book-card-wrapper">
    <button
      type="button"
      class="book-card"
      :class="{ 'is-selected': selectable && selected }"
      :aria-label="ariaLabel"
      :aria-pressed="selectable ? selected : undefined"
      @click="onCardClick"
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
          v-if="selectable"
          class="select-check"
          :class="{ checked: selected }"
          aria-hidden="true"
        ><i class="pi pi-check"></i></span>

        <span
          v-if="status === 'reading' || status === 'want'"
          class="status-badge"
          :class="status"
        >{{ t(`status.${status}`) }}</span>

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
        <span
          v-if="book.series"
          class="book-series"
        >{{ seriesText(book, t, locale) }}</span>
      </span>
    </button>

    <button
      v-if="quickActions && !readOnly && !selectable"
      type="button"
      class="quick-read"
      :class="{ 'is-read': isRead, busy: saving }"
      :aria-pressed="isRead"
      :aria-label="isRead ? t('book.quick_unread', { title: book.title }) : t('book.quick_read', { title: book.title })"
      v-tooltip.top="isRead ? t('book.quick_unread_short') : t('book.quick_read_short')"
      :disabled="saving"
      @click="toggleRead"
    >
      <i
        :class="saving ? 'pi pi-spin pi-spinner' : 'pi pi-check'"
        aria-hidden="true"
      ></i>
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
import { useReadToggle } from '../composables/useReadToggle.js'
import { statusOf } from '../utils/readingStatus.js'
import { seriesText } from '../utils/series.js'
import { coverUrl, coverFallbackExhausted } from '../utils/covers.js'
import GeneratedCover from './GeneratedCover.vue'

const { t, locale } = useI18n()

const props = defineProps({
  book: { type: Object, required: true },
  coverVersion: { type: Number, default: 0 },
  readOnly: { type: Boolean, default: false },
  ownerUsername: { type: String, default: '' },
  /** Botão de marcar como lido sobre a capa (só na biblioteca do dono). */
  quickActions: { type: Boolean, default: false },
  /** Modo seleção (ações em lote): clicar marca/desmarca em vez de abrir. */
  selectable: { type: Boolean, default: false },
  selected: { type: Boolean, default: false }
})

const emit = defineEmits(['updated', 'deleted', 'toggle-select'])

function onCardClick() {
  if (props.selectable) emit('toggle-select', bookId.value)
  else displayDialog.value = true
}
const displayDialog = ref(false)

const bookId = computed(() => props.book.book_id ?? props.book.id)
const status = computed(() => statusOf(props.book))
const isRead = computed(() => status.value === 'read')
const { saving, toggleRead } = useReadToggle(() => props.book, payload => emit('updated', payload))
const bookCoverUrl = computed(() => coverUrl(bookId.value, props.coverVersion))

// Sem imagem (ou falhou): capa desenhada com título e autor, colorida pelo título.
const coverMissing = ref(false)
watch(bookCoverUrl, () => { coverMissing.value = false })

function onCoverError(event) {
  if (coverFallbackExhausted(event)) coverMissing.value = true
}

const ariaLabel = computed(() => {
  const parts = [props.book.title, props.book.authors].filter(Boolean)
  if (status.value !== 'none') parts.push(t(`status.${status.value}`))
  return parts.join(' — ')
})
</script>

<style scoped>
.book-card-wrapper {
  display: flex;
  min-width: 0;
  position: relative;
}

/* Marcar como lido sem abrir o livro: canto superior esquerdo da capa
   (a fita de "lido" fica no direito). No mouse aparece ao passar por cima;
   no toque fica sempre visível. */
.quick-read {
  position: absolute;
  top: 8px;
  left: 8px;
  z-index: 4;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.35);
  background: rgba(0, 0, 0, 0.55);
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: opacity 0.15s ease, background-color 0.15s ease, transform 0.15s ease;
}

.quick-read .pi {
  font-size: 0.85rem;
  font-weight: 700;
}

.quick-read.is-read {
  background: var(--main-color);
  border-color: transparent;
  color: var(--text-inverse);
}

.quick-read:active {
  transform: scale(0.92);
}

.quick-read:focus-visible {
  outline: 2px solid var(--main-color);
  outline-offset: 2px;
  opacity: 1;
}

@media (hover: hover) {
  .quick-read {
    opacity: 0;
  }

  .book-card-wrapper:hover .quick-read,
  .quick-read.busy {
    opacity: 1;
  }

  .quick-read:hover {
    background: rgba(0, 0, 0, 0.75);
  }

  .quick-read.is-read:hover {
    background: var(--main-color);
    filter: brightness(1.1);
  }
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

.select-check {
  position: absolute;
  top: 8px;
  left: 8px;
  z-index: 4;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  border: 2px solid #ffffff;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  color: transparent;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);
}

.select-check.checked {
  background: var(--main-color);
  border-color: var(--main-color);
  color: var(--text-inverse);
}

.select-check .pi {
  font-size: 0.8rem;
  font-weight: 700;
}

.book-card.is-selected {
  outline: 3px solid var(--main-color);
  outline-offset: 2px;
}

.status-badge {
  position: absolute;
  left: 8px;
  bottom: 8px;
  z-index: 3;
  padding: 0.2rem 0.55rem;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.2px;
  line-height: 1.3;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35);
}

.status-badge.reading {
  background: var(--main-color);
  color: var(--text-inverse);
}

.status-badge.want {
  background: rgba(0, 0, 0, 0.6);
  color: #ffffff;
  border: 1px solid rgba(255, 255, 255, 0.35);
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
.book-series {
  display: block;
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--main-color);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
