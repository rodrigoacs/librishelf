<template>
  <form
    class="book-form"
    novalidate
    :aria-labelledby="`${idPrefix}-heading`"
    @submit.prevent="submit"
  >
    <header class="form-header">
      <h2 :id="`${idPrefix}-heading`">{{ isCreate ? (phone ? t('home.addBook') : t('bookForm.newTitle')) : t('bookForm.editTitle') }}</h2>
      <p v-if="isCreate">{{ t('bookForm.newSubtitle') }}</p>
    </header>

    <div class="form-scroll">
      <aside class="cover-column">
        <CoverDrop
          :id="`${idPrefix}-cover`"
          :image-url="coverPreview"
          :caption="coverCaption"
          :error="errors.cover"
          @select="onCoverSelect"
        />
      </aside>

      <div class="fields-column">
        <!-- Novo livro: achar os dados pelo ISBN (digitado ou lido pela câmera) ou pelo título -->
        <div
          v-if="isCreate"
          class="finder-tabs"
          role="group"
          :aria-label="t('bookSearch.modeLabel')"
        >
          <PillButton
            icon="pi pi-barcode"
            :label="t('bookSearch.byIsbn')"
            :active="findMode === 'isbn'"
            @click="setFindMode('isbn')"
          />
          <PillButton
            icon="pi pi-search"
            :label="t('bookSearch.byTitle')"
            :active="findMode === 'title'"
            @click="setFindMode('title')"
          />
        </div>

        <BookSearch
          v-if="isCreate && findMode === 'title'"
          ref="bookSearch"
          :id-prefix="idPrefix"
          :initial-query="form.title"
          @select="applySearchResult"
        />

        <div
          v-else
          class="isbn-row"
          :class="{ single: !isCreate || isbnFoundHere }"
        >
          <TextField
            :id="`${idPrefix}-isbn`"
            ref="isbnField"
            v-model="form.isbn"
            :label="t('bookForm.isbn')"
            inputmode="numeric"
            :error="errors.isbn"
            maxlength="32"
            :hint="isCreate ? lookupMessage : ''"
            hint-live
            :input-attrs="isCreate ? { onKeydown: onIsbnKeydown, enterkeyhint: 'search' } : {}"
          >
            <template
              v-if="isCreate && (canScan || isbnFoundHere)"
              #suffix
            >
              <!-- Celular: "✓ Encontrado" dentro do campo, como no trailer -->
              <span
                v-if="isbnFoundHere"
                class="isbn-found"
              >
                <i
                  class="pi pi-check"
                  aria-hidden="true"
                ></i>
                {{ t('isbn.foundShort') }}
              </span>
              <span
                v-if="canScan"
                class="scan-btn"
              >
                <IconButton
                  icon="pi pi-camera"
                  :label="t('scanner.open')"
                  title
                  @click="scannerOpen = true"
                />
              </span>
            </template>
          </TextField>
          <AppButton
            v-if="isCreate && !isbnFoundHere"
            type="button"
            :label="t('isbn.search')"
            icon="pi pi-search"
            class="btn-outlined isbn-btn"
            :loading="lookingUp"
            :disabled="!form.isbn.trim()"
            @click="lookupIsbn"
          />
        </div>

        <BarcodeScanner
          v-if="isCreate && canScan"
          v-model:visible="scannerOpen"
          @detected="onScanned"
        />

        <TextField
          :id="`${idPrefix}-title`"
          v-model="form.title"
          class="f-title"
          :label="t('bookForm.title')"
          :error="errors.title"
          maxlength="500"
          required
          large
        />

        <AuthorsInput
          v-model="form.authorNames"
          class="f-authors"
          :input-id="`${idPrefix}-authors`"
          :label="t('bookForm.authors')"
          :error="errors.authors"
          required
        />

        <BookAboutFields
          v-model:publisher="form.publisher"
          v-model:pubdate="form.pubdate"
          v-model:series="form.series"
          v-model:series-index="form.series_index"
          v-model:page-count="form.pageCount"
          v-model:tags="form.tags"
          :id-prefix="idPrefix"
          :errors="errors"
        />

        <BookReadingFields
          v-model:status="status"
          v-model:status-date="statusDate"
          v-model:rating="form.rating"
          v-model:notes="form.notes"
          :id-prefix="idPrefix"
          :errors="errors"
        />
      </div>
    </div>

    <footer class="form-footer">
      <AppButton
        type="button"
        :label="t('common.cancel')"
        class="btn-text btn-secondary"
        :disabled="saving"
        @click="requestCancel"
      />
      <AppButton
        type="submit"
        :label="isCreate ? t('bookForm.submitCreate') : t('bookForm.submitEdit')"
        :icon="isCreate ? 'pi pi-plus' : 'pi pi-check'"
        class="btn-primary"
        :loading="saving"
      />
    </footer>
  </form>
