<template>
  <form
    class="book-form"
    novalidate
    :aria-labelledby="`${idPrefix}-heading`"
    @submit.prevent="submit"
  >
    <header class="form-header">
      <h2 :id="`${idPrefix}-heading`">{{ isCreate ? t('bookForm.newTitle') : t('bookForm.editTitle') }}</h2>
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
          :class="{ single: !isCreate }"
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
              v-if="isCreate && canScan"
              #suffix
            >
              <span class="scan-btn">
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
            v-if="isCreate"
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
          :label="t('bookForm.title')"
          :error="errors.title"
          maxlength="500"
          required
          large
        />

        <AuthorsInput
          v-model="form.authorNames"
          :input-id="`${idPrefix}-authors`"
          :label="t('bookForm.authors')"
          :error="errors.authors"
          required
        />

        <fieldset class="form-group">
          <legend>{{ t('bookForm.aboutSection') }}</legend>

          <div class="grid-2">
            <TextField
              :id="`${idPrefix}-publisher`"
              v-model="form.publisher"
              :label="t('bookForm.publisher')"
              :error="errors.publisher"
              maxlength="200"
            />
            <DateField
              :id="`${idPrefix}-pubdate`"
              v-model="form.pubdate"
              :label="t('bookForm.pubDate')"
              :min-date="PUB_MIN_DATE"
              :max-date="PUB_MAX_DATE"
              :error="errors.pubDate"
            />
          </div>

          <div class="grid-series">
            <TextField
              :id="`${idPrefix}-series`"
              v-model="form.series"
              :label="t('series.name')"
              :list="`${idPrefix}-series-options`"
              maxlength="200"
              :error="errors.series"
              :input-attrs="{ onFocus: loadSeriesOptions }"
            />
            <TextField
              :id="`${idPrefix}-volume`"
              v-model="form.series_index"
              :label="t('series.volume')"
              inputmode="decimal"
              maxlength="7"
              :error="errors.seriesIndex"
            />
            <TextField
              :id="`${idPrefix}-pages`"
              v-model="form.pageCount"
              :label="t('bookForm.pages')"
              inputmode="numeric"
              maxlength="5"
              :error="errors.pageCount"
            />
          </div>
          <datalist :id="`${idPrefix}-series-options`">
            <option
              v-for="item in seriesOptions"
              :key="item.name"
              :value="item.name"
            ></option>
          </datalist>

          <TextField
            :id="`${idPrefix}-tags`"
            v-model="form.tags"
            :label="t('bookForm.tags')"
            :hint="t('bookForm.tagsHint')"
            :error="errors.tags"
          />
        </fieldset>

        <fieldset class="form-group">
          <legend>{{ t('bookForm.readingSection') }}</legend>

          <div>
            <FieldLabel :id="`${idPrefix}-status-label`">{{ t('status.label') }}</FieldLabel>
            <div
              class="status-picker"
              role="group"
              :aria-labelledby="`${idPrefix}-status-label`"
            >
              <PillButton
                v-for="option in STATUS_OPTIONS"
                :key="option"
                :icon="STATUS_ICONS[option]"
                :label="t(`status.${option}`)"
                :active="status === option"
                @click="pickStatus(option)"
              />
            </div>
            <p class="status-caption">{{ statusCaption }}</p>
          </div>

          <DateField
            v-if="status === 'read' || status === 'reading'"
            :id="`${idPrefix}-status-date`"
            v-model="statusDate"
            :label="status === 'read' ? t('bookForm.readOn') : t('bookForm.startedOn')"
            :min-date="READ_MIN_DATE"
            :max-date="today"
            :error="errors.statusDate"
          />

          <div>
            <FieldLabel :id="`${idPrefix}-rating-label`">{{ t('rating.label') }}</FieldLabel>
            <StarRating
              v-model="form.rating"
              size="lg"
              :label="t('rating.label')"
            />
            <small
              v-if="errors.rating"
              class="inline-error"
            >{{ errors.rating }}</small>
          </div>

          <TextField
            :id="`${idPrefix}-notes`"
            v-model="form.notes"
            :label="t('notes.label')"
            :hint="`${t('notes.privateHint')} · ${(form.notes || '').length}/5000`"
            :error="errors.notes"
            multiline
            rows="3"
            maxlength="5000"
          />
        </fieldset>
      </div>
    </div>

    <footer class="form-footer">
      <AppButton
        type="button"
        :label="t('common.cancel')"
        class="btn-text btn-secondary"
        :disabled="saving"
        @click="emit('cancel')"
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
import { computed, nextTick, reactive, ref, watch, onBeforeUnmount, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import AppButton from '../ui/AppButton.vue'
import { useToast } from '../../services/toast.js'
import { useConfirm } from '../../services/confirm.js'
import api from '../../services/api.js'
import AuthorsInput from '../AuthorsInput.vue'
import StarRating from '../StarRating.vue'
import TextField from '../form/TextField.vue'
import DateField from '../form/DateField.vue'
import FieldLabel from '../form/FieldLabel.vue'
import PillButton from '../form/PillButton.vue'
import CoverDrop from '../form/CoverDrop.vue'
import IconButton from '../form/IconButton.vue'
import BookSearch from './BookSearch.vue'
import BarcodeScanner from './BarcodeScanner.vue'
import { hasCamera } from '../../services/barcode.js'
import { toApiDate, PUB_MIN_DATE, PUB_MAX_DATE, READ_MIN_DATE } from '../../utils/dates.js'
import { statusOf, STATUS_OPTIONS, STATUS_ICONS } from '../../utils/readingStatus.js'
import { validateImageFile, createPreviewHandle } from '../../utils/files.js'
import { coverUrl } from '../../utils/covers.js'
import { fieldErrorFromApi, FIELD_ORDER } from '../../utils/bookFormErrors.js'

/**
 * Formulário de livro, o mesmo no "Novo livro" e na edição.
 *   mode="create": POST /library (+ status de leitura, se escolhido)
 *   mode="edit":   PUT /library/:id (+ status e capa, se mudaram)
 * Emite 'saved' com o resultado e 'cancel'.
 */
const props = defineProps({
  mode: { type: String, default: 'create' },
  bookId: { type: Number, default: null },
  // Livro no formato do BookDialog (authorNames, read_date, pubdate…)
  initial: { type: Object, default: null },
  // Versão da capa atual (cache-buster), só na edição
  coverVersion: { type: Number, default: 0 },
  idPrefix: { type: String, default: 'book-form' },
  // Pergunta antes de salvar (usado na edição)
  confirmMessage: { type: String, default: '' }
})

const emit = defineEmits(['saved', 'cancel'])
const { t } = useI18n()
const toast = useToast()
const confirm = useConfirm()

const isCreate = computed(() => props.mode === 'create')
// Data de leitura não pode estar no futuro (o servidor também recusa).
const today = new Date()

function blankForm() {
  return { title: '', authorNames: [], publisher: '', tags: '', isbn: '', pubdate: null, rating: null, series: '', series_index: '', notes: '', pageCount: '' }
}

const form = reactive(blankForm())
const status = ref('none')
const statusDate = ref(null)
const initialStatus = ref('none')
const initialStatusDate = ref(null)
const errors = reactive({})
const saving = ref(false)
const isbnField = ref(null)

function load() {
  const source = props.initial || {}
  Object.assign(form, blankForm(), {
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
}

function clearErrors() {
  Object.keys(errors).forEach(key => { delete errors[key] })
}

// ---------------------------------------------------------------- status

function pickStatus(option) {
  status.value = status.value === option ? 'none' : option
  if ((status.value === 'read' || status.value === 'reading') && !statusDate.value) {
    const now = new Date()
    statusDate.value = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  }
  delete errors.statusDate
}

const statusCaption = computed(() => {
  if (status.value === 'want') return t('status.wantCaption')
  if (status.value === 'none') return t('bookForm.statusNone')
  return t('bookForm.statusClear')
})

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
  if (!isCreate.value && props.bookId) return coverUrl(props.bookId, props.coverVersion)
  return ''
})

const coverCaption = computed(() => {
  if (selectedFile.value) return selectedFile.value.name
  if (lookup.coverId) return t('bookForm.cover.fromIsbn')
  return ''
})

onBeforeUnmount(() => preview.clear())

// ---------------------------------------------------------------- séries

const seriesOptions = ref([])
async function loadSeriesOptions() {
  if (seriesOptions.value.length) return
  try {
    seriesOptions.value = await api.getSeries()
  } catch {
    seriesOptions.value = []
  }
}

// ---------------------------------------------------------------- ISBN

// As chaves do Open Library só valem para o ISBN com que foram achadas (o
// buscado, ou o do resultado da busca por título — que pode não ter ISBN);
// se a pessoa trocar o ISBN depois, elas não são enviadas.
const lookup = reactive({ active: false, isbn: '', olWorkKey: null, olEditionKey: null, coverId: null })
const lookingUp = ref(false)
const lookupState = ref('idle') // idle | found | missing | error

function resetLookup() {
  Object.assign(lookup, { active: false, isbn: '', olWorkKey: null, olEditionKey: null, coverId: null })
  lookupState.value = 'idle'
}

const lookupMatchesForm = () => lookup.active && lookup.isbn === form.isbn.trim()

const lookupMessage = computed(() => {
  if (lookupState.value === 'found') return t('isbn.found')
  if (lookupState.value === 'missing') return t('isbn.not_found')
  if (lookupState.value === 'error') return t('isbn.error')
  return t('isbn.hint')
})

watch(() => form.isbn, () => {
  delete errors.isbn
  if (lookup.active && !lookupMatchesForm()) resetLookup()
})

function onIsbnKeydown(event) {
  if (event.key === 'Enter') {
    event.preventDefault()
    lookupIsbn()
  }
}

function parseApiDate(value) {
  if (!value) return null
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

// Preenche só os campos vazios: o que a pessoa já digitou tem prioridade.
// via = 'scan' quando veio da câmera (o servidor só conta, para saber se o leitor é usado)
async function lookupIsbn(via) {
  const isbn = form.isbn.trim()
  if (!isbn || lookingUp.value) return

  lookingUp.value = true
  delete errors.isbn
  try {
    const found = await api.lookupIsbn(isbn, via === 'scan' ? 'scan' : undefined)
    if (!form.title.trim() && found.title) form.title = found.title
    if (form.authorNames.length === 0 && found.authors?.length) form.authorNames = [...found.authors]
    if (!form.publisher.trim() && found.publisher) form.publisher = found.publisher
    if (!form.pubdate && found.pubDate) form.pubdate = parseApiDate(found.pubDate)
    if (!String(form.pageCount).trim() && found.pages) form.pageCount = String(found.pages)

    Object.assign(lookup, {
      active: true,
      isbn,
      olWorkKey: found.olWorkKey,
      olEditionKey: found.olEditionKey,
      coverId: selectedFile.value ? null : found.coverId
    })
    lookupState.value = 'found'
  } catch (error) {
    resetLookup()
    if (error.status === 404) lookupState.value = 'missing'
    else if (error.status === 400) errors.isbn = t('isbn.invalid')
    else lookupState.value = 'error'
  } finally {
    lookingUp.value = false
  }
}

// ---------------------------------------------------------------- câmera e título

const findMode = ref('isbn') // isbn | title
const bookSearch = ref(null)
const scannerOpen = ref(false)
const canScan = ref(false)

onMounted(async () => {
  if (isCreate.value) canScan.value = await hasCamera()
})

async function setFindMode(mode) {
  if (findMode.value === mode) return
  findMode.value = mode
  await nextTick()
  if (mode === 'title') bookSearch.value?.focus()
  else isbnField.value?.focus()
}

// Erro no ISBN (ex.: já cadastrado) com a busca por título aberta: mostra o campo
watch(() => errors.isbn, value => {
  if (value) findMode.value = 'isbn'
})

function onScanned(isbn) {
  form.isbn = isbn
  lookupIsbn('scan')
}

// Resultado da busca por título: mesma regra do ISBN (só campos vazios)
async function applySearchResult(item) {
  if (!form.title.trim() && item.title) form.title = item.title
  if (form.authorNames.length === 0 && item.authors?.length) form.authorNames = [...item.authors]
  if (!form.publisher.trim() && item.publisher) form.publisher = item.publisher
  if (!form.pubdate && item.pubDate) form.pubdate = parseApiDate(item.pubDate)
  if (!form.isbn.trim() && item.isbn13) form.isbn = item.isbn13
  if (!String(form.pageCount).trim() && item.pages) form.pageCount = String(item.pages)

  delete errors.isbn
  const sameIsbn = (item.isbn13 || '') === form.isbn.trim()
  if (sameIsbn) {
    Object.assign(lookup, {
      active: true,
      isbn: item.isbn13 || '',
      olWorkKey: item.olWorkKey,
      olEditionKey: item.olEditionKey,
      coverId: selectedFile.value ? null : item.coverId
    })
    lookupState.value = 'found'
  } else {
    resetLookup()
    lookupState.value = 'found'
  }

  findMode.value = 'isbn'
  await nextTick()
  isbnField.value?.focus()
}

// ---------------------------------------------------------------- validação

watch(() => form.title, () => { delete errors.title })
watch(() => form.authorNames, () => { delete errors.authors })
watch(() => form.series_index, () => { delete errors.seriesIndex })
watch(() => form.pageCount, () => { delete errors.pageCount })
watch(() => form.pubdate, () => { delete errors.pubDate })
watch(statusDate, () => { delete errors.statusDate })

function validate() {
  clearErrors()
  if (!form.title.trim()) errors.title = t('bookForm.errors.titleRequired')
  if (form.authorNames.length === 0) errors.authors = t('bookForm.errors.authorsRequired')
  const volume = String(form.series_index ?? '').trim()
  if (volume) {
    const number = Number(volume.replace(',', '.'))
    if (!Number.isFinite(number) || number < 0 || number > 9999) errors.seriesIndex = t('bookForm.errors.volume')
  }
  const pages = String(form.pageCount ?? '').trim()
  if (pages && !/^\d{1,5}$/.test(pages) || pages && (Number(pages) < 1 || Number(pages) > 20000)) {
    errors.pageCount = t('bookForm.errors.pages')
  }
  // Compara só o dia (texto YYYY-MM-DD), sem a hora
  if (statusDate.value && toApiDate(statusDate.value) > toApiDate(new Date()) && (status.value === 'read' || status.value === 'reading')) {
    errors.statusDate = t('bookForm.errors.futureDate')
  }
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
  el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
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
      toast.add({ severity: 'error', summary: t('common.error'), detail: error.message || t('book.toast_error'), life: 5000 })
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
  const data = new FormData()
  data.append('title', form.title.trim())
  // Um campo "authors" por autor: nomes podem conter vírgula.
  form.authorNames.forEach(name => data.append('authors', name))
  data.append('publisher', form.publisher || '')
  data.append('isbn', form.isbn || '')
  data.append('tags', form.tags || '')
  if (form.pubdate) data.append('pubDate', toApiDate(form.pubdate))
  const readDate = readDateToSend()
  if (readDate) data.append('readDate', readDate)
  if (form.rating) data.append('rating', String(form.rating))
  if (form.series?.trim()) data.append('series', form.series.trim())
  if (String(form.series_index ?? '').trim()) data.append('seriesIndex', String(form.series_index).trim())
  if (form.notes?.trim()) data.append('notes', form.notes)
  if (String(form.pageCount).trim()) data.append('pageCount', String(form.pageCount).trim())

  if (lookupMatchesForm()) {
    if (lookup.olWorkKey) data.append('olWorkKey', lookup.olWorkKey)
    if (lookup.olEditionKey) data.append('olEditionKey', lookup.olEditionKey)
    if (!selectedFile.value && lookup.coverId) data.append('olCoverId', String(lookup.coverId))
  }
  if (selectedFile.value) data.append('coverImage', selectedFile.value)

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
    toast.add({ severity: 'warn', summary: t('common.success'), detail: t('bookForm.statusNotSaved'), life: 6000 })
  } else if (expectedCover && result?.coverSaved === false) {
    toast.add({ severity: 'warn', summary: t('common.success'), detail: t('book.cover_not_saved'), life: 6000 })
  } else {
    toast.add({ severity: 'success', summary: t('common.success'), detail: t('book.toast_added'), life: 3000 })
  }
  emit('saved', result)
}

async function update() {
  const response = await api.updateBook(props.bookId, {
    title: form.title.trim(),
    authors: form.authorNames,
    publisher: form.publisher,
    tags: form.tags.split(',').map(tag => tag.trim()).filter(Boolean),
    isbn: form.isbn,
    rating: form.rating,
    pubDate: toApiDate(form.pubdate),
    readDate: readDateToSend(),
    series: (form.series || '').trim(),
    seriesIndex: String(form.series_index ?? '').trim() || null,
    notes: form.notes || '',
    pageCount: String(form.pageCount ?? '').trim() || null
  })
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
    await api.updateCover(props.bookId, data)
    coverChanged = true
  }

  toast.add({ severity: 'success', summary: t('bookDialog.success'), detail: t('bookDialog.changesSaved'), life: 3000 })
  emit('saved', { book, coverChanged })
}

