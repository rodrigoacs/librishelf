<template>
  <div class="book-view">
    <div class="details-header">
      <!-- Capa pequena ao lado do título (o diálogo só mostra no celular) -->
      <slot name="cover"></slot>
      <div class="title-area">
        <h1 class="book-title">{{ loading ? t('bookDialog.loading') : (book.title || t('bookDialog.noTitle')) }}
        </h1>
        <h2 class="book-author">{{ book.authors || (loading ? '' : t('bookDialog.unknownAuthor')) }}</h2>
        <template v-if="book.series && !loading">
          <router-link
            v-if="!isReadOnly"
            :to="{ name: 'library', query: { series: book.series, sort: 'series', order: 'asc' } }"
            class="series-line"
            :title="t('series.seeAll', { series: book.series })"
            @click="emit('navigate')"
          >
            <i
              class="pi pi-clone"
              aria-hidden="true"
            ></i>
            {{ seriesLabel }}
          </router-link>
          <span
            v-else
            class="series-line"
          >
            <i
              class="pi pi-clone"
              aria-hidden="true"
            ></i>
            {{ seriesLabel }}
          </span>
        </template>
        <template v-if="!loading && !loadFailed">
          <StarRating
            v-if="!isReadOnly"
            :model-value="book.rating"
            class="rating-row"
            size="lg"
            :disabled="ratingSaving"
            :label="t('rating.label')"
            @update:model-value="value => emit('rate', value)"
          />
          <StarRating
            v-else-if="book.rating"
            :model-value="book.rating"
            class="rating-row"
            size="lg"
            readonly
          />
        </template>
      </div>
    </div>

    <div
      v-if="!loading && !loadFailed"
      class="details-content"
    >
      <div
        v-if="!isReadOnly"
        class="read-state"
      >
        <div
          class="status-picker"
          role="group"
          :aria-label="t('status.label')"
        >
          <PillButton
            v-for="option in STATUS_OPTIONS"
            :key="option"
            :icon="STATUS_ICONS[option]"
            :label="t(`status.${option}`)"
            :active="currentStatus === option"
            :disabled="readSaving"
            @click="emit('change-status', option)"
          />
        </div>
        <p
          v-if="statusCaption"
          class="status-caption"
        >
          {{ statusCaption }}
          <button
            type="button"
            class="link-btn"
            :disabled="readSaving"
            @click="emit('change-status', currentStatus)"
          >{{ t('status.clear') }}</button>
        </p>
      </div>
      <div
        v-else-if="currentStatus !== 'none'"
        class="read-state"
      >
        <span class="read-pill">
          <i
            :class="STATUS_ICONS[currentStatus]"
            aria-hidden="true"
          ></i>
          {{ statusCaption }}
        </span>
      </div>

      <ul
        v-if="metaItems.length"
        class="meta-line"
      >
        <li
          v-for="item in metaItems"
          :key="item.key"
          :title="item.title"
        >{{ item.text }}</li>
      </ul>

      <p
        v-if="showIsbnWarning"
        id="book-isbn-warning"
        class="isbn-warning"
      >
        <i
          class="pi pi-exclamation-triangle"
          aria-hidden="true"
        ></i>
        {{ t('bookDialog.isbnInvalid') }}
      </p>

      <div
        v-if="tagList.length"
        class="tags-list"
        :aria-label="t('bookDialog.tags')"
      >
        <span
          v-for="(tag, index) in tagList"
          :key="`${tag}-${index}`"
          class="tag-chip"
          :style="{ '--tag-color': tagColor(tag) }"
        >{{ tag }}</span>
      </div>

      <section
        v-if="!isReadOnly && book.notes"
        class="notes-section"
        aria-labelledby="book-notes-title"
      >
        <h3 id="book-notes-title">
          <i
            class="pi pi-pencil"
            aria-hidden="true"
          ></i>
          {{ t('notes.title') }}
        </h3>
        <p class="notes-text">{{ book.notes }}</p>
      </section>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import StarRating from '../StarRating.vue'
import PillButton from '../form/PillButton.vue'
import { tagColor } from '../../utils/tagColors.js'
import { statusOf, STATUS_OPTIONS, STATUS_ICONS } from '../../utils/readingStatus.js'
import { seriesText } from '../../utils/series.js'

/**
 * O livro aberto, em modo leitura: título, status, editora/ano/ISBN, tags e
 * anotação. Quem salva status e nota é o BookDialog (eventos change-status e rate).
 */
const props = defineProps({
  book: { type: Object, required: true },
  isReadOnly: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
  loadFailed: { type: Boolean, default: false },
  readSaving: { type: Boolean, default: false },
  ratingSaving: { type: Boolean, default: false }
})

const emit = defineEmits(['change-status', 'rate', 'navigate'])
const { t, locale } = useI18n()

const tagList = computed(() => {
  if (!props.book.tags) return []
  return props.book.tags.split(',').map(tag => tag.trim()).filter(Boolean)
})

const showIsbnWarning = computed(() => !props.loading && !props.book.isbnValid)

function formatDate(value) {
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(locale.value)
}

