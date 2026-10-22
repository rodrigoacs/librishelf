<template>
  <AppDialog
    v-model:visible="visible"
    :size="isEditing ? 'xl' : 'lg'"
    :dismissable="!isEditing"
    dialog-class="book-form-dialog"
    :aria-label="book.title || t('bookDialog.dialog_label')"
    @hide="closeDialog"
  >
    <div
      class="dialog-shell"
      :class="{ viewing: !isEditing }"
    >
      <IconButton
        class="close-btn"
        icon="pi pi-times"
        :label="t('common.close')"
        @click="visible = false"
      />

      <BookEditForm
        v-if="isEditing"
        mode="edit"
        :book-id="bookId"
        :initial="book"
        :cover-version="coverVersion"
        :confirm-message="t('bookDialog.confirmSave')"
        id-prefix="book-edit"
        @saved="onSaved"
        @cancel="isEditing = false"
      />

      <div
        v-else
        class="dialog-body"
      >
      <div
        class="cover-section"
        :style="coverMissing ? { '--cover-color': colorFor(book.title || book.authors) } : undefined"
        :class="{ 'no-cover': coverMissing }"
      >
        <img
          v-if="!coverMissing"
          :src="displayCoverUrl"
          class="blur-bg"
          alt=""
          aria-hidden="true"
        />
        <div class="image-container">
          <div class="cover-wrapper">
            <img
              v-if="!coverMissing"
              :key="displayCoverUrl"
              :src="displayCoverUrl"
              :alt="t('bookDialog.bookCover')"
              class="main-cover"
              @error="onCoverError"
            />
            <GeneratedCover
              v-else
              class="main-cover"
              :title="book.title"
              :author="book.authors"
            />
          </div>
        </div>
      </div>

        <div class="details-section">
          <BookView
            :book="book"
            :is-read-only="isReadOnly"
            :loading="loading"
            :load-failed="loadFailed"
            :read-saving="readSaving"
            :rating-saving="ratingSaving"
            @change-status="changeStatus"
            @rate="quickRate"
            @navigate="visible = false"
          />

          <BookCommunity
            v-if="!isReadOnly && !loading && !loadFailed"
            :book-id="bookId"
          />

          <!-- Ações do dono, longe do X de fechar e com nome escrito -->
          <div
            v-if="!isReadOnly && !loading && !loadFailed"
            class="dialog-footer"
          >
            <AppButton
              :label="t('bookDialog.deleteShort')"
              icon="pi pi-trash"
              class="btn-text btn-danger btn-sm"
              @click="deleteBook"
            />
            <AppButton
              :label="t('bookDialog.editShort')"
              icon="pi pi-pencil"
              class="btn-outlined btn-secondary btn-sm footer-edit"
              @click="editMode"
            />
          </div>
        </div>
      </div>
    </div>
  </AppDialog>
</template>

