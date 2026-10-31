<template>
  <section
    class="reading-panel"
    aria-labelledby="reading-panel-title"
  >
    <h3
      id="reading-panel-title"
      class="sr-only"
    >{{ t('history.panelTitle') }}</h3>

    <!-- Celular: cartão da leitura (progresso + "Marcar como lido") no lugar
         da barra e do "Ler de novo"; a nota vem logo depois (slot) -->
    <template v-if="phoneLayout">
      <ReadingCard
        :book-id="bookId"
        :book="book"
        :saving="statusSaving"
        :again-busy="busy === 'again'"
        @change-status="option => emit('change-status', option)"
        @progress-saved="onProgressSaved"
        @read-again="readAgain"
      />
      <slot name="after-card"></slot>
    </template>

    <ReadingProgress
      v-if="status === 'reading' && !phoneLayout"
      :book-id="bookId"
      :title="book.title"
      :page-count="book.page_count ?? null"
      :current-page="book.current_page ?? null"
      :progress-percent="book.progress_percent ?? null"
      @saved="onProgressSaved"
    />

    <div
      v-if="status === 'read' && !phoneLayout"
      class="again"
    >
      <AppButton
        :label="t('history.readAgain')"
        icon="pi pi-replay"
        class="btn-outlined btn-sm"
        :loading="busy === 'again'"
        @click="readAgain"
      />
      <span
        v-if="readCount > 1"
        class="count-note"
      >{{ t('history.readTimes', { n: readCount }, readCount) }}</span>
    </div>

    <details
      class="history"
      :open="historyOpen"
      @toggle="onToggle"
    >
      <summary>
        <i
          class="pi pi-history"
          aria-hidden="true"
        ></i>
        {{ t('history.title') }}
        <span
          v-if="totalCount"
          class="badge"
        >{{ totalCount }}</span>
        <i
          class="pi pi-chevron-down chevron"
          aria-hidden="true"
        ></i>
      </summary>

      <div class="history-body">
        <p
          v-if="loadingList"
          class="muted"
        >{{ t('history.loading') }}</p>
        <p
          v-else-if="loadError"
          class="muted error"
        >{{ loadError }}</p>

        <ol
          v-else-if="readings.length"
          class="readings"
        >
          <li
            v-for="item in readings"
            :key="item.id"
            class="reading"
          >
            <template v-if="editingId !== item.id">
              <div class="reading-main">
                <span class="nth">
                  {{ t('history.nth', { n: ordinal(item) }) }}
                  <span
                    v-if="duration(item)"
                    class="duration"
                  >· {{ t('history.days', { n: duration(item) }, duration(item)) }}</span>
                </span>
                <span class="dates">{{ describe(item) }}</span>
                <StarRating
                  v-if="item.finishedOn"
                  :model-value="item.rating"
                  size="sm"
                  :label="t('history.ratingFor', { n: ordinal(item) })"
                  :disabled="busy === item.id"
                  @update:model-value="value => saveRating(item, value)"
                />
              </div>
              <div class="reading-actions">
                <IconButton
                  icon="pi pi-pencil"
                  :label="t('history.edit', { n: ordinal(item) })"
                  title
                  @click="startEdit(item)"
                />
                <IconButton
                  icon="pi pi-trash"
                  :label="t('history.delete', { n: ordinal(item) })"
                  title
                  @click="askDelete(item)"
                />
              </div>
            </template>

            <ReadingEditor
              v-else
              :id-prefix="`reading-${item.id}`"
              :reading="item"
              :saving="busy === item.id"
              :error="formError"
              @save="fields => saveEdit(item, fields)"
              @cancel="cancelEdit"
            />
          </li>
        </ol>
        <p
          v-else
          class="muted"
        >{{ t('history.empty') }}</p>

        <ReadingEditor
          v-if="adding"
          id-prefix="reading-new"
          :saving="busy === 'add'"
          :error="formError"
          require-finish
          @save="saveNew"
          @cancel="cancelEdit"
        />
        <button
          v-else-if="!loadingList && !loadError"
          type="button"
          class="add-btn"
          @click="startAdd"
        >
          <i
            class="pi pi-plus"
            aria-hidden="true"
          ></i>
          {{ t('history.addPast') }}
        </button>
      </div>
    </details>
  </section>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import AppButton from '../ui/AppButton.vue'
import IconButton from '../form/IconButton.vue'
import StarRating from '../StarRating.vue'
import ReadingProgress from './ReadingProgress.vue'
import ReadingCard from './ReadingCard.vue'
import ReadingEditor from './ReadingEditor.vue'
import api from '../../services/api.js'
import { useToast } from '../../services/toast.js'
import { useConfirm } from '../../services/confirm.js'
import { fromApiDate, toApiDate } from '../../utils/dates.js'
import { statusOf } from '../../utils/readingStatus.js'