// Editora · ano · ISBN numa linha só; a data completa fica no title.
const metaItems = computed(() => {
  const items = []
  if (props.book.publisher) items.push({ key: 'publisher', text: props.book.publisher })
  if (props.book.pubdate) {
    items.push({
      key: 'year',
      text: String(props.book.pubdate.getFullYear()),
      title: t('bookDialog.publishedOn', { date: formatDate(props.book.pubdate) })
    })
  }
  if (props.book.isbn) items.push({ key: 'isbn', text: `ISBN ${props.book.isbn}` })
  return items
})

const currentStatus = computed(() => statusOf(props.book))

const seriesLabel = computed(() => seriesText(props.book, t, locale.value))

const statusCaption = computed(() => {
  const status = currentStatus.value
  if (status === 'read') {
    const caption = t('bookDialog.readOn', { date: formatDate(props.book.read_date) })
    // No livro de outra pessoa, as releituras aparecem aqui (o dono vê no painel)
    return props.isReadOnly && props.book.read_count > 1
      ? `${caption} · ${t('history.readTimes', { n: props.book.read_count }, props.book.read_count)}`
      : caption
  }
  if (status === 'reading') {
    return props.book.started_at
      ? t('status.readingSince', { date: formatDate(props.book.started_at) })
      : t('status.reading')
  }
  if (status === 'want') return t('status.wantCaption')
  return ''
})
</script>

<style scoped>
.book-view {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.details-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
  /* Espaço para o X do canto não encostar no título. */
  padding-right: 2rem;
}

.title-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.book-title {
  font-family: var(--font-display);
  font-size: var(--fs-2xl);
  font-weight: 700;
  margin: 0;
  line-height: 1.2;
  color: var(--text-primary);
}

.book-author {
  font-size: var(--fs-lg);
  color: var(--text-secondary);
  margin: 0;
  font-weight: 400;
}

.rating-row {
  margin-top: 0.35rem;
}

/* Lido / marcar como lido */
.read-state {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.read-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.4rem 0.85rem;
  border-radius: 999px;
  background: rgba(var(--main-color-rgb), 0.12);
  color: var(--main-color);
  font-weight: 600;
  font-size: var(--fs-md);
}

.read-pill .pi {
  font-size: var(--fs-sm);
}

.read-state:has(.status-picker) {
  flex-direction: column;
  align-items: flex-start;
  gap: 0.5rem;
}

.status-picker {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.status-caption {
  margin: 0;
  font-size: var(--fs-sm);
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.link-btn {
  background: none;
  border: none;
  padding: 0.25rem;
  color: var(--text-secondary);
  font: inherit;
  font-size: var(--fs-sm);
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 3px;
}

.link-btn:hover {
  color: var(--text-primary);
}

.link-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

/* Editora · ano · ISBN */
.series-line {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  margin-top: 0.35rem;
  color: var(--main-color);
  font-size: var(--fs-md);
  font-weight: 600;
  text-decoration: none;
}

.series-line .pi {
  font-size: var(--fs-sm);
}

a.series-line:hover {
  text-decoration: underline;
}

.series-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 6.5rem;
  gap: 1rem;
}

.notes-input {
  resize: vertical;
  min-height: 5.5rem;
  font: inherit;
  line-height: 1.5;
}

.field-hint {
  font-size: var(--fs-xs);
  color: var(--text-secondary);
}

.notes-section {
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 0.85rem 1rem;
  background: rgba(var(--main-color-rgb), 0.05);
}

.notes-section h3 {
  margin: 0 0 0.4rem;
  font-size: var(--fs-sm);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.notes-text {
  margin: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  color: var(--text-primary);
  line-height: 1.55;
  max-height: 12rem;
  overflow-y: auto;
}

.meta-line {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  color: var(--text-secondary);
  font-size: var(--fs-md);
  line-height: 1.6;
}

.meta-line li+li::before {
  content: '·';
  margin: 0 0.5rem;
  color: var(--text-muted);
}

.isbn-warning {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin: -0.4rem 0 0;
  color: #f59e0b;
  font-size: var(--fs-sm);
}

.tags-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.tag-chip {
  font-size: var(--fs-sm);
  font-weight: 500;
  padding: 0.25rem 0.7rem;
  border-radius: 999px;
  color: color-mix(in srgb, var(--tag-color) var(--tint-text), var(--text-primary));
  background: color-mix(in srgb, var(--tag-color) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--tag-color) 35%, transparent);
}

.details-content {
  display: flex;
  flex-direction: column;
  gap: 1.1rem;
}

.title-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.book-title {
  font-family: var(--font-display);
  font-size: var(--fs-2xl);
  font-weight: 700;
  margin: 0;
  line-height: 1.2;
  color: var(--text-primary);
}

.book-author {
  font-size: var(--fs-lg);
  color: var(--text-secondary);
  margin: 0;
  font-weight: 400;
}

@media (max-width: 768px) {
  .book-title {
    font-size: var(--fs-xl);
  }

  .details-header {
    padding-right: 0;
  }
}

/* Celular: sem a faixa da capa em cima, o X fica ao lado do título */
@media (max-width: 600px) {
  .details-header {
    padding-right: 2.25rem;
    gap: 0.9rem;
  }

  .title-area {
    min-width: 0;
    gap: 0.35rem;
  }
}
</style>
