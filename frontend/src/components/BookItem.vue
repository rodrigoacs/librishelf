<template>
  <div class="book-card-wrapper">
    <button
      type="button"
      class="book-card"
      :class="{ 'is-selected': selectable && selected }"
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
          v-if="isRead && !showQuick"
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
        <!-- O nome do botão é o texto visível (status, título, autor, série);
             "Lido" aparece só como fita, então vai em texto para leitor de tela -->
        <span
          v-if="isRead"
          class="sr-only"
        >, {{ t('status.read') }}</span>
      </span>
    </button>

    <button
      v-if="showQuick"
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
      :coverVersion="book.cover_version"
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
  readOnly: { type: Boolean, default: false },
  ownerUsername: { type: String, default: '' },
  /** Botão de marcar como lido sobre a capa (só na biblioteca do dono). */
  quickActions: { type: Boolean, default: false },
  /** Modo seleção (ações em lote): clicar marca/desmarca em vez de abrir. */
  selectable: { type: Boolean, default: false },
  selected: { type: Boolean, default: false },
  /** Quem usa abre o livro pela URL (?book=<id>, evento "open") em vez do diálogo daqui. */
  openInUrl: { type: Boolean, default: false }
})

const emit = defineEmits(['updated', 'deleted', 'toggle-select', 'open'])

function onCardClick() {
  if (props.selectable) emit('toggle-select', bookId.value)
  else if (props.openInUrl) emit('open', bookId.value)
  else displayDialog.value = true
}
const displayDialog = ref(false)

const bookId = computed(() => props.book.book_id ?? props.book.id)
const status = computed(() => statusOf(props.book))
const isRead = computed(() => status.value === 'read')
// Na biblioteca do dono a própria fita é o botão: lido = fita cheia (clicar
// desmarca); não lido = fita vazada que aparece ao passar o mouse.
const showQuick = computed(() => props.quickActions && !props.readOnly && !props.selectable)
const { saving, toggleRead } = useReadToggle(() => props.book, payload => emit('updated', payload))
// cover_version null = sem capa: desenha direto, sem pedir a imagem
const bookCoverUrl = computed(() => coverUrl(bookId.value, props.book.cover_version))

// Sem imagem (ou falhou): capa desenhada com título e autor, colorida pelo título.
const coverFailed = ref(false)
watch(bookCoverUrl, () => { coverFailed.value = false })
const coverMissing = computed(() => !bookCoverUrl.value || coverFailed.value)

function onCoverError(event) {
  if (coverFallbackExhausted(event)) coverFailed.value = true
}

</script>

<style scoped>
.book-card-wrapper {
  display: flex;
  min-width: 0;
  position: relative;
}

/* Marcar como lido sem abrir o livro: a fita do canto superior direito é o
   botão. Lido = fita cheia; não lido = fita escura vazada, que no mouse só
   aparece ao passar por cima e no toque fica sempre visível. */
.quick-read {
  position: absolute;
  top: -2px;
  right: 12px;
  z-index: 4;
  width: 28px;
  height: 42px;
  padding: 6px 0 0;
  border: none;
  /* O desenho da fita fica no ::before: com o clip-path no próprio botão, a
     área de toque também era recortada e não dava para aumentá-la */
  background: transparent;
  --ribbon-bg: rgba(0, 0, 0, 0.6);
  color: rgba(255, 255, 255, 0.85);
  filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.5));
  display: flex;
  align-items: flex-start;
  justify-content: center;
  cursor: pointer;
  transition: opacity 0.15s ease, height 0.2s ease, transform 0.2s ease;
}

.quick-read::before {
  content: '';
  position: absolute;
  inset: 0;
  background: var(--ribbon-bg);
  clip-path: polygon(0 0, 100% 0, 100% 100%, 50% 80%, 0 100%);
  transition: background-color 0.15s ease;
}

.quick-read .pi {
  position: relative;
  font-size: var(--fs-sm);
  font-weight: 700;
}

.quick-read.is-read {
  --ribbon-bg: var(--main-solid);
  color: var(--on-main);
}

.quick-read:focus-visible {
  outline: none;
  height: 48px;
  --ribbon-bg: var(--main-solid);
  color: var(--on-main);
  opacity: 1;
}

@media (hover: hover) {
  .quick-read:not(.is-read) {
    opacity: 0;
  }

  /* Teclado: aparece com o foco no card ou no próprio botão (antes o
     opacity: 0 acima vencia o :focus-visible e o botão ficava invisível) */
  .book-card-wrapper:hover .quick-read,
  .book-card-wrapper:focus-within .quick-read,
  .quick-read.busy {
    opacity: 1;
  }

  /* Acompanha o card, que sobe 5 px ao passar o mouse, e cresce para
     baixo: a ponta desce 6 px na tela (com 48 px a ponta ficava no lugar e
     a fita parecia crescer para cima) */
  .book-card-wrapper:hover .quick-read {
    height: 53px;
    transform: translateY(-5px);
  }

  .quick-read:not(.is-read):hover {
    --ribbon-bg: rgba(0, 0, 0, 0.8);
    color: #ffffff;
  }

  .quick-read.is-read:hover {
    filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.5)) brightness(1.1);
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
  border-radius: var(--radius-md);
  overflow: hidden;
  transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s;
  cursor: pointer;
  box-shadow: var(--shadow-2);
  position: relative;
}

@media (hover: hover) {
  .book-card:hover {
    transform: translateY(-5px);
    box-shadow: var(--shadow-3);
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
  background-color: var(--main-solid);
  clip-path: polygon(0 0, 100% 0, 100% 100%, 50% 80%, 0 100%);
  filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.5));
  display: flex;
  justify-content: center;
  padding-top: 6px;
  z-index: 3;
  transition: height 0.2s ease;
}

/* O card sobe 5 px: com 53 px a ponta da fita desce 6 px na tela */
.book-card:hover .bookmark-ribbon {
  height: 53px;
}

.bookmark-ribbon i {
  color: var(--on-main);
  font-size: var(--fs-sm);
  font-weight: bold;
}

.select-check {
  position: absolute;
  top: 8px;
  left: 8px;
  z-index: 4;
  width: 28px;
  height: 28px;
  border-radius: var(--radius-md);
  border: 2px solid #ffffff;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  color: transparent;
  box-shadow: var(--shadow-2);
}

.select-check.checked {
  background: var(--main-solid);
  border-color: var(--main-solid);
  color: var(--on-main);
}

.select-check .pi {
  font-size: var(--fs-sm);
  font-weight: 700;
}

.book-card.is-selected {
  outline: var(--focus-ring);
  outline-offset: var(--focus-offset);
}

.status-badge {
  position: absolute;
  left: 8px;
  bottom: 8px;
  z-index: 3;
  padding: 0.2rem 0.55rem;
  border-radius: var(--radius-pill);
  font-size: var(--fs-xs);
  font-weight: 700;
  letter-spacing: 0.2px;
  line-height: 1.3;
  box-shadow: var(--shadow-2);
}

.status-badge.reading {
  background: var(--main-solid);
  color: var(--on-main);
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
  font-size: var(--fs-md);
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
  font-size: var(--fs-sm);
  color: var(--text-secondary);
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.book-series {
  display: block;
  font-size: var(--fs-xs);
  font-weight: 600;
  color: var(--main-color);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Tela de toque: área de toque de 44px sem mudar o desenho de 34px */
@media (pointer: coarse) {
  .quick-read {
    width: 34px;
    height: 46px;
    right: 8px;
  }
}
</style>