/**
 * Leituras do livro aberto (dono): progresso da leitura em andamento, "Ler
 * de novo" e o histórico (cada leitura com datas e nota opcional, editável).
 * Emite "changed" com o que mudou no livro (read_date, started_at,
 * reading_status, read_count, current_page, progress_percent, page_count).
 */
const props = defineProps({
  bookId: { type: Number, required: true },
  book: { type: Object, required: true },
  // Celular: cartão da leitura (ReadingCard) com "Marcar como lido"
  phoneLayout: { type: Boolean, default: false },
  statusSaving: { type: Boolean, default: false }
})
const emit = defineEmits(['changed', 'change-status'])
const { t, locale } = useI18n()
const toast = useToast()
const confirm = useConfirm()

const status = computed(() => statusOf(props.book))
const readCount = computed(() => props.book.read_count ?? (props.book.read_date ? 1 : 0))
const totalCount = computed(() => (readings.value.length || readCount.value + (status.value === 'reading' ? 1 : 0)))

const readings = ref([])
const loaded = ref(false)
const loadingList = ref(false)
const loadError = ref('')
const historyOpen = ref(false)
const editingId = ref(null)
const adding = ref(false)
const formError = ref('')
const busy = ref(null)

async function load() {
  loadingList.value = true
  loadError.value = ''
  try {
    readings.value = (await api.getReadings(props.bookId)).readings
    loaded.value = true
  } catch (error) {
    loadError.value = error.message || t('history.loadError')
  } finally {
    loadingList.value = false
  }
}

function onToggle(event) {
  historyOpen.value = event.target.open
  if (historyOpen.value && !loaded.value) load()
}

// Status mudou por fora (pílulas, formulário): a lista recarrega na próxima abertura
watch(() => [props.book.read_date, props.book.started_at, props.book.reading_status], () => {
  loaded.value = false
  if (historyOpen.value) load()
})

// Numeração cronológica: a mais antiga é a 1ª
const chronological = computed(() => [...readings.value].sort((a, b) => {
  const ka = a.finishedOn || '9999-99-99'
  const kb = b.finishedOn || '9999-99-99'
  return ka === kb ? a.id - b.id : (ka < kb ? -1 : 1)
}))
const ordinal = item => chronological.value.indexOf(item) + 1

function formatDate(value) {
  const date = fromApiDate(value)
  return date ? date.toLocaleDateString(locale.value) : ''
}

// Dias de leitura (início e fim contam)
function duration(item) {
  if (!item.startedOn || !item.finishedOn) return 0
  return Math.round((fromApiDate(item.finishedOn) - fromApiDate(item.startedOn)) / 86400000) + 1
}

function describe(item) {
  if (!item.finishedOn) {
    return item.startedOn ? t('history.inProgressSince', { date: formatDate(item.startedOn) }) : t('history.inProgress')
  }
  if (item.startedOn) return t('history.fromTo', { from: formatDate(item.startedOn), to: formatDate(item.finishedOn) })
  return t('history.finishedOn', { date: formatDate(item.finishedOn) })
}

// Depois de qualquer mudança: estado do livro + contagem
function applyBookState(state) {
  if (!state) return
  const finished = readings.value.filter(r => r.finishedOn).length
  emit('changed', {
    read_date: state.readDate,
    started_at: state.startedAt,
    reading_status: state.status === 'want' || state.status === 'reading' ? state.status : null,
    read_count: loaded.value ? finished : undefined
  })
}

function onProgressSaved({ reading, pageCount }) {
  emit('changed', {
    current_page: reading.currentPage,
    progress_percent: reading.progressPercent,
    page_count: pageCount
  })
}

async function readAgain() {
  busy.value = 'again'
  try {
    const result = await api.setReadingStatus(props.bookId, 'reading', toApiDate(new Date()))
    emit('changed', {
      read_date: result.readDate,
      started_at: result.startedAt,
      reading_status: 'reading',
      current_page: null,
      progress_percent: null
    })
    toast.add({ severity: 'success', detail: t('history.readAgainToast'), life: 3000 })
  } catch (error) {
    toast.add({ severity: 'error', detail: error.message, life: 4000 })
  } finally {
    busy.value = null
  }
}

function startEdit(item) {
  adding.value = false
  formError.value = ''
  editingId.value = item.id
}

function startAdd() {
  editingId.value = null
  formError.value = ''
  adding.value = true
}