<script setup>
import { ref, watch, computed, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import AppDialog from './ui/AppDialog.vue'
import AppButton from './ui/AppButton.vue'
import { useToast } from '../services/toast.js'
import { useConfirm } from '../services/confirm.js'
import api from '../services/api.js'
import { colorFor } from '../utils/tagColors.js'
import { coverUrl, coverFallbackExhausted } from '../utils/covers.js'
import GeneratedCover from './GeneratedCover.vue'
import IconButton from './form/IconButton.vue'
import BookView from './book/BookView.vue'
import BookEditForm from './book/BookEditForm.vue'
import BookCommunity from './book/BookCommunity.vue'
import { fromApiDate, toApiDate } from '../utils/dates.js'
import { statusOf } from '../utils/readingStatus.js'
import { setOverlayTitle } from '../services/pageTitle.js'

/**
 * Livro aberto: visualização (BookView + BookCommunity) ou edição
 * (BookEditForm, o mesmo formulário do Novo livro).
 */
const { t } = useI18n()
const props = defineProps({
  modelValue: Boolean,
  bookId: Number,
  isReadOnly: { type: Boolean, default: false },
  // Dono da biblioteca pública; obrigatório quando isReadOnly for true.
  ownerUsername: { type: String, default: '' }
})

const emit = defineEmits(['update:modelValue', 'updated', 'deleted'])
const toast = useToast()
const confirm = useConfirm()

const visible = ref(props.modelValue)
const loading = ref(true)
const loadFailed = ref(false)
const isEditing = ref(false)
const coverVersion = ref(0)
const ratingSaving = ref(false)
const readSaving = ref(false)

function emptyBook() {
  // authors: texto para exibir; authorNames: a lista que é editada e salva.
  return { title: '', authors: '', authorNames: [], publisher: '', tags: '', isbn: '', isbnValid: true, rating: null, read_date: null, reading_status: null, started_at: null, series: '', series_index: null, notes: '', pubdate: null }
}

const book = ref(emptyBook())

const displayCoverUrl = computed(() => coverUrl(props.bookId, coverVersion.value))

// Sem imagem: capa desenhada e fundo na cor do livro, em vez do quadro cinza.
const coverMissing = ref(false)
watch(displayCoverUrl, () => { coverMissing.value = false })

function onCoverError(event) {
  if (coverFallbackExhausted(event)) coverMissing.value = true
}

/**
 * Quero ler / Lendo / Lido. Clicar no status que já está marcado tira o status
 * (o livro volta a só estar na estante). Datas vão no fuso da pessoa.
 */
async function changeStatus(option) {
  const next = statusOf(book.value) === option ? 'none' : option
  readSaving.value = true
  try {
    const today = toApiDate(new Date())
    const result = await api.setReadingStatus(props.bookId, next, next === 'read' || next === 'reading' ? today : undefined)
    book.value.read_date = fromApiDate(result.readDate)
    book.value.started_at = fromApiDate(result.startedAt)
    book.value.reading_status = result.status === 'want' || result.status === 'reading' ? result.status : null
    emit('updated', {
      book: { book_id: props.bookId, read_date: result.readDate, reading_status: book.value.reading_status, started_at: result.startedAt },
      coverChanged: false
    })
  } catch (error) {
    toast.add({ severity: 'error', summary: t('bookDialog.error'), detail: error.message || t('bookDialog.updateFailed'), life: 4000 })
  } finally {
    readSaving.value = false
  }
}

// Nota direto da visualização, sem entrar no modo de edição.
async function quickRate(value) {
  const previous = book.value.rating
  book.value.rating = value
  ratingSaving.value = true
  try {
    const result = await api.setRating(props.bookId, value)
    book.value.rating = result?.rating ?? value
    emit('updated', { book: { book_id: props.bookId, rating: book.value.rating }, coverChanged: false })
  } catch (error) {
    book.value.rating = previous
    toast.add({ severity: 'error', summary: t('bookDialog.error'), detail: error.message || t('bookDialog.updateFailed'), life: 4000 })
  } finally {
    ratingSaving.value = false
  }
}

function deleteBook() {
  confirm.require({
    message: t('bookDialog.confirmDelete'),
    header: t('bookDialog.confirm'),
    icon: 'pi pi-exclamation-triangle',
    acceptClass: 'btn-rounded btn-danger',
    rejectClass: 'btn-text btn-secondary',
    acceptLabel: t('bookDialog.delete'),
    rejectLabel: t('bookDialog.cancel'),
    accept: async () => {
      try {
        await api.deleteBook(props.bookId)
        visible.value = false
        emit('deleted', props.bookId)
        toast.add({ severity: 'success', summary: t('bookDialog.deleted'), detail: t('bookDialog.bookDeleted'), life: 3000 })
      } catch (error) {
        toast.add({ severity: 'error', summary: t('bookDialog.errorDeleted'), detail: error.message || t('bookDialog.deleteFailed'), life: 4000 })
      }
    }
  })
}

function editMode() {
  if (loading.value || loadFailed.value) return
  isEditing.value = true
}

function closeDialog() {
  isEditing.value = false
  visible.value = false
}

function onSaved({ book: saved, coverChanged }) {
  if (coverChanged) coverVersion.value = Date.now()
  applyResponse(saved)
  isEditing.value = false
  emit('updated', { book: { ...saved, book_id: props.bookId }, coverChanged })
}

function applyResponse(data) {
  if (!data) return
  book.value = {
    title: data.title || '',
    authors: data.authors || '',
    authorNames: Array.isArray(data.author_names) ? data.author_names : (data.authors ? [data.authors] : []),
    isbn: data.isbn || '',
    isbnValid: data.isbn_valid !== false,
    rating: data.rating ?? null,
    publisher: data.publisher_name || data.publisher || '',
    tags: data.tags || '',
    read_date: fromApiDate(data.read_date),
    reading_status: data.reading_status ?? null,
    series: data.series || '',
    series_index: data.series_index ?? null,
    notes: data.notes || '',
    started_at: fromApiDate(data.started_at),
    pubdate: fromApiDate(data.publication_date)
  }
}

async function loadBookData() {
  if (!props.bookId) return

  loading.value = true
  loadFailed.value = false

  try {
    const response = props.isReadOnly
      ? await api.getPublicBook(props.ownerUsername, props.bookId)
      : await api.getBookById(props.bookId)

    applyResponse(response)
  } catch {
    // Sem os dados reais a edição fica bloqueada: antes dava para salvar
    // "Erro ao carregar" por cima do título verdadeiro.
    loadFailed.value = true
    book.value = emptyBook()
    toast.add({ severity: 'warn', summary: t('bookDialog.attention'), detail: t('bookDialog.couldNotLoad'), life: 3000 })
  } finally {
    loading.value = false
  }
}

watch(() => props.modelValue, (val) => { visible.value = val })
watch(visible, (val) => emit('update:modelValue', val))

// Título da aba com o livro aberto: "Duna · Biblioteca · Librishelf"
watch([visible, () => book.value.title], ([open, title]) => {
  setOverlayTitle(open && title ? title : '')
})

onMounted(() => {
  if (visible.value) loadBookData()
})

onBeforeUnmount(() => setOverlayTitle(''))
</script>

<style scoped>
.dialog-shell {
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 0;
  max-height: min(92vh, 860px);
}

.close-btn {
  position: absolute;
  top: 1rem;
  right: 1rem;
  z-index: 10;
}

.dialog-body {
  display: flex;
  flex-direction: row;
  min-height: 440px;
  max-height: inherit;
  position: relative;
  width: 100%;
  background-color: var(--bg-panel);
}

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
  padding: 2rem;
  display: flex;
  justify-content: center;
  width: 100%;
}

