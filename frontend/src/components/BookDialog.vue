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
              <input
                id="book-edit-authors"
                v-model="book.authors"
                class="modern-input author-input"
                :placeholder="t('bookDialog.authorNames')"
                :aria-invalid="submitted && !book.authors.trim()"
              />
            </template>
            <template v-else>
              <h1 class="book-title">{{ loading ? t('bookDialog.loading') : (book.title || t('bookDialog.noTitle')) }}</h1>
              <h2 class="book-author">{{ book.authors || (loading ? '' : t('bookDialog.unknownAuthor')) }}</h2>
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
              />
            </div>
          </div>
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
  return { title: '', authors: '', publisher: '', tags: '', isbn: '', read_date: null, pubdate: null }
}

const book = ref(emptyBook())
let originalBook = null

const tagList = computed(() => {
  if (!book.value.tags) return []
  return book.value.tags.split(',').map(tag => tag.trim()).filter(Boolean)
})

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

  if (!book.value.authors.trim()) {
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
      authors: book.value.authors.trim(),
      publisher: book.value.publisher,
      tags: tagList.value,
      isbn: book.value.isbn,
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
    isbn: data.isbn || '',
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