</template>

<script setup>
import { scrollBehavior } from '../../utils/motion.js'
import { computed, nextTick, reactive, ref, watch, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import AppButton from '../ui/AppButton.vue'
import { useIsPhone } from '../../composables/useIsPhone.js'
import { useBookLookup } from '../../composables/useBookLookup.js'
import { useToast } from '../../services/toast.js'
import { useConfirm, confirmDiscard } from '../../services/confirm.js'
import { formSnapshot, hasChanges } from '../../utils/formState.js'
import api from '../../services/api.js'
import AuthorsInput from '../AuthorsInput.vue'
import TextField from '../form/TextField.vue'
import PillButton from '../form/PillButton.vue'
import CoverDrop from '../form/CoverDrop.vue'
import IconButton from '../form/IconButton.vue'
import BookSearch from './BookSearch.vue'
import BarcodeScanner from './BarcodeScanner.vue'
import BookAboutFields from './BookAboutFields.vue'
import BookReadingFields from './BookReadingFields.vue'
import { toApiDate } from '../../utils/dates.js'
import { statusOf } from '../../utils/readingStatus.js'
import { validateImageFile, createPreviewHandle } from '../../utils/files.js'
import { coverUrl } from '../../utils/covers.js'
import { fieldErrorFromApi, FIELD_ORDER } from '../../utils/bookFormErrors.js'
import { blankBookForm, createBookData, updateBookPayload, validateBookForm } from '../../utils/bookForm.js'

/**
 * Formulário de livro, o mesmo no "Novo livro" e na edição.
 *   mode="create": POST /library (+ status de leitura, se escolhido)
 *   mode="edit":   PUT /library/:id (+ status e capa, se mudaram)
 * Emite 'saved' com o resultado e 'cancel'.
 *
 * Seções: busca por ISBN/título (aqui, porque no celular cada peça entra
 * numa posição da grade; lógica em composables/useBookLookup.js),
 * BookAboutFields ("Sobre o livro") e BookReadingFields ("Sua leitura").
 * Regras sem Vue (validação, corpo do envio) em utils/bookForm.js.
 */
const props = defineProps({
  mode: { type: String, default: 'create' },
  bookId: { type: Number, default: null },
  // Livro no formato do BookDialog (authorNames, read_date, pubdate…)
  initial: { type: Object, default: null },
  // Versão da capa atual (cache-buster), só na edição
  coverVersion: { type: [Number, null], default: undefined },
  idPrefix: { type: String, default: 'book-form' },
  // Pergunta antes de salvar (usado na edição)
  confirmMessage: { type: String, default: '' }
})

const emit = defineEmits(['saved', 'cancel'])
const { t } = useI18n()
const toast = useToast()
const confirm = useConfirm()

const isCreate = computed(() => props.mode === 'create')

const form = reactive(blankBookForm())
const status = ref('none')
const statusDate = ref(null)
const initialStatus = ref('none')
const initialStatusDate = ref(null)
const errors = reactive({})
const saving = ref(false)
const isbnField = ref(null)
const bookSearch = ref(null)
const phone = useIsPhone()

function load() {
  const source = props.initial || {}
  Object.assign(form, blankBookForm(), {
    title: source.title || '',
    authorNames: [...(source.authorNames || [])],
    publisher: source.publisher || '',
    tags: source.tags || '',
    isbn: source.isbn || '',
    pubdate: source.pubdate ? new Date(source.pubdate) : null,
    rating: source.rating ?? null,
    series: source.series || '',
    series_index: source.series_index ?? '',
    notes: source.notes || '',
    pageCount: source.page_count ? String(source.page_count) : ''
  })
  initialStatus.value = statusOf(source)
  status.value = initialStatus.value
  const date = initialStatus.value === 'read' ? source.read_date : initialStatus.value === 'reading' ? source.started_at : null
  initialStatusDate.value = date ? new Date(date) : null
  statusDate.value = initialStatusDate.value
  clearErrors()
  clearCover()
  resetLookup()
  initialSnapshot = currentSnapshot()
}

// ---------------------------------------------------------------- alterações não salvas

// O que a pessoa pode mudar; comparado com o valor ao abrir (utils/formState.js)
let initialSnapshot = null
function currentState() {
  return { ...form, status: status.value, statusDate: statusDate.value, cover: selectedFile.value }
}
function currentSnapshot() {
  return formSnapshot(currentState())
}
function isDirty() {
  return hasChanges(initialSnapshot, currentState())
}

/**
 * Sair sem salvar (Cancelar, Esc, X, voltar do navegador): se algo mudou,
 * pergunta "Descartar alterações?". Resolve true quando pode sair.
 */
async function confirmLeave() {
  if (saving.value || !isDirty()) return true
  return confirmDiscard(t)
}

async function requestCancel() {
  if (await confirmLeave()) emit('cancel')
}

function clearErrors() {
  Object.keys(errors).forEach(key => { delete errors[key] })
}

// ---------------------------------------------------------------- capa

const selectedFile = ref(null)
const preview = createPreviewHandle()
const filePreviewUrl = ref('')

function clearCover() {
  selectedFile.value = null
  filePreviewUrl.value = ''
  preview.clear()
}

function onCoverSelect(file) {
  const problem = validateImageFile(file)
  if (problem) {
    errors.cover = t(problem.key, problem.params || {})
    return
  }
  delete errors.cover
  selectedFile.value = file
  filePreviewUrl.value = preview.set(file)
  lookup.coverId = null
}

const coverPreview = computed(() => {
  if (filePreviewUrl.value) return filePreviewUrl.value
  if (lookup.coverId) return api.isbnCoverUrl(lookup.coverId)
  // Sem capa (cover_version null): mostra o espaço vazio de "enviar capa"
  if (!isCreate.value && props.bookId) return coverUrl(props.bookId, props.coverVersion) || ''
  return ''
})

const coverCaption = computed(() => {
  if (selectedFile.value) return selectedFile.value.name
  if (lookup.coverId) return t('bookForm.cover.fromIsbn')
  return ''
})

onBeforeUnmount(() => preview.clear())

// ---------------------------------------------------------------- ISBN, câmera e título

const {
  lookup,
  lookingUp,
  resetLookup,
  lookupMatchesForm,
  isbnFoundHere,
  lookupMessage,
  onIsbnKeydown,
  lookupIsbn,
  findMode,
  scannerOpen,
  canScan,
  setFindMode,
  onScanned,
  applySearchResult
} = useBookLookup({ form, errors, selectedFile, isbnField, bookSearch, isCreate })

// ---------------------------------------------------------------- validação

watch(() => form.title, () => { delete errors.title })
watch(() => form.authorNames, () => { delete errors.authors })
watch(() => form.series_index, () => { delete errors.seriesIndex })
watch(() => form.pageCount, () => { delete errors.pageCount })
watch(() => form.pubdate, () => { delete errors.pubDate })
watch([status, statusDate], () => { delete errors.statusDate })

function validate() {
  clearErrors()
  const found = validateBookForm(form, { status: status.value, statusDate: statusDate.value })
  for (const [field, key] of Object.entries(found)) errors[field] = t(key)
  return Object.keys(errors).length === 0
}

const FIELD_IDS = {
  isbn: 'isbn',
  title: 'title',
  authors: 'authors',
  publisher: 'publisher',
  pubDate: 'pubdate',
  series: 'series',
  seriesIndex: 'volume',
  pageCount: 'pages',
  tags: 'tags',
  statusDate: 'status-date',
  rating: 'rating-label',
  notes: 'notes',
  cover: 'cover'
}

async function focusFirstError() {
  await nextTick()
  const first = FIELD_ORDER.find(key => errors[key])
  if (!first) return
  const el = document.getElementById(`${props.idPrefix}-${FIELD_IDS[first]}`)
  el?.focus({ preventScroll: true })
  el?.scrollIntoView({ block: 'center', behavior: scrollBehavior() })
}

// ---------------------------------------------------------------- salvar

function readDateToSend() {
  if (status.value === 'read') return toApiDate(statusDate.value || new Date())
  // Releitura: "Lendo" num livro já lido mantém a data antiga
  if (status.value === 'reading' && props.initial?.read_date) return toApiDate(props.initial.read_date)
  return null
}

function statusChanged() {
  if (status.value !== initialStatus.value) return true
  return status.value !== 'none' && status.value !== 'want' &&
    toApiDate(statusDate.value) !== toApiDate(initialStatusDate.value)
}

async function submit() {
  if (saving.value) return
  if (!validate()) {
    focusFirstError()
    return
  }
  if (clearsHistory() && !(await askConfirm(t('history.clearMessage', { n: historyCount() }), t('history.clearTitle')))) return
  if (props.confirmMessage && !(await askConfirm())) return

  saving.value = true
  try {
    if (isCreate.value) await create()
    else await update()
  } catch (error) {
    const fieldError = fieldErrorFromApi(error, t)
    if (fieldError) {
      errors[fieldError.field] = fieldError.message
      focusFirstError()
    } else {
      toast.add({ severity: 'error', detail: error.message || t('book.toast_error'), life: 5000 })
    }
  } finally {
    saving.value = false
  }
}

// Leituras registradas (concluídas + a em andamento) do livro sendo editado
function historyCount() {
  const source = props.initial || {}
  return (source.read_count || 0) + (source.reading_status === 'reading' ? 1 : 0)
}

// Trocar para "Quero ler"/nenhum apaga o histórico: com mais de uma leitura, pergunta
function clearsHistory() {
  return !isCreate.value && (status.value === 'none' || status.value === 'want') &&
    status.value !== initialStatus.value && historyCount() > 1
}

function askConfirm(message = props.confirmMessage, header = t('bookDialog.confirm')) {
  return new Promise(resolve => {
    confirm.require({
      message,
      header,
      icon: 'pi pi-exclamation-circle',
      acceptClass: 'btn-primary',
      rejectClass: 'btn-text btn-secondary',
      acceptLabel: t('bookDialog.save'),
      rejectLabel: t('bookDialog.cancel'),
      accept: () => resolve(true),
      reject: () => resolve(false),
      onHide: () => resolve(false)
    })
  })
}

async function applyStatus(bookId) {
  const date = status.value === 'reading' || status.value === 'read' ? toApiDate(statusDate.value) : undefined
  return api.setReadingStatus(bookId, status.value, date || undefined)
}

async function create() {
  const data = createBookData(form, {
    readDate: readDateToSend(),
    openLibrary: lookupMatchesForm() ? lookup : null,
    cover: selectedFile.value
  })
  const result = await api.createBook(data)

  // "Quero ler" e "Lendo" vão por PATCH /library/:id/status (o POST só conhece a data de leitura)
  let statusSaved = true
  if (status.value === 'want' || status.value === 'reading') {
    try {
      await applyStatus(result.bookId)
    } catch {
      statusSaved = false
    }
  }

  const expectedCover = selectedFile.value || data.has('olCoverId')
  if (!statusSaved) {
    toast.add({ severity: 'warn', detail: t('bookForm.statusNotSaved'), life: 6000 })
  } else if (expectedCover && result?.coverSaved === false) {
    toast.add({ severity: 'warn', detail: t('book.cover_not_saved'), life: 6000 })
  } else {
    toast.add({ severity: 'success', detail: t('book.toast_added'), life: 3000 })
  }
  emit('saved', result)
}

async function update() {
  const response = await api.updateBook(props.bookId, updateBookPayload(form, { readDate: readDateToSend() }))
  const book = { ...response.book }

  if (statusChanged() && status.value !== 'read' || (status.value === 'read' && initialStatus.value !== 'read' && initialStatus.value !== 'none')) {
    const result = await applyStatus(props.bookId)
    book.read_date = result.readDate
    book.started_at = result.startedAt
    book.reading_status = result.status === 'want' || result.status === 'reading' ? result.status : null
  }

  let coverChanged = false
  if (selectedFile.value) {
    const data = new FormData()
    data.append('coverImage', selectedFile.value)
    const cover = await api.updateCover(props.bookId, data)
    // Versão nova: a URL muda (?v=) e a capa nova aparece sem cache velho
    book.cover_version = cover?.coverVersion ?? book.cover_version
    coverChanged = true
  }

  toast.add({ severity: 'success', detail: t('bookDialog.changesSaved'), life: 3000 })
  emit('saved', { book, coverChanged })
}

// Carrega o livro depois de tudo declarado (load usa capa e busca por ISBN)
watch(() => props.initial, load, { immediate: true })

defineExpose({ focusIsbn: () => isbnField.value?.focus(), isDirty, confirmLeave })
</script>

<style scoped>
.book-form {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  max-height: inherit;
}

.form-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  gap: var(--space-7);
  padding: var(--space-6) var(--space-7);
}

