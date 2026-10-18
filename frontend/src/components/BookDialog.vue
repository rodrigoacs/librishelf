<template>
  <Dialog
    v-model:visible="visible"
    :modal="true"
    :dismissableMask="!isEditing"
    @hide="closeDialog"
    class="modern-book-dialog"
    :breakpoints="{ '960px': '75vw', '640px': '95vw' }"
    :style="{ width: '900px', maxWidth: '95vw' }"
    :showHeader="false"
    :aria-label="book.title || t('bookDialog.dialog_label')"
  >
    <div class="dialog-body">
      <button
        type="button"
        class="close-btn"
        :aria-label="t('common.close')"
        @click="visible = false"
      >
        <i
          class="pi pi-times"
          aria-hidden="true"
        ></i>
      </button>

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
          <component
            :is="isEditing ? 'button' : 'div'"
            :type="isEditing ? 'button' : undefined"
            class="cover-wrapper"
            :class="{ 'editable': isEditing }"
            :aria-label="isEditing ? t('bookDialog.changeCover') : undefined"
            @click="triggerFileInput"
          >
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
            <span
              v-if="isEditing"
              class="edit-overlay"
              aria-hidden="true"
            >
              <i class="pi pi-camera"></i>
              <span>{{ t('bookDialog.changeCover') }}</span>
            </span>
          </component>
          <input
            type="file"
            ref="fileInput"
            style="display: none"
            accept="image/*"
            tabindex="-1"
            aria-hidden="true"
            @change="onFileSelected"
          />
        </div>
      </div>

      <div class="details-section">
        <div class="details-header">
          <div class="title-area">
            <template v-if="isEditing">
              <label
                for="book-edit-title"
                class="sr-only"
              >{{ t('bookDialog.bookTitle') }}</label>
              <input
                id="book-edit-title"
                v-model="book.title"
                class="modern-input title-input"
                :placeholder="t('bookDialog.bookTitle')"
                :aria-invalid="submitted && !book.title.trim()"
              />
              <label
                for="book-edit-authors"
                class="sr-only"
              >{{ t('bookDialog.authorNames') }}</label>
              <AuthorsInput
                v-model="book.authorNames"
                input-id="book-edit-authors"
                class="author-input"
                :placeholder="t('bookDialog.authorNames')"
                :invalid="submitted && book.authorNames.length === 0"
              />
              <StarRating
                v-model="book.rating"
                class="rating-row"
                :label="t('rating.label')"
              />
            </template>
            <template v-else>
              <h1 class="book-title">{{ loading ? t('bookDialog.loading') : (book.title || t('bookDialog.noTitle')) }}
              </h1>
              <h2 class="book-author">{{ book.authors || (loading ? '' : t('bookDialog.unknownAuthor')) }}</h2>
              <template v-if="!loading && !loadFailed">
                <StarRating
                  v-if="!isReadOnly"
                  :model-value="book.rating"
                  class="rating-row"
                  :disabled="ratingSaving"
                  :label="t('rating.label')"
                  @update:model-value="quickRate"
                />
                <StarRating
                  v-else-if="book.rating"
                  :model-value="book.rating"
                  class="rating-row"
                  readonly
                />
              </template>
            </template>
          </div>

        </div>

        <!-- Edição: formulário completo -->
        <div
          v-if="isEditing"
          class="details-content"
        >
          <div class="info-group">
            <label for="book-edit-tags">{{ t('bookDialog.tags') }}</label>
            <input
              id="book-edit-tags"
              v-model="book.tags"
              class="modern-input"
              :placeholder="t('bookDialog.tagsPlaceholder')"
            />
          </div>

          <div class="dates-grid">
            <div class="info-group">
              <label for="book-read-date">{{ t('bookDialog.readDateLabel') }}</label>
              <div class="date-input-wrapper">
                <i
                  class="pi"
                  :class="book.read_date ? 'pi-check-circle text-theme' : 'pi-circle text-gray'"
                  aria-hidden="true"
                ></i>
                <Calendar
                  inputId="book-read-date"
                  v-model="book.read_date"
                  :maxDate="today"
                  dateFormat="dd/mm/yy"
                  :placeholder="t('bookDialog.notRead')"
                  class="modern-calendar"
                  :showIcon="false"
                  showButtonBar
                />
              </div>
            </div>

            <div class="info-group">
              <label for="book-pub-date">{{ t('bookDialog.publication') }}</label>
              <div class="date-input-wrapper">
                <i
                  class="pi pi-calendar text-gray"
                  aria-hidden="true"
                ></i>
                <Calendar
                  inputId="book-pub-date"
                  v-model="book.pubdate"
                  dateFormat="dd/mm/yy"
                  :placeholder="t('bookDialog.dateUnknown')"
                  class="modern-calendar"
                  :showIcon="false"
                  showButtonBar
                />
              </div>
            </div>
          </div>

          <div class="meta-grid">
            <div class="info-group">
              <label for="book-publisher">{{ t('bookDialog.publisher') }}</label>
              <input
                id="book-publisher"
                v-model="book.publisher"
                class="modern-input meta-input"
                placeholder="-"
              />
            </div>
            <div class="info-group">
              <label for="book-isbn">{{ t('bookDialog.isbn') }}</label>
              <input
                id="book-isbn"
                v-model="book.isbn"
                class="modern-input meta-input"
                placeholder="-"
              />
            </div>
          </div>
        </div>

        <!-- Visualização: o livro primeiro, o resto a um clique -->
        <div
          v-else-if="!loading && !loadFailed"
          class="details-content view"
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
              <button
                v-for="option in STATUS_OPTIONS"
                :key="option"
                type="button"
                class="status-option"
                :class="[option, { active: currentStatus === option }]"
                :aria-pressed="currentStatus === option"
                :disabled="readSaving"
                @click="changeStatus(option)"
              >
                <i
                  :class="STATUS_ICONS[option]"
                  aria-hidden="true"
                ></i>
                <span>{{ t(`status.${option}`) }}</span>
              </button>
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
                @click="changeStatus(currentStatus)"
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
            v-if="showCommunity"
            class="community-section"
          >
            <p
              v-if="communityLoading"
              class="muted-line"
            >{{ t('common.loading') }}</p>

            <p
              v-else-if="communityError"
              class="muted-line"
            >{{ t('community.load_error') }}</p>

            <template v-else-if="community">
              <p
                v-if="community.readerCount === 0"
                class="muted-line"
              >
                <i
                  class="pi pi-users"
                  aria-hidden="true"
                ></i>
                {{ t('community.no_readers') }}
              </p>

              <template v-else>
                <button
                  type="button"
                  class="community-toggle"
                  :aria-expanded="communityOpen"
                  aria-controls="book-community-panel"
                  @click="communityOpen = !communityOpen"
                >
                  <i
                    class="pi pi-users"
                    aria-hidden="true"
                  ></i>
                  <span class="toggle-text">
                    {{ t('community.readers_count', { n: community.readerCount }, community.readerCount) }}
                    <span
                      v-if="community.averageRating"
                      class="avg-rating"
                    >
                      <i
                        class="pi pi-star-fill"
                        aria-hidden="true"
                      ></i>
                      {{ formatAverage(community.averageRating) }}
                    </span>
                  </span>
                  <i
                    class="pi pi-chevron-down chevron"
                    :class="{ open: communityOpen }"
                    aria-hidden="true"
                  ></i>
                </button>

                <div
                  v-show="communityOpen"
                  id="book-community-panel"
                  class="community-panel"
                >
                  <ul class="reader-list">
                    <li
                      v-for="reader in community.readers"
                      :key="reader.username"
                    >
                      <router-link
                        :to="{ name: 'public-library', params: { username: reader.username } }"
                        class="reader-link"
                      >@{{ reader.username }}</router-link>
                      <i
                        v-if="reader.hasRead"
                        class="pi pi-check-circle text-theme"
                        v-tooltip.top="t('community.has_read')"
                        :aria-label="t('community.has_read')"
                      ></i>
                      <StarRating
                        v-if="reader.rating"
                        :model-value="reader.rating"
                        size="sm"
                        readonly
                      />
                    </li>
                  </ul>

                  <div
                    v-if="community.alsoHave.length"
                    class="also-have"
                  >
                    <h3>{{ t('community.also_have') }}</h3>
                    <ul>
                      <li
                        v-for="item in community.alsoHave.slice(0, ALSO_HAVE_SHOWN)"
                        :key="`${item.owner}-${item.bookId}`"
                      >
                        <router-link
                          :to="{ name: 'public-library', params: { username: item.owner }, query: { book: item.bookId } }"
                          class="also-link"
                        >
                          <span class="also-title">{{ item.title }}</span>
                          <span
                            v-if="item.authors"
                            class="also-authors"
                          >{{ item.authors }}</span>
                        </router-link>
                        <span class="also-count">{{ t('community.readers_short', { n: item.readers }, item.readers)
                          }}</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </template>

              <p
                v-if="!currentUser?.showInCommunity"
                class="community-hint"
              >
                <i18n-t
                  scope="global"
                  keypath="community.join_hint"
                  tag="span"
                >
                  <template #settings>
                    <router-link :to="{ name: 'settings' }">{{ t('community.settings_link') }}</router-link>
                  </template>
                </i18n-t>
              </p>
            </template>
          </section>
        </div>

        <!-- Ações do dono, longe do X de fechar e com nome escrito -->
        <div
          v-if="!isReadOnly && !loading && !loadFailed"
          class="dialog-footer"
          :class="{ editing: isEditing }"
        >
          <template v-if="!isEditing">
            <Button
              :label="t('bookDialog.deleteShort')"
              icon="pi pi-trash"
              class="p-button-text p-button-danger p-button-sm"
              @click="deleteBook"
            />
            <Button
              :label="t('bookDialog.editShort')"
              icon="pi pi-pencil"
              class="p-button-outlined p-button-secondary p-button-sm footer-edit"
              @click="editMode"
            />
          </template>
          <template v-else>
            <Button
              :label="t('bookDialog.cancel')"
              class="p-button-text p-button-secondary p-button-sm"
              :disabled="isSaving"
              @click="cancelEdit"
            />
            <Button
              :label="t('bookDialog.saveShort')"
              icon="pi pi-check"
              class="btn-action-primary p-button-sm"
              :loading="isSaving"
              @click="confirmSave"
            />
          </template>
        </div>
      </div>
    </div>
  </Dialog>