// Carrega o livro depois de tudo declarado (load usa capa e busca por ISBN)
watch(() => props.initial, load, { immediate: true })

defineExpose({ focusIsbn: () => isbnField.value?.focus() })
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
  gap: 2rem;
  padding: 1.5rem 2.25rem;
}

.cover-column {
  position: sticky;
  top: 0;
  align-self: start;
}

.fields-column {
  display: flex;
  flex-direction: column;
  gap: 1.1rem;
  min-width: 0;
}

/* Título fora da área que rola, com espaço para o X do canto */
.form-header {
  flex-shrink: 0;
  padding: 1.5rem 4rem 1rem 2.25rem;
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
  margin: 0.35rem 0 0;
  color: var(--text-secondary);
  font-size: var(--fs-md);
}

.isbn-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 0.5rem;
  align-items: start;
}

.finder-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-bottom: -0.35rem;
}

.scan-btn {
  display: inline-flex;
  margin-right: 0.35rem;
}

.isbn-row.single {
  grid-template-columns: minmax(0, 1fr);
}

.isbn-btn.btn {
  height: 3.25rem;
  border-radius: 10px;
}

.form-group {
  border: none;
  margin: 0.5rem 0 0;
  padding: 1.1rem 0 0;
  border-top: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  gap: 1rem;
  min-width: 0;
}