.cover-column {
  position: sticky;
  top: 0;
  align-self: start;
}

.fields-column {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  min-width: 0;
}

/* Título fora da área que rola, com espaço para o X do canto */
.form-header {
  flex-shrink: 0;
  padding: var(--space-6) 4rem var(--space-4) var(--space-7);
  border-bottom: 1px solid var(--border-color);
}

.form-header h2 {
  font-family: var(--font-display);
  font-size: var(--fs-2xl);
  font-weight: 700;
  margin: 0;
  line-height: 1.15;
  color: var(--text-primary);
}

.form-header p {
  margin: var(--space-1) 0 0;
  color: var(--text-secondary);
  font-size: var(--fs-md);
}

.isbn-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--space-2);
  align-items: start;
}

.finder-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-bottom: -0.35rem;
}

.scan-btn {
  display: inline-flex;
  margin-right: var(--space-1);
}

.isbn-row.single {
  grid-template-columns: minmax(0, 1fr);
}

.isbn-btn.btn {
  height: 3.25rem;
  border-radius: var(--radius-md);
}

/* Rodapé fora da área que rola: Salvar sempre à vista */
.form-footer {
  flex-shrink: 0;
  display: flex;
  justify-content: flex-end;
  gap: var(--space-3);
  padding: var(--space-4) var(--space-7);
  border-top: 1px solid var(--border-color);
  background: var(--bg-panel);
}