.cover-wrapper {
  position: relative;
  width: 100%;
  max-width: 250px;
  aspect-ratio: 2/3;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.8);
}

.main-cover {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: filter 0.3s ease;
}

.details-section {
  flex: 1.5;
  padding: 2.5rem;
  background-color: var(--bg-panel);
  color: var(--text-primary);
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  overflow-y: auto;
  max-height: inherit;
}

.dialog-footer {
  margin-top: auto;
  padding-top: 1rem;
  border-top: 1px solid var(--border-color);
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
}

.footer-edit.btn {
  border-radius: 8px;
}

@media (max-width: 768px) {
  /* Celular/tablet em pé: capa compacta em cima e só os detalhes rolam,
     para o botão de fechar e o título ficarem sempre à vista. */
  .dialog-shell {
    max-height: calc(100dvh - 2rem);
  }

  .close-btn {
    top: 0.75rem;
    right: 0.75rem;
  }

  /* Por cima da capa */
  .viewing .close-btn {
    background: rgba(0, 0, 0, 0.4);
    color: #ffffff;
  }

  .dialog-body {
    flex-direction: column;
    min-height: 0;
  }

  .cover-section {
    flex: none;
    max-width: 100%;
    height: 190px;
    border-bottom: 1px solid var(--border-color);
  }

  .details-section {
    flex: 1;
    min-height: 0;
    max-height: none;
    padding: 1.25rem;
    gap: 1.25rem;
  }

  /* Capa inteira e pequena, em vez de um recorte gigante. */
  .image-container {
    padding: 1rem;
    height: 100%;
    box-sizing: border-box;
  }

  .cover-wrapper {
    width: auto;
    height: 100%;
    max-width: none;
  }
}
</style>
