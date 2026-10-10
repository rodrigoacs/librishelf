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

      <div class="cover-section">
        <img
          :src="displayCoverUrl"
          class="blur-bg"
          alt=""
          aria-hidden="true"
          @error="handleCoverError"
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
              :src="displayCoverUrl"
              @error="handleCoverError"
              :alt="t('bookDialog.bookCover')"
              class="main-cover"
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
              <h1 class="book-title">{{ loading ? t('bookDialog.loading') : (book.title || t('bookDialog.noTitle')) }}</h1>
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

          <div
            v-if="!isReadOnly"
            class="actions-area"
          >
            <template v-if="!isEditing">
              <Button
                icon="pi pi-trash"
                class="p-button-rounded p-button-text p-button-danger"
                v-tooltip.bottom="t('bookDialog.delete')"
                :aria-label="t('bookDialog.delete')"
                :disabled="loading || loadFailed"
                @click="deleteBook"
              />
              <Button
                icon="pi pi-pencil"
                class="p-button-rounded p-button-text p-button-secondary"
                v-tooltip.bottom="loadFailed ? t('bookDialog.cannotEdit') : t('bookDialog.edit')"
                :aria-label="t('bookDialog.edit')"
                :disabled="loading || loadFailed"
                @click="editMode"
              />
            </template>
            <div
              v-else
              class="edit-actions"
            >
              <Button
                icon="pi pi-times"
                class="p-button-rounded p-button-text p-button-secondary"
                :aria-label="t('common.cancel')"
                v-tooltip.bottom="t('common.cancel')"
                @click="cancelEdit"
                :disabled="isSaving"
              />
              <Button
                icon="pi pi-check"
                class="p-button-rounded btn-action-primary"
                :aria-label="t('common.save')"
                v-tooltip.bottom="t('common.save')"
                @click="confirmSave"
                :loading="isSaving"
              />
            </div>
          </div>
        </div>

        <div class="details-content">
          <div class="info-group">
            <label :for="isEditing ? 'book-edit-tags' : undefined">{{ t('bookDialog.tags') }}</label>
            <div v-if="isEditing">
              <input
                id="book-edit-tags"
                v-model="book.tags"
                class="modern-input"
                :placeholder="t('bookDialog.tagsPlaceholder')"
              />
            </div>
            <div
              v-else
              class="tags-list"
            >
              <span
                v-if="!tagList.length"
                class="empty-text"
              >{{ t('bookDialog.noTags') }}</span>

              <Chip
                v-for="(tag, index) in tagList"
                :key="`${tag}-${index}`"
                :label="tag"
                class="custom-chip colored-chip"
                :style="{ '--tag-color': getTagColor(index) }"
              />
            </div>
          </div>

          <div class="dates-grid">
            <div class="info-group">
              <label for="book-read-date">{{ t('bookDialog.readingStatus') }}</label>
              <div class="date-input-wrapper">
                <i
                  class="pi"
                  :class="book.read_date ? 'pi-check-circle text-theme' : 'pi-circle text-gray'"
                  aria-hidden="true"
                ></i>
                <Calendar
                  inputId="book-read-date"
                  v-model="book.read_date"
                  :disabled="!isEditing"
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
                  :disabled="!isEditing"
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
                :readonly="!isEditing"
                class="modern-input meta-input"
                :class="{ 'readonly': !isEditing }"
                placeholder="-"
              />
            </div>
            <div class="info-group">
              <label for="book-isbn">{{ t('bookDialog.isbn') }}</label>
              <input
                id="book-isbn"
                v-model="book.isbn"
                :readonly="!isEditing"
                class="modern-input meta-input"
                :class="{ 'readonly': !isEditing }"
                placeholder="-"
                :aria-describedby="showIsbnWarning ? 'book-isbn-warning' : undefined"
              />
              <small
                v-if="showIsbnWarning"
                id="book-isbn-warning"
                class="isbn-warning"
              >
                <i
                  class="pi pi-exclamation-triangle"
                  aria-hidden="true"
                ></i>
                {{ t('bookDialog.isbnInvalid') }}
              </small>
            </div>
          </div>

          <section
            v-if="showCommunity"
            class="community-section"
            :aria-label="t('community.book_title')"
          >
            <h3 class="community-title">
              <i
                class="pi pi-users"
                aria-hidden="true"
              ></i>
              {{ t('community.book_title') }}
            </h3>

            <p
              v-if="communityLoading"
              class="empty-text"
            >{{ t('common.loading') }}</p>

            <p
              v-else-if="communityError"
              class="empty-text"
            >{{ t('community.load_error') }}</p>

            <template v-else-if="community">
              <p
                v-if="community.readerCount === 0"
                class="empty-text"
              >{{ t('community.no_readers') }}</p>

              <template v-else>
                <p class="community-summary">
                  {{ t('community.readers_count', { n: community.readerCount }, community.readerCount) }}
                  <span
                    v-if="community.averageRating"
                    class="avg-rating"
                  >
                    · <i
                      class="pi pi-star-fill"
                      aria-hidden="true"
                    ></i>
                    {{ t('community.average', { avg: formatAverage(community.averageRating), n: community.ratingCount }, community.ratingCount) }}
                  </span>
                </p>

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
                  <h4>{{ t('community.also_have') }}</h4>
                  <ul>
                    <li
                      v-for="item in community.alsoHave"
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
                      <span class="also-count">{{ t('community.readers_short', { n: item.readers }, item.readers) }}</span>
                    </li>
                  </ul>
                </div>
              </template>

              <p
                v-if="!currentUser?.showInCommunity"
                class="community-hint"
              >
                <i
                  class="pi pi-info-circle"
                  aria-hidden="true"
                ></i>
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
      </div>
    </div>
  </Dialog>
