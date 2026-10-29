<template>
  <li
    class="book-row"
    :class="{ 'is-selected': selectable && selected }"
  >
    <button
      type="button"
      class="row-main"
      :aria-pressed="selectable ? selected : undefined"
      @click="onRowClick"
    >
      <span
        v-if="selectable"
        class="row-check"
        :class="{ checked: selected }"
        aria-hidden="true"
      ><i class="pi pi-check"></i></span>
      <span class="thumb">
        <img
          v-if="!coverMissing"
          :key="bookCoverUrl"
          :src="bookCoverUrl"
          alt=""
          loading="lazy"
          decoding="async"
          @error="onCoverError"
        />
        <GeneratedCover
          v-else
          :title="book.title"
        />
      </span>

      <span class="main-text">
        <span class="title-line">
          <span class="title">{{ book.title }}</span>
          <!-- Status num selo, separado da data de leitura (coluna "Lido em") -->
          <span
            v-if="statusBadge"
            class="status-badge"
            :class="`status-${status}`"
          >{{ statusBadge }}</span>
        </span>
        <span class="authors">
          {{ book.authors }}<template v-if="book.series"><span class="series"> · {{ seriesText(book, t, locale) }}</span></template>
        </span>
      </span>

      <span class="col publisher">{{ book.publisher_name || '—' }}</span>
      <span class="col year">{{ pubYear || '—' }}</span>

      <span class="col rating">
        <template v-if="book.rating">
          <span class="sr-only">{{ t('library.row_rating', { n: book.rating }) }}</span>
          <i
            v-for="n in 5"
            :key="n"
            :class="n <= book.rating ? 'pi pi-star-fill' : 'pi pi-star'"
            aria-hidden="true"
          ></i>
        </template>
        <span
          v-else
          class="muted"
        >—</span>
      </span>

      <span
        class="col read"
        :class="{ muted: !readDateText }"
      >{{ readDateText || '—' }}</span>
    </button>

    <button
      v-if="!selectable"
      type="button"
      class="row-read"
      :class="{ 'is-read': isRead }"
      :aria-pressed="isRead"
      :aria-label="isRead ? t('book.quick_unread', { title: book.title }) : t('book.quick_read', { title: book.title })"
      v-tooltip.left="isRead ? t('book.quick_unread_short') : t('book.quick_read_short')"
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
      :modelValue="displayDialog"
      @update:modelValue="displayDialog = $event"
      @updated="payload => emit('updated', payload)"
      @deleted="id => emit('deleted', id)"
    />
  </li>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import BookDialog from './BookDialog.vue'
import GeneratedCover from './GeneratedCover.vue'
import { coverUrl, coverFallbackExhausted } from '../utils/covers.js'
import { fromApiDate } from '../utils/dates.js'
import { useReadToggle } from '../composables/useReadToggle.js'
import { statusOf } from '../utils/readingStatus.js'
import { seriesText } from '../utils/series.js'

/** Linha da biblioteca no modo lista: mais livros por tela, com os dados principais. */
const props = defineProps({
  book: { type: Object, required: true },
  selectable: { type: Boolean, default: false },
  selected: { type: Boolean, default: false },
  /** Quem usa abre o livro pela URL (?book=<id>, evento "open") em vez do diálogo daqui. */
  openInUrl: { type: Boolean, default: false }
})

const emit = defineEmits(['updated', 'deleted', 'toggle-select', 'open'])

function onRowClick() {
  if (props.selectable) emit('toggle-select', bookId.value)
  else if (props.openInUrl) emit('open', bookId.value)
  else displayDialog.value = true
}
const { t, locale } = useI18n()
const displayDialog = ref(false)

const bookId = computed(() => props.book.book_id ?? props.book.id)
const status = computed(() => statusOf(props.book))
const isRead = computed(() => status.value === 'read')
// cover_version null = sem capa: desenha direto, sem pedir a imagem
const bookCoverUrl = computed(() => coverUrl(bookId.value, props.book.cover_version))
const { saving, toggleRead } = useReadToggle(() => props.book, payload => emit('updated', payload))

const coverFailed = ref(false)
watch(bookCoverUrl, () => { coverFailed.value = false })
const coverMissing = computed(() => !bookCoverUrl.value || coverFailed.value)
function onCoverError(event) {
  if (coverFallbackExhausted(event)) coverFailed.value = true
}

const pubYear = computed(() => {
  const date = fromApiDate(props.book.publication_date)
  return date ? date.getFullYear() : null
})

const readDateLabel = computed(() => {
  const date = fromApiDate(props.book.read_date)
  if (!date) return t('library.read')
  return date.toLocaleDateString(locale.value === 'en' ? 'en-US' : 'pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
})

// Coluna "Lido em": só a data (lido sem data diz "Lido")
const readDateText = computed(() => (status.value === 'read' ? readDateLabel.value : ''))

// Selo ao lado do título: Lendo / Quero ler (lido já aparece pela data)
const statusBadge = computed(() => (status.value === 'reading' || status.value === 'want' ? t(`status.${status.value}`) : ''))

</script>

<style scoped>
.book-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.5rem;
  background: var(--bg-panel);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding-right: 0.75rem;
  transition: border-color 0.15s ease, background-color 0.15s ease;
}