.form-footer :deep(.btn-secondary.btn-text) {
  color: var(--text-secondary);
}

@media (max-width: 1023.98px) {
  .form-scroll {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-5);
    padding: var(--space-5) var(--space-5) var(--space-4);
  }

  /* Capa compacta no topo: o formulário começa logo abaixo */
  .cover-column {
    position: static;
  }

  .form-header {
    padding: var(--space-4) 3.75rem var(--space-3) var(--space-5);
  }

  .form-header h2 {
    font-size: var(--fs-xl);
  }

  .form-header p {
    font-size: var(--fs-sm);
  }

  .form-footer {
    padding: 0.75rem 1.25rem calc(0.75rem + env(safe-area-inset-bottom));
  }

  .form-footer :deep(.btn) {
    white-space: nowrap;
  }

  .form-footer :deep(.btn-primary) {
    flex: 1;
  }

  .form-footer :deep(.btn-primary .btn-icon) {
    display: none;
  }
}

/* Celular (folha de baixo): capa pequena ao lado do título e dos autores,
   como no trailer; o botão de salvar fica preso no rodapé da folha (o X e o
   puxar para baixo cancelam, então o "Cancelar" sai). */
@media (max-width: 639.98px) {
  .form-header {
    padding: 0 3.25rem var(--space-3) var(--space-4);
    border-bottom: none;
  }

  .form-header p {
    display: none;
  }

  .form-scroll {
    grid-template-columns: 76px minmax(0, 1fr);
    gap: var(--space-4) var(--space-3);
    padding: var(--space-1) var(--space-4) var(--space-4);
    overscroll-behavior: contain;
  }

  .fields-column {
    display: contents;
  }

  .fields-column > * {
    grid-column: 1 / -1;
    order: 6;
  }

  .fields-column > .finder-tabs {
    order: 1;
  }

  .fields-column > .isbn-row,
  .fields-column > :deep(.book-search) {
    order: 2;
  }

  .cover-column {
    grid-column: 1;
    grid-row: span 2;
    order: 3;
  }

  .fields-column > .f-title,
  .fields-column > .f-authors {
    grid-column: 2;
    order: 4;
    min-width: 0;
  }

  .fields-column > .f-authors {
    order: 5;
  }

  /* Só a miniatura: o texto de ajuda continua para o leitor de tela */
  .cover-column :deep(.field-hint) {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
  }

  .form-footer {
    padding: var(--space-3) var(--space-4);
    border-top: 1px solid var(--border-color);
    background: var(--bg-panel);
  }

  .form-footer :deep(.btn-text.btn-secondary) {
    display: none;
  }

  .form-footer :deep(.btn-primary) {
    flex: 1;
    min-height: 48px;
  }

  .isbn-found {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    margin-right: var(--space-1);
    color: var(--success-strong, var(--success));
    font-size: var(--fs-sm);
    font-weight: 600;
    white-space: nowrap;
    animation: isbn-found-in var(--dur-spring) var(--ease-spring);
  }
}

@keyframes isbn-found-in {
  from {
    opacity: 0;
    transform: scale(0.7);
  }
}
</style>
