<template>
  <AppDialog
    v-model:visible="visible"
    :size="isEditing ? 'xl' : 'lg'"
    :dismissable="!isEditing"
    :close-on-escape="!isEditing"
    :before-close="confirmLeave"
    :sheet="false"
    page
    :back-closes="!inUrl"
    :animate-close="!inUrl"
    dialog-class="book-form-dialog"
    :aria-label="book.title || t('bookDialog.dialog_label')"
    @hide="closeDialog"
  >
    <div
      ref="shell"
      class="dialog-shell"
      :class="{ viewing: !isEditing }"
    >
      <BookPageBar
        v-if="phone"
        :back-label="backLabel"
        :show-actions="ownerReady && !isEditing"
        @back="requestClose"
        @edit="editMode"
        @more="event => moreMenu.toggle(event)"
      />
      <IconButton
        v-else
        class="close-btn"
        icon="pi pi-times"
        :label="t('common.close')"
        @click="requestClose"
      />
      <PopupMenu
        id="book-more-menu"
        ref="moreMenu"
        :items="moreItems"
      />

      <BookEditForm
        v-if="isEditing"
        ref="editForm"
        mode="edit"
        :book-id="bookId"
        :initial="book"
        :cover-version="currentCoverVersion"
        :confirm-message="t('bookDialog.confirmSave')"
        id-prefix="book-edit"
        @saved="onSaved"
        @cancel="isEditing = false"
      />

      <div
        v-else
        class="dialog-body"
      >
        <BookCoverPanel
          :url="displayCoverUrl"
          :missing="coverMissing"
          :title="book.title"
          :authors="book.authors"
          @error="onCoverError"
        />

        <div class="details-section">
          <BookView
            :book="book"
            :is-read-only="isReadOnly"
            :loading="loading"
            :load-failed="loadFailed"
            :read-saving="readSaving"
            :rating-saving="ratingSaving"
            :phone-layout="phone"
            @change-status="changeStatus"
            @rate="quickRate"
            @navigate="visible = false"
          >
            <template
              v-if="ownerReady && !phone"
              #actions
            >
              <BookActions
                @edit="editMode"
                @more="event => moreMenu.toggle(event)"
              />
            </template>
            <template #cover>
              <span
                class="mini-cover"
                aria-hidden="true"
                data-shared-cover
              >
                <img
                  v-if="!coverMissing"
                  :src="displayCoverUrl"
                  alt=""
                  @error="onCoverError"
                />
                <GeneratedCover
                  v-else
                  :title="book.title"
                  :author="book.authors"
                />
              </span>
            </template>
          </BookView>

          <ReadingPanel
            v-if="ownerReady"
            :book-id="bookId"
            :book="book"
            :phone-layout="phone"
            :status-saving="readSaving"
            @changed="onReadingChanged"
            @change-status="changeStatus"
          >
            <!-- Celular: a nota vem logo depois do cartão da leitura -->
            <template #after-card>
              <BookRateBlock
                :rating="book.rating"
                :saving="ratingSaving"
                @rate="quickRate"
              />
            </template>
          </ReadingPanel>

          <ReviewEditor
            v-if="ownerReady"
            ref="reviewEditor"
            :book-id="bookId"
            :notes="book.notes || ''"
          />

          <BookPublicReview
            v-if="isReadOnly && !loading && book.review"
            :review="book.review"
            :owner-username="ownerUsername"
          />

          <BookCollection
            v-if="ownerReady"
            :book-id="bookId"
            :book-title="book.title"
          />

          <BookCommunity
            v-if="ownerReady"
            :book-id="bookId"
            :book-title="book.title"
          />
        </div>
      </div>
    </div>
  </AppDialog>
  <AddToListDialog
    v-if="!isReadOnly && bookId"
    v-model:visible="addToListOpen"
    :book-id="bookId"
    :book-title="book.title"
  />
</template>