.book-row.is-selected {
  border-color: var(--main-color);
  background: rgba(var(--main-color-rgb), 0.08);
}

/* No modo seleção a caixinha entra antes da capa. */
.row-main:has(.row-check) {
  grid-template-columns: 22px 40px minmax(0, 2.6fr) minmax(0, 1.3fr) 3.5rem 6rem 6rem;
}

.row-check {
  width: 22px;
  height: 22px;
  border-radius: 6px;
  border: 2px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: center;
  color: transparent;
}

.row-check.checked {
  background: var(--main-solid);
  border-color: var(--main-solid);
  color: var(--on-main);
}

.row-check .pi {
  font-size: var(--fs-xs);
  font-weight: 700;
}

.book-row:hover {
  border-color: rgba(var(--main-color-rgb), 0.45);
}

.row-main {
  display: grid;
  grid-template-columns: 40px minmax(0, 2.6fr) minmax(0, 1.3fr) 3.5rem 6rem 6rem;
  align-items: center;
  gap: 1rem;
  padding: 0.55rem 0 0.55rem 0.65rem;
  border: none;
  background: none;
  font: inherit;
  color: inherit;
  text-align: left;
  cursor: pointer;
  min-width: 0;
  border-radius: 12px 0 0 12px;
}

.row-main:focus-visible {
  outline: 2px solid var(--main-color);
  outline-offset: -2px;
}

.thumb {
  display: block;
  width: 40px;
  aspect-ratio: 2 / 3;
  border-radius: 4px;
  overflow: hidden;
  background: var(--bg-hover);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
  container-type: inline-size;
}

.thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

/* A capa desenhada não cabe texto em 40px: fica só a cor. */
.thumb :deep(.frame) {
  visibility: hidden;
}

.main-text {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  min-width: 0;
}

.title-line {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
}

.title {
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

.status-badge {
  flex-shrink: 0;
  padding: 0.05rem 0.5rem;
  border-radius: 999px;
  font-size: var(--fs-xs);
  font-weight: 600;
  line-height: 1.5;
  color: var(--text-primary);
  background: var(--bg-hover);
}

/* Texto na mistura de contraste (--tint-text) sobre o fundo tingido */
.status-badge.status-reading {
  color: color-mix(in srgb, var(--main-color) var(--tint-text), var(--text-primary));
  background: rgba(var(--main-color-rgb), 0.12);
}

.authors,
.col {
  font-size: var(--fs-sm);
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.authors .series {
  color: var(--main-color);
}

.year {
  font-variant-numeric: tabular-nums;
}

.rating {
  display: flex;
  gap: 2px;
  color: var(--yellow);
  font-size: var(--fs-xs);
}

.rating .muted {
  color: var(--text-secondary);
  font-size: var(--fs-sm);
}

.read {
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}

.read.muted {
  color: var(--text-secondary);
}

.row-read {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  border: 1px solid var(--border-color);
  background: transparent;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease, transform 0.15s ease;
}

.row-read .pi {
  font-size: var(--fs-sm);
  font-weight: 700;
}

.row-read:hover {
  border-color: var(--main-color);
  color: var(--main-color);
}

.row-read.is-read {
  background: var(--main-solid);
  border-color: transparent;
  color: var(--on-main);
}

.row-read:active {
  transform: scale(0.92);
}

.row-read:focus-visible {
  outline: 2px solid var(--main-color);
  outline-offset: 2px;
}

@media (max-width: 1100px) {
  .row-main {
    grid-template-columns: 40px minmax(0, 2.4fr) minmax(0, 1.2fr) 6rem 6rem;
  }

  .row-main:has(.row-check) {
    grid-template-columns: 22px 40px minmax(0, 2.4fr) minmax(0, 1.2fr) 6rem 6rem;
  }

  .year {
    display: none;
  }
}

@media (max-width: 760px) {
  .row-main {
    grid-template-columns: 40px minmax(0, 1fr) 5.75rem;
    gap: 0.75rem;
  }

  .row-main:has(.row-check) {
    grid-template-columns: 22px 40px minmax(0, 1fr) 5.75rem;
  }

  .publisher,
  .rating {
    display: none;
  }

  .read {
    text-align: right;
  }
}

@media (max-width: 420px) {
  .row-main {
    grid-template-columns: 36px minmax(0, 1fr);
  }

  .row-main:has(.row-check) {
    grid-template-columns: 22px 36px minmax(0, 1fr);
  }

  .thumb {
    width: 36px;
  }

  .read {
    display: none;
  }
}

/* Tela de toque: área de toque de 44px sem mudar o desenho de 34px */
@media (pointer: coarse) {
  .row-read {
    position: relative;
  }

  .row-read::after {
    content: '';
    position: absolute;
    inset: -5px;
    border-radius: 50%;
  }
}
</style>