function cancelEdit() {
  editingId.value = null
  adding.value = false
  formError.value = ''
}

async function saveRating(item, value) {
  busy.value = item.id
  const previous = item.rating
  item.rating = value
  try {
    await api.updateReading(props.bookId, item.id, { rating: value })
  } catch (error) {
    item.rating = previous
    toast.add({ severity: 'error', detail: error.message, life: 4000 })
  } finally {
    busy.value = null
  }
}

async function saveEdit(item, fields) {
  busy.value = item.id
  formError.value = ''
  try {
    const result = await api.updateReading(props.bookId, item.id, fields)
    Object.assign(item, result.reading)
    editingId.value = null
    applyBookState(result.book)
  } catch (error) {
    formError.value = error.message
  } finally {
    busy.value = null
  }
}

async function saveNew(fields) {
  busy.value = 'add'
  formError.value = ''
  try {
    const result = await api.addReading(props.bookId, fields)
    readings.value = [...readings.value, result.reading]
    adding.value = false
    applyBookState(result.book)
    // Ordem certa (mais recente primeiro) vem do servidor
    await load()
    applyBookState(result.book)
  } catch (error) {
    formError.value = error.message
  } finally {
    busy.value = null
  }
}

function askDelete(item) {
  confirm.require({
    header: t('history.deleteTitle', { n: ordinal(item) }),
    message: t('history.deleteMessage', { what: describe(item) }),
    icon: 'pi pi-exclamation-triangle',
    acceptClass: 'btn-danger',
    rejectClass: 'btn-text btn-secondary',
    acceptLabel: t('history.deleteConfirm'),
    rejectLabel: t('common.cancel'),
    accept: () => remove(item)
  })
}

async function remove(item) {
  busy.value = item.id
  try {
    const result = await api.deleteReading(props.bookId, item.id)
    readings.value = readings.value.filter(r => r.id !== item.id)
    applyBookState(result.book)
    if (!item.finishedOn) emit('changed', { current_page: null, progress_percent: null })
  } catch (error) {
    toast.add({ severity: 'error', detail: error.message, life: 4000 })
  } finally {
    busy.value = null
  }
}
</script>

<style scoped>
.reading-panel {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}

.again {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.count-note {
  font-size: var(--fs-sm);
  color: var(--text-secondary);
}

.history {
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
}

.history summary {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  cursor: pointer;
  list-style: none;
  font-size: var(--fs-sm);
  font-weight: 700;
  color: var(--text-primary);
  border-radius: var(--radius-md);
}

.history summary::-webkit-details-marker {
  display: none;
}

.history summary:focus-visible {
  outline: var(--focus-ring);
  outline-offset: -2px;
}

.history summary .pi-history {
  color: var(--text-secondary);
}

.badge {
  min-width: 1.4rem;
  padding: 0 0.4rem;
  border-radius: var(--radius-pill);
  background: var(--bg-input);
  color: var(--text-secondary);
  font-size: var(--fs-xs);
  text-align: center;
  line-height: 1.4rem;
}

.chevron {
  margin-left: auto;
  font-size: var(--fs-xs);
  color: var(--text-muted);
  transition: transform 0.15s ease;
}

.history[open] .chevron {
  transform: rotate(180deg);
}

.history-body {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0 1rem 0.85rem;
}

.readings {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}

.reading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.6rem 0;
  border-top: 1px solid var(--border-color);
}

.reading:first-child {
  border-top: none;
}

.reading-main {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  min-width: 0;
}

.nth {
  font-size: var(--fs-xs);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  color: var(--text-muted);
}

.duration {
  text-transform: none;
  letter-spacing: 0;
  font-weight: 500;
}

.dates {
  font-size: var(--fs-sm);
  color: var(--text-primary);
}

.reading-actions {
  display: flex;
  flex-shrink: 0;
  gap: 0.15rem;
}

.muted {
  margin: 0;
  font-size: var(--fs-sm);
  color: var(--text-secondary);
}

.muted.error {
  color: var(--red);
}

.add-btn {
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.35rem 0.1rem;
  border: none;
  background: none;
  color: var(--main-color);
  font: inherit;
  font-size: var(--fs-sm);
  font-weight: 600;
  cursor: pointer;
}

.add-btn .pi {
  font-size: var(--fs-xs);
}

.add-btn:hover {
  text-decoration: underline;
  text-underline-offset: 3px;
}

.add-btn:focus-visible {
  outline: var(--focus-ring);
  outline-offset: var(--focus-offset);
  border-radius: var(--radius-sm);
}

@media (pointer: coarse) {
  .add-btn {
    min-height: 44px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .chevron {
    transition: none;
  }
}
</style>