<script setup>
import { ref, watch, computed, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import AppDialog from './ui/AppDialog.vue'
import { useToast } from '../services/toast.js'
import { useConfirm, confirmDiscard } from '../services/confirm.js'
import { onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router'
import api from '../services/api.js'
import { coverUrl, coverFallbackExhausted } from '../utils/covers.js'
import GeneratedCover from './GeneratedCover.vue'
import BookActions from './book/BookActions.vue'
import BookCoverPanel from './book/BookCoverPanel.vue'
import BookPageBar from './book/BookPageBar.vue'
import BookPublicReview from './book/BookPublicReview.vue'
import BookRateBlock from './book/BookRateBlock.vue'
import { useBookReading } from './book/useBookReading.js'
import IconButton from './form/IconButton.vue'
import BookView from './book/BookView.vue'
import BookEditForm from './book/BookEditForm.vue'
import ReadingPanel from './book/ReadingPanel.vue'
import BookCommunity from './book/BookCommunity.vue'
import BookCollection from './book/BookCollection.vue'
import ReviewEditor from './review/ReviewEditor.vue'
import AddToListDialog from './list/AddToListDialog.vue'
import PopupMenu from './ui/PopupMenu.vue'
import { fromApiDate } from '../utils/dates.js'
import { setOverlayTitle } from '../services/pageTitle.js'
import { useIsPhone } from '../composables/useIsPhone.js'
import { useRoute } from 'vue-router'

/**
 * Livro aberto: visualização (BookView + BookCommunity) ou edição
 * (BookEditForm, o mesmo formulário do Novo livro).
 */
const { t } = useI18n()
const props = defineProps({
  modelValue: Boolean,
  bookId: { type: Number, default: null },
  isReadOnly: { type: Boolean, default: false },
  // Dono da biblioteca pública; obrigatório quando isReadOnly for true.
  ownerUsername: { type: String, default: '' },
  // cover_version de quem abriu (card da lista), usado até o livro carregar
  coverVersion: { type: [Number, null], default: undefined },
  // Aberto pela URL (?book=): o voltar do navegador já fecha pelo router
  inUrl: { type: Boolean, default: false },
  // Celular: título e autores do card que abriu, mostrados enquanto o livro
  // carrega (a capa que viaja chega na capa certa, não numa genérica)
  preview: { type: Object, default: null }
})

const emit = defineEmits(['update:modelValue', 'updated', 'deleted'])
const toast = useToast()
const confirm = useConfirm()
const phone = useIsPhone()
const route = useRoute()

// "‹ Biblioteca": o nome da tela de onde o livro foi aberto
const backLabel = computed(() => (route.meta.title ? t(`pageTitle.${route.meta.title}`, { name: route.params.username || '' }) : t('common.back')))

const visible = ref(props.modelValue)
const loading = ref(true)
const loadFailed = ref(false)
const isEditing = ref(false)
const addToListOpen = ref(false)

// Menu "⋯" ao lado de Editar: Listas e Excluir
const moreMenu = ref(null)
const moreItems = computed(() => [
  { label: t('lists.addToShort'), icon: 'pi pi-list', command: () => { addToListOpen.value = true } },
  { separator: true },
  { label: t('bookDialog.deleteShort'), icon: 'pi pi-trash', danger: true, command: deleteBook }
])

function emptyBook() {
  // authors: texto para exibir; authorNames: a lista que é editada e salva.
  return { title: '', authors: '', authorNames: [], publisher: '', tags: '', isbn: '', isbnValid: true, rating: null, read_date: null, reading_status: null, started_at: null, series: '', series_index: null, notes: '', pubdate: null, page_count: null, read_count: 0, current_page: null, progress_percent: null, review: null }
}

const book = ref(emptyBook())

// Status, painel de leituras e nota (sem o modo de edição)
const { readSaving, ratingSaving, changeStatus, quickRate, onReadingChanged, refreshReadingFields } =
  useBookReading({ book, bookId: () => props.bookId, phone, applyResponse, emit })

// Livro do dono carregado: Editar, ⋯ e os painéis de leitura, resenha e coleção
const ownerReady = computed(() => !props.isReadOnly && !loading.value && !loadFailed.value)

function previewBook() {
  const base = emptyBook()
  if (!phone.value || !props.preview) return base
  return { ...base, title: props.preview.title || '', authors: props.preview.authors || '' }
}

// Versão da capa: a do livro carregado; antes disso, a do card que abriu
const currentCoverVersion = computed(() =>
  book.value.cover_version !== undefined ? book.value.cover_version : props.coverVersion)
const displayCoverUrl = computed(() => coverUrl(props.bookId, currentCoverVersion.value))

// Sem imagem: capa desenhada e fundo na cor do livro, em vez do quadro cinza.
const coverFailed = ref(false)
watch(displayCoverUrl, () => { coverFailed.value = false })
const coverMissing = computed(() => !displayCoverUrl.value || coverFailed.value)

function onCoverError(event) {
  if (coverFallbackExhausted(event)) coverFailed.value = true
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
        toast.add({ severity: 'success', detail: t('bookDialog.bookDeleted'), life: 3000 })
      } catch (error) {
        toast.add({ severity: 'error', detail: error.message || t('bookDialog.deleteFailed'), life: 4000 })
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

/**
 * Alterações não salvas (edição do livro ou resenha sendo escrita): Esc,
 * Cancelar, X, clique fora e o voltar do navegador perguntam antes de
 * descartar. Resolve true quando pode fechar.
 */
const editForm = ref(null)
const reviewEditor = ref(null)

async function confirmLeave() {
  if (isEditing.value) {
    if (editForm.value && !(await editForm.value.confirmLeave())) return false
  } else if (reviewEditor.value?.isDirty()) {
    if (!(await confirmDiscard(t))) return false
  }
  // Já confirmado: não pergunta de novo quando a URL mudar ao fechar
  isEditing.value = false
  reviewEditor.value?.discard()
  return true
}

async function requestClose() {
  if (await confirmLeave()) visible.value = false
}

async function leaveEditing() {
  if (editForm.value && !(await editForm.value.confirmLeave())) return
  isEditing.value = false
}

// Voltar do navegador (fecha o livro ou sai da tela) com algo mudado
const routeGuard = () => (visible.value ? confirmLeave() : true)
onBeforeRouteLeave(routeGuard)
onBeforeRouteUpdate(routeGuard)

function onSaved({ book: saved, coverChanged }) {
  applyResponse(saved)
  isEditing.value = false
  refreshReadingFields()
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
    pubdate: fromApiDate(data.publication_date),
    page_count: data.page_count ?? null,
    read_count: data.read_count ?? (data.read_date ? 1 : 0),
    current_page: data.current_page ?? null,
    progress_percent: data.progress_percent ?? null,
    // Só na biblioteca pública de outra pessoa (a do dono carrega no ReviewEditor)
    review: data.review ?? null,
    cover_version: data.cover_version
  }
}

async function loadBookData() {
  if (!props.bookId) return

  loading.value = true
  loadFailed.value = false
  if (!book.value.title) book.value = previewBook()

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
    toast.add({ severity: 'warn', detail: t('bookDialog.couldNotLoad'), life: 3000 })
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

/**
 * Atalhos com o livro aberto: E edita; Esc na edição volta para a
 * visualização (fora dela, o próprio <dialog> fecha). Só vale se este for o
 * diálogo de cima (uma confirmação aberta por cima tem a vez) e não se a
 * pessoa estiver digitando.
 */
const shell = ref(null)

function isTyping(target) {
  return Boolean(target?.closest?.('input, textarea, select, [contenteditable=""], [contenteditable="true"]'))
}

function isTopDialog() {
  const open = document.querySelectorAll('dialog[open]')
  return open.length > 0 && open[open.length - 1] === shell.value?.closest('dialog')
}

function onKeydown(event) {
  if (!visible.value || event.defaultPrevented || !isTopDialog()) return
  if (event.ctrlKey || event.metaKey || event.altKey) return

  // Esc com uma lista aberta (seletor, menu) fecha só a lista
  if (event.key === 'Escape' && isEditing.value && !document.querySelector('[popover="auto"]:popover-open')) {
    event.preventDefault()
    leaveEditing()
    return
  }

  if ((event.key === 'e' || event.key === 'E') && !isEditing.value && !props.isReadOnly && !isTyping(event.target)) {
    event.preventDefault()
    editMode()
  }
}

onMounted(() => {
  if (visible.value) loadBookData()
  window.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  setOverlayTitle('')
  window.removeEventListener('keydown', onKeydown)
})
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

.details-section {
  flex: 1.5;
  padding: 2.5rem;
  background-color: var(--bg-panel);
  color: var(--text-primary);
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
  overflow-y: auto;
  max-height: inherit;
}

.mini-cover {
  display: none;
}

@media (max-width: 1023.98px) {
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

  .details-section {
    flex: 1;
    min-height: 0;
    max-height: none;
    padding: var(--space-5);
    gap: var(--space-5);
  }
}

/* Celular: o livro abre em tela cheia (AppDialog page), com "‹ Biblioteca"
   e Editar/⋯ numa barra no topo; capa pequena ao lado do título (é ela que
   viaja do card, data-shared-cover) e o resto rola embaixo. */
@media (max-width: 639.98px) {
  .dialog-shell {
    height: 100dvh;
    max-height: 100dvh;
  }

  .dialog-body {
    flex: 1;
    min-height: 0;
  }

  .details-section {
    padding: var(--space-2) var(--space-4) calc(var(--space-7) + var(--safe-bottom, 0px));
    gap: var(--space-5);
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  .mini-cover {
    display: block;
    flex: none;
    width: 104px;
    aspect-ratio: 2 / 3;
    border-radius: var(--radius-sm);
    overflow: hidden;
    background: var(--bg-hover);
    box-shadow: var(--shadow-2);
  }

  .mini-cover img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}
</style>