</template>

<script setup>
import { ref, watch, computed, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import Dialog from 'primevue/dialog'
import Calendar from 'primevue/calendar'
import Button from 'primevue/button'
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'
import api from '../services/api.js'
import AuthorsInput from './AuthorsInput.vue'
import StarRating from './StarRating.vue'
import { tagColor, colorFor } from '../utils/tagColors.js'
import { currentUser } from '../services/session.js'
import { coverUrl, coverFallbackExhausted } from '../utils/covers.js'
import GeneratedCover from './GeneratedCover.vue'
import { fromApiDate, toApiDate } from '../utils/dates.js'
import { statusOf, STATUS_OPTIONS, STATUS_ICONS } from '../utils/readingStatus.js'
import { validateImageFile, createPreviewHandle } from '../utils/files.js'

const { t, locale } = useI18n()
const props = defineProps({
  modelValue: Boolean,
  bookId: Number,
  isReadOnly: { type: Boolean, default: false },
  // Dono da biblioteca pública; obrigatório quando isReadOnly for true.
  ownerUsername: { type: String, default: '' }
})

// Data de leitura não pode estar no futuro (o servidor também recusa).
const today = new Date()

const emit = defineEmits(['update:modelValue', 'updated', 'deleted'])
const toast = useToast()
const confirm = useConfirm()


const visible = ref(props.modelValue)
const loading = ref(true)
const loadFailed = ref(false)
const isEditing = ref(false)
const isSaving = ref(false)
const submitted = ref(false)
const fileInput = ref(null)
const selectedFile = ref(null)
const previewUrl = ref(null)
const coverVersion = ref(0)
const preview = createPreviewHandle()

function emptyBook() {
  // authors: texto para exibir; authorNames: a lista que é editada e salva.
  return { title: '', authors: '', authorNames: [], publisher: '', tags: '', isbn: '', isbnValid: true, rating: null, read_date: null, reading_status: null, started_at: null, pubdate: null }
}

const book = ref(emptyBook())
let originalBook = null

const tagList = computed(() => {
  if (!book.value.tags) return []
  return book.value.tags.split(',').map(tag => tag.trim()).filter(Boolean)
})

const ALSO_HAVE_SHOWN = 3

const ratingSaving = ref(false)
const readSaving = ref(false)
const communityOpen = ref(false)
const community = ref(null)
const communityLoading = ref(false)
const communityError = ref(false)

const showIsbnWarning = computed(() => !isEditing.value && !loading.value && !book.value.isbnValid)
const showCommunity = computed(() => !props.isReadOnly && !isEditing.value && !loading.value && !loadFailed.value)

function formatDate(value) {
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(locale.value)
}

// Editora · ano · ISBN numa linha só; a data completa fica no title.
const metaItems = computed(() => {
  const items = []
  if (book.value.publisher) items.push({ key: 'publisher', text: book.value.publisher })
  if (book.value.pubdate) {
    items.push({
      key: 'year',
      text: String(book.value.pubdate.getFullYear()),
      title: t('bookDialog.publishedOn', { date: formatDate(book.value.pubdate) })
    })
  }
  if (book.value.isbn) items.push({ key: 'isbn', text: `ISBN ${book.value.isbn}` })
  return items
})

const currentStatus = computed(() => statusOf(book.value))

const statusCaption = computed(() => {
  const status = currentStatus.value
  if (status === 'read') return t('bookDialog.readOn', { date: formatDate(book.value.read_date) })
  if (status === 'reading') {
    return book.value.started_at
      ? t('status.readingSince', { date: formatDate(book.value.started_at) })
      : t('status.reading')
  }
  if (status === 'want') return t('status.wantCaption')
  return ''
})

/**
 * Quero ler / Lendo / Lido. Clicar no status que já está marcado tira o status
 * (o livro volta a só estar na estante). Datas vão no fuso da pessoa.
 */
async function changeStatus(option) {
  const next = currentStatus.value === option ? 'none' : option
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

function formatAverage(value) {
  return Number(value).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}

async function loadCommunity() {
  if (props.isReadOnly || !props.bookId) return
  communityLoading.value = true
  communityError.value = false
  try {
    community.value = await api.getBookCommunity(props.bookId)
  } catch {
    communityError.value = true
    community.value = null
  } finally {
    communityLoading.value = false
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

const displayCoverUrl = computed(() => previewUrl.value || coverUrl(props.bookId, coverVersion.value))

// Sem imagem: capa desenhada e fundo na cor do livro, em vez do quadro cinza.
const coverMissing = ref(false)
watch(displayCoverUrl, () => { coverMissing.value = false })

function onCoverError(event) {
  if (coverFallbackExhausted(event)) coverMissing.value = true
}


function triggerFileInput() {
  if (isEditing.value) fileInput.value?.click()
}

function onFileSelected(event) {
  const file = event.target.files[0]
  event.target.value = ''
  if (!file) return

  const problem = validateImageFile(file)
  if (problem) {
    toast.add({ severity: 'warn', summary: t('bookDialog.attention'), detail: t(problem.key, problem.params || {}), life: 4000 })
    return
  }

  selectedFile.value = file
  previewUrl.value = preview.set(file)
}

function clearSelectedFile() {
  selectedFile.value = null
  previewUrl.value = null
  preview.clear()
}

function cloneBook(source) {
  return {
    ...source,
    authorNames: [...(source.authorNames || [])],
    read_date: source.read_date ? new Date(source.read_date) : null,
    pubdate: source.pubdate ? new Date(source.pubdate) : null
  }
}

function deleteBook() {
  confirm.require({
    message: t('bookDialog.confirmDelete'),
    header: t('bookDialog.confirm'),
    icon: 'pi pi-exclamation-triangle',
    acceptClass: 'p-button-rounded p-button-danger',
    rejectClass: 'p-button-text p-button-secondary',
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
  originalBook = cloneBook(book.value)
  submitted.value = false
  isEditing.value = true
}

function cancelEdit() {
  if (originalBook) book.value = cloneBook(originalBook)
  clearSelectedFile()
  submitted.value = false
  isEditing.value = false
}

function closeDialog() {
  if (isEditing.value) cancelEdit()
  visible.value = false
}

function validate() {
  submitted.value = true

  if (!book.value.title.trim()) {
    toast.add({ severity: 'warn', summary: t('bookDialog.attention'), detail: t('bookDialog.validationTitle'), life: 3000 })
    return false
  }

  if (book.value.authorNames.length === 0) {
    toast.add({ severity: 'warn', summary: t('bookDialog.attention'), detail: t('bookDialog.validationAuthors'), life: 3000 })
    return false
  }

  return true
}

function confirmSave() {
  if (!validate()) return

  confirm.require({
    message: t('bookDialog.confirmSave'),
    header: t('bookDialog.confirm'),
    icon: 'pi pi-exclamation-circle',
    acceptClass: 'p-button-rounded btn-action-primary',
    rejectClass: 'p-button-text p-button-secondary',
    acceptLabel: t('bookDialog.save'),
    rejectLabel: t('bookDialog.cancel'),
    accept: () => saveBookDetails()
  })
}

async function saveBookDetails() {
  isSaving.value = true
  let coverChanged = false

  try {
    const response = await api.updateBook(props.bookId, {
      title: book.value.title.trim(),
      authors: book.value.authorNames,
      publisher: book.value.publisher,
      tags: tagList.value,
      isbn: book.value.isbn,
      rating: book.value.rating,
      pubDate: toApiDate(book.value.pubdate),
      readDate: toApiDate(book.value.read_date)
    })

    if (selectedFile.value) {
      const formData = new FormData()
      formData.append('coverImage', selectedFile.value)
      await api.updateCover(props.bookId, formData)
      coverChanged = true
      coverVersion.value = Date.now()
    }

    isEditing.value = false
    submitted.value = false
    clearSelectedFile()
    applyResponse(response.book)

    emit('updated', { book: { ...response.book, book_id: props.bookId }, coverChanged })
    toast.add({ severity: 'success', summary: t('bookDialog.success'), detail: t('bookDialog.changesSaved'), life: 3000 })
  } catch (error) {
    toast.add({ severity: 'error', summary: t('bookDialog.error'), detail: error.message || t('bookDialog.updateFailed'), life: 4000 })
  } finally {
    isSaving.value = false
  }
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
    started_at: fromApiDate(data.started_at),
    pubdate: fromApiDate(data.publication_date)
  }
}

async function loadBookData() {
  if (!props.bookId) return

  loading.value = true
  loadFailed.value = false
  clearSelectedFile()

  try {
    const response = props.isReadOnly
      ? await api.getPublicBook(props.ownerUsername, props.bookId)
      : await api.getBookById(props.bookId)

    applyResponse(response)
    loadCommunity()
  } catch (error) {
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

onMounted(() => {
  if (visible.value) loadBookData()
})

onBeforeUnmount(() => preview.clear())
</script>

<style>
.p-dialog.modern-book-dialog {
  border: none !important;
  border-radius: 16px !important;
  overflow: hidden !important;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5) !important;
  background-color: var(--bg-panel) !important;
}

.modern-book-dialog .p-dialog-content {
  padding: 0 !important;
  background-color: var(--bg-panel);
}

.modern-book-dialog .p-dialog-header {
  display: none !important;
}

.btn-action-primary {
  background-color: var(--main-color) !important;
  border-color: var(--main-color) !important;
  color: var(--text-inverse) !important;
}
</style>

<style scoped>
.dialog-body {
  display: flex;
  flex-direction: row;
  min-height: 440px;
  position: relative;
  width: 100%;
  background-color: var(--bg-panel);
}

.close-btn {
  position: absolute;
  top: 1rem;
  right: 1rem;
  z-index: 10;
  background: rgba(0, 0, 0, 0.2);
  border: none;
  border-radius: 50%;
  width: 32px;
  height: 32px;
  color: var(--text-primary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s;
}

.close-btn:hover {
  background: rgba(var(--main-color-rgb), 0.2);
  color: var(--main-color);
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

button.cover-wrapper {
  border: none;
  padding: 0;
  background: none;
  font: inherit;
  color: inherit;
  display: block;
}

.cover-wrapper.editable {
  cursor: pointer;
}

.main-cover {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: filter 0.3s ease;
}

.editable:hover .main-cover {
  filter: brightness(0.5) blur(2px);
}

.edit-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  color: white;
  opacity: 0;
  transition: opacity 0.3s ease;
  z-index: 5;
  background-color: rgba(0, 0, 0, 0.3);
}

.editable:hover .edit-overlay {
  opacity: 1;
}

.edit-overlay i {
  font-size: 2rem;
  margin-bottom: 0.5rem;
  color: var(--main-color);
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
  max-height: 85vh;
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
  font-family: 'Georgia', serif;
  font-size: 1.9rem;
  font-weight: 700;
  margin: 0;
  line-height: 1.2;
  color: var(--text-primary);
}

.book-author {
  font-size: 1.2rem;
  color: var(--text-secondary);
  margin: 0;
  font-weight: 400;
}

.modern-input {
  background: transparent;
  border: 1px solid transparent;
  color: inherit;
  font-family: inherit;
  padding: 0.25rem 0.5rem;
  border-radius: 6px;
  width: 100%;
  transition: all 0.2s;
}

.modern-input:not(.readonly):focus {
  background-color: var(--bg-input);
  border-color: var(--main-color);
  outline: none;
}

.title-input {
  font-family: 'Georgia', serif;
  font-size: 1.9rem;
  font-weight: 700;
}

/* Na edição, todos os campos de baixo com a mesma cara. */
.details-content .modern-input {
  background-color: var(--bg-input);
  padding: 0.7rem 0.75rem;
  border-radius: 8px;
}

.author-input {
  font-size: 1.2rem;
  color: var(--text-secondary);
}

.info-group label {
  display: block;
  font-size: 0.85rem;
  color: var(--text-secondary);
  margin-bottom: 0.4rem;
  font-weight: 500;
}

.details-content {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.details-content.view {
  gap: 1.1rem;
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
  font-size: 0.9rem;
}

.read-pill .pi {
  font-size: 0.8rem;
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

.status-option {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.45rem 0.9rem;
  border-radius: 999px;
  border: 1px solid var(--border-color);
  background: transparent;
  color: var(--text-secondary);
  font: inherit;
  font-size: 0.88rem;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease;
}

.status-option .pi {
  font-size: 0.8rem;
}

.status-option:hover:not(:disabled) {
  border-color: var(--main-color);
  color: var(--text-primary);
}

.status-option.active {
  background: var(--main-color);
  border-color: var(--main-color);
  color: var(--text-inverse);
}

.status-option:disabled {
  opacity: 0.6;
  cursor: progress;
}

.status-option:focus-visible {
  outline: 2px solid var(--main-color);
  outline-offset: 2px;
}

.status-caption {
  margin: 0;
  font-size: 0.85rem;
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
  font-size: 0.85rem;
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
.meta-line {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  color: var(--text-secondary);
  font-size: 0.92rem;
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
  font-size: 0.82rem;
}

.tags-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.tag-chip {
  font-size: 0.8rem;
  font-weight: 500;
  padding: 0.25rem 0.7rem;
  border-radius: 999px;
  color: var(--tag-color);
  background: color-mix(in srgb, var(--tag-color) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--tag-color) 35%, transparent);
}

/* Comunidade recolhida */
.community-section {
  border-top: 1px solid var(--border-color);
  padding-top: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.muted-line {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--text-secondary);
  font-size: 0.9rem;
}

.community-toggle {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  width: 100%;
  background: none;
  border: none;
  padding: 0.35rem 0;
  font: inherit;
  color: var(--text-primary);
  cursor: pointer;
  text-align: left;
}

.community-toggle>.pi-users {
  color: var(--text-secondary);
}

.toggle-text {
  flex: 1;
  font-size: 0.95rem;
}

.community-toggle:hover .toggle-text {
  color: var(--main-color);
}

.community-toggle:focus-visible {
  outline: 2px solid var(--main-color);
  outline-offset: 2px;
  border-radius: 6px;
}

.avg-rating {
  margin-left: 0.5rem;
  color: var(--text-secondary);
  white-space: nowrap;
}

.avg-rating .pi {
  color: #f5b301;
  font-size: 0.8rem;
}

.chevron {
  color: var(--text-muted);
  font-size: 0.8rem;
  transition: transform 0.2s ease;
}

.chevron.open {
  transform: rotate(180deg);
}

@media (prefers-reduced-motion: reduce) {
  .chevron {
    transition: none;
  }
}

.community-panel {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.reader-list,
.also-have ul {
  list-style: none;
  margin: 0;
  padding: 0;
}

.reader-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.reader-list li {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  background: var(--bg-input);
  border-radius: 999px;
  padding: 0.25rem 0.7rem;
  font-size: 0.85rem;
}

.reader-link,
.also-link,
.community-hint a {
  color: var(--main-color);
  text-decoration: none;
}

.reader-link:hover,
.also-link:hover .also-title,
.community-hint a:hover {
  text-decoration: underline;
}

.also-have h3 {
  margin: 0 0 0.35rem;
  font-size: 0.85rem;
  color: var(--text-secondary);
  font-weight: 500;
}

.also-have li {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 1rem;
  padding: 0.45rem 0;
  border-bottom: 1px solid var(--border-color);
}

.also-have li:last-child {
  border-bottom: none;
}

.also-link {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.also-title {
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.also-authors,
.also-count {
  font-size: 0.8rem;
  color: var(--text-secondary);
}

.also-count {
  flex-shrink: 0;
}

.community-hint {
  margin: 0;
  font-size: 0.82rem;
  color: var(--text-secondary);
  line-height: 1.45;
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

.dialog-footer.editing {
  justify-content: flex-end;
}

.footer-edit.p-button {
  border-radius: 8px;
}

.dates-grid,
.meta-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.5rem;
  margin-bottom: 0.5rem;
}

.date-input-wrapper {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  background-color: var(--bg-input);
  padding: 0.5rem 1rem;
  border-radius: 8px;
}

.text-theme {
  color: var(--main-color);
  font-weight: bold;
}

.text-gray {
  color: var(--text-muted);
}

:deep(.modern-calendar .p-inputtext) {
  background: transparent;
  border: none;
  color: var(--text-primary);
  padding: 0;
  font-size: 1rem;
  width: 100%;
}

.meta-input {
  background-color: var(--bg-input);
  padding: 0.75rem;
  border-radius: 8px;
  color: var(--text-primary);
}

.meta-input.readonly {
  background-color: transparent;
  padding: 0;
}

.p-button.p-button-secondary.p-button-text {
  color: var(--text-secondary) !important;
}

.p-button.p-button-secondary.p-button-text:hover {
  color: var(--text-primary) !important;
  background-color: var(--bg-hover) !important;
}

@media (max-width: 768px) {

  /* Celular/tablet em pé: capa compacta em cima e só os detalhes rolam,
     para o botão de fechar e o título ficarem sempre à vista. */
  .dialog-body {
    flex-direction: column;
    min-height: 0;
    max-height: calc(100dvh - 2rem);
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

  .book-title {
    font-size: 1.5rem;
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

  .details-header {
    padding-right: 0;
  }

  .dates-grid,
  .meta-grid {
    grid-template-columns: 1fr;
    gap: 1rem;
  }
}
</style>