</template>

<script setup>
import { ref, watch, computed, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import Chip from 'primevue/chip'
import Dialog from 'primevue/dialog'
import Calendar from 'primevue/calendar'
import Button from 'primevue/button'
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'
import api from '../services/api.js'
import AuthorsInput from './AuthorsInput.vue'
import StarRating from './StarRating.vue'
import { currentUser } from '../services/session.js'
import { coverUrl, handleCoverError } from '../utils/covers.js'
import { fromApiDate, toApiDate } from '../utils/dates.js'
import { validateImageFile, createPreviewHandle } from '../utils/files.js'

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

const TAG_COLORS = ['var(--red)', 'var(--green)', 'var(--blue)', 'var(--purple)', 'var(--yellow)', 'var(--orange)']

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
  return { title: '', authors: '', authorNames: [], publisher: '', tags: '', isbn: '', isbnValid: true, rating: null, read_date: null, pubdate: null }
}

const book = ref(emptyBook())
let originalBook = null

const tagList = computed(() => {
  if (!book.value.tags) return []
  return book.value.tags.split(',').map(tag => tag.trim()).filter(Boolean)
})

const ratingSaving = ref(false)
const community = ref(null)
const communityLoading = ref(false)
const communityError = ref(false)

const showIsbnWarning = computed(() => !isEditing.value && !loading.value && !book.value.isbnValid)
const showCommunity = computed(() => !props.isReadOnly && !isEditing.value && !loading.value && !loadFailed.value)

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

function getTagColor(index) {
  return TAG_COLORS[index % TAG_COLORS.length]
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
  min-height: 500px;
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
  gap: 2rem;
  overflow-y: auto;
  max-height: 85vh;
}

.details-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
}

.title-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.book-title {
  font-size: 2rem;
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
  font-size: 2rem;
  font-weight: 700;
}

.author-input {
  font-size: 1.2rem;
  color: var(--text-secondary);
}

.info-group label {
  display: block;
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
  margin-bottom: 0.5rem;
  font-weight: 600;
}

.tags-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.custom-chip.colored-chip {
  background-color: transparent !important;
  background-image: none !important;
  color: var(--tag-color) !important;
  border: 1px solid var(--tag-color) !important;
  box-shadow: none !important;
  font-weight: 600;
}

.custom-chip.colored-chip:hover {
  background-color: rgba(255, 255, 255, 0.05) !important;
}

.empty-text {
  color: var(--text-muted);
  font-style: italic;
}

.rating-row {
  margin-top: 0.5rem;
}

.isbn-warning {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  margin-top: 0.4rem;
  color: #f59e0b;
  font-size: 0.8rem;
}

.community-section {
  border-top: 1px solid var(--border-color);
  padding-top: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.community-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0;
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
  font-weight: 600;
}

.community-summary {
  margin: 0;
  color: var(--text-primary);
}

.avg-rating .pi {
  color: #f5b301;
  font-size: 0.85rem;
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
  gap: 0.5rem;
}

.reader-list li {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  background: var(--bg-input);
  border-radius: 999px;
  padding: 0.3rem 0.75rem;
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

.also-have h4 {
  margin: 0.25rem 0 0.5rem;
  font-size: 0.85rem;
  color: var(--text-secondary);
  font-weight: 500;
}

.also-have li {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 1rem;
  padding: 0.35rem 0;
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
  display: flex;
  gap: 0.5rem;
  align-items: flex-start;
  margin: 0;
  font-size: 0.8rem;
  color: var(--text-secondary);
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
  .dialog-body {
    flex-direction: column;
  }

  .cover-section {
    max-width: 100%;
    height: 250px;
    border-bottom: 1px solid var(--border-color);
  }

  .details-section {
    padding: 1.5rem;
    gap: 1.5rem;
  }

  .dates-grid,
  .meta-grid {
    grid-template-columns: 1fr;
    gap: 1rem;
  }
}
</style>