.form-group legend {
  float: left;
  width: 100%;
  padding: 0;
  margin-bottom: 0.1rem;
  font-size: var(--fs-sm);
  font-weight: 700;
  color: var(--text-primary);
}

.grid-2 {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 1rem;
}

.grid-series {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 6.5rem 6.5rem;
  gap: 1rem;
}

.status-picker {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.status-caption {
  margin: 0.45rem 0 0;
  font-size: var(--fs-xs);
  color: var(--text-muted);
}

.inline-error {
  display: block;
  margin-top: 0.3rem;
  color: var(--red);
  font-size: var(--fs-xs);
}

/* Rodapé fora da área que rola: Salvar sempre à vista */
.form-footer {
  flex-shrink: 0;
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  padding: 0.9rem 2.25rem;
  border-top: 1px solid var(--border-color);
  background: var(--bg-panel);
}

.form-footer :deep(.btn-secondary.btn-text) {
  color: var(--text-secondary);
}

@media (max-width: 768px) {
  .form-scroll {
    grid-template-columns: minmax(0, 1fr);
    gap: 1.25rem;
    padding: 1.25rem 1.25rem 1rem;
  }

  /* Capa compacta no topo: o formulário começa logo abaixo */
  .cover-column {
    position: static;
  }

  .form-header {
    padding: 1rem 3.75rem 0.85rem 1.25rem;
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

@media (max-width: 480px) {
  .grid-2 {
    grid-template-columns: minmax(0, 1fr);
  }

  .grid-series {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  }

  .grid-series > :first-child {
    grid-column: 1 / -1;
  }
}
</style>
