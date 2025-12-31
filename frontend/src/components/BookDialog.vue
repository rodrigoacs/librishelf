<template>
  <Dialog
    v-model:visible="visible"
    :modal="true"
    :dismissableMask="true"
    @hide="closeDialog"
    class="modern-book-dialog"
    :breakpoints="{ '960px': '75vw', '640px': '95vw' }"
    :style="{ width: '900px', maxWidth: '95vw' }"
    :showHeader="false"
  >
    <div
      class="dialog-body"
      v-if="book"
    >
      <button
        class="close-btn"
        @click="visible = false"
      >
        <i class="pi pi-times"></i>
      </button>

      <div class="cover-section">
        <img
          :src="displayCoverUrl"
          class="blur-bg"
          aria-hidden="true"
        />

        <div class="image-container">
          <div
            class="cover-wrapper"
            :class="{ 'editable': isEditing }"
            @click="triggerFileInput"
          >
            <img
              :src="displayCoverUrl"
              @error="handleImageError"
              alt="Book Cover"
              class="main-cover"
            />

            <div
              v-if="isEditing"
              class="edit-overlay"
            >
              <i class="pi pi-camera"></i>
              <span>Alterar Capa</span>
            </div>
          </div>

          <input
            type="file"
            ref="fileInput"
            style="display: none"
            accept="image/*"
            @change="onFileSelected"
          />
        </div>
      </div>

      <div class="details-section">
        <div class="details-header">
          <div class="title-area">
            <input
              v-if="isEditing"
              v-model="book.title"
              class="modern-input title-input"
              placeholder="Book Title"
            />
            <h1
              v-else
              class="book-title"
            >{{ book.title || 'Sem título' }}</h1>

            <input
              v-if="isEditing"
              v-model="book.authors"
              class="modern-input author-input"
              placeholder="Author Names"
            />
            <h3
              v-else
              class="book-author"
            >{{ book.authors || 'Autor desconhecido' }}</h3>
          </div>

          <div class="actions-area">
            <Button
              v-if="!isEditing"
              icon="pi pi-pencil"
              class="p-button-rounded p-button-text p-button-secondary"
              v-tooltip.bottom="'Editar'"
              @click="editMode"
            />
            <div
              v-else
              class="edit-actions"
            >
              <Button
                icon="pi pi-times"
                class="p-button-rounded p-button-text p-button-secondary"
                @click="cancelEdit"
                :disabled="isSaving"
                v-tooltip.bottom="'Cancelar'"
              />
              <Button
                icon="pi pi-check"
                class="p-button-rounded btn-action-primary"
                @click="confirmSave"
                :loading="isSaving"
                v-tooltip.bottom="'Salvar'"
              />
            </div>
          </div>
        </div>

        <div class="details-content">
          <div class="info-group">
            <label>Tags</label>
            <div v-if="isEditing">
              <input
                v-model="book.tags"
                class="modern-input"
                placeholder="Ex: Sci-Fi, Tech"
              />
            </div>
            <div
              v-else
              class="tags-list"
            >
              <span
                v-if="!book.tags"
                class="empty-text"
              >Sem tags</span>
              <Chip
                v-for="tag in formatTags(book.tags)"
                :key="tag"
                :label="tag"
                class="custom-chip"
              />
            </div>
          </div>

          <div class="dates-grid">
            <div class="info-group">
              <label>Status de Leitura</label>
              <div class="date-input-wrapper">
                <i
                  class="pi"
                  :class="book.read_date ? 'pi-check-circle text-theme' : 'pi-circle text-gray'"
                ></i>
                <Calendar
                  v-model="book.read_date"
                  :disabled="!isEditing"
                  dateFormat="dd/mm/yy"
                  placeholder="Não lido"
                  class="modern-calendar"
                  :showIcon="false"
                />
              </div>
            </div>

            <div class="info-group">
              <label>Publicação</label>
              <div class="date-input-wrapper">
                <i class="pi pi-calendar text-gray"></i>
                <Calendar
                  v-model="book.pubdate"
                  :disabled="!isEditing"
                  dateFormat="dd/mm/yy"
                  placeholder="Data desc."
                  class="modern-calendar"
                  :showIcon="false"
                />
              </div>
            </div>
          </div>

          <div class="meta-grid">
            <div class="info-group">
              <label>Editora</label>
              <input
                v-model="book.publisher"
                :readonly="!isEditing"
                class="modern-input meta-input"
                :class="{ 'readonly': !isEditing }"
                placeholder="-"
              />
            </div>
            <div class="info-group">
              <label>ISBN</label>
              <input
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
import { ref, watch, defineProps, defineEmits, computed, onMounted } from 'vue'
import Chip from 'primevue/chip'
import Dialog from 'primevue/dialog'
import Calendar from 'primevue/calendar'
import Button from 'primevue/button'
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'
import api from '../services/api.js'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3050'

const props = defineProps({
  modelValue: Boolean,
  bookId: Number
})

const emits = defineEmits(['update:modelValue', 'refresh'])

const toast = useToast()
const confirm = useConfirm()

const visible = ref(props.modelValue)
const isEditing = ref(false)
const isSaving = ref(false)
const originalBookState = ref(null)

const fileInput = ref(null)
const selectedFile = ref(null)
const previewUrl = ref(null)
const cacheBuster = ref(Date.now())

const book = ref({
  title: 'Carregando...',
  authors: '',
  publisher: '',
  tags: '',
  isbn: '',
  read_date: null,
  pubdate: null
})

const displayCoverUrl = computed(() => {
  if (previewUrl.value) return previewUrl.value
  if (!props.bookId) return '/placeholder.png'
  return `${API_URL}/uploads/${props.bookId}.avif?t=${cacheBuster.value}`
})

function handleImageError(e) {
  if (e.target.dataset.errorHandled) return
  e.target.dataset.errorHandled = true
  e.target.src = "data:image/svg+xml;charset=UTF-8,%3Csvg%20width%3D%22300%22%20height%3D%22500%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Crect%20width%3D%22100%25%22%20height%3D%22100%25%22%20fill%3D%22%232a2a2a%22%2F%3E%3Ctext%20x%3D%2250%25%22%20y%3D%2250%25%22%20fill%3D%22%23aaaaaa%22%20text-anchor%3D%22middle%22%20font-family%3D%22sans-serif%22%20dy%3D%22.3em%22%3ENo%20Cover%3C%2Ftext%3E%3C%2Fsvg%3E"
}

function triggerFileInput() {
  if (isEditing.value && fileInput.value) {
    fileInput.value.click()
  }
}

function onFileSelected(event) {
  const file = event.target.files[0]
  if (file) {
    selectedFile.value = file
    previewUrl.value = URL.createObjectURL(file)
  }
}

function formatTags(tagsString) {
  if (!tagsString) return []
  return tagsString.split(',').map(t => t.trim()).filter(Boolean)
}

function isValidReadDate(dateString) {
  if (!dateString) return false
  if (dateString.startsWith('0101')) return false
  return true
}

function formatDateISO(date) {
  if (!date) return null
  const d = new Date(date)
  if (isNaN(d.getTime())) return null
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function editMode() {
  originalBookState.value = JSON.parse(JSON.stringify(book.value))
  if (book.value.read_date) originalBookState.value.read_date = book.value.read_date
  if (book.value.pubdate) originalBookState.value.pubdate = book.value.pubdate
  isEditing.value = true
}

function cancelEdit() {
  book.value = { ...originalBookState.value }
  selectedFile.value = null
  previewUrl.value = null
  isEditing.value = false
}

function closeDialog() {
  isEditing.value = false
  visible.value = false
}

function confirmSave() {
  confirm.require({
    message: 'Deseja salvar as alterações?',
    header: 'Confirmar',
    icon: 'pi pi-exclamation-circle',
    acceptClass: 'p-button-rounded btn-action-primary',
    rejectClass: 'p-button-text p-button-secondary',
    acceptLabel: 'Salvar',
    rejectLabel: 'Cancelar',
    accept: () => {
      saveBookDetails()
    }
  })
}

async function saveBookDetails() {
  isSaving.value = true

  try {
    const updatedBook = {
      title: book.value.title,
      authors: book.value.authors,
      publisher: book.value.publisher,
      tags: book.value.tags ? book.value.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
      isbn: book.value.isbn,
      pubdate: formatDateISO(book.value.pubdate),
      read_date: formatDateISO(book.value.read_date)
    }

    await api.updateBook(props.bookId, updatedBook)

    if (selectedFile.value) {
      const formData = new FormData()
      formData.append('coverImage', selectedFile.value)

      await api.updateCover(props.bookId, formData)

      cacheBuster.value = Date.now()
    }

    isEditing.value = false
    selectedFile.value = null
    previewUrl.value = null

    emits('refresh')
    toast.add({ severity: 'success', summary: 'Sucesso', detail: 'Alterações salvas.', life: 3000 })

  } catch (error) {
    console.error('Error updating book details:', error)
    toast.add({ severity: 'error', summary: 'Erro', detail: error.message || 'Falha ao atualizar.', life: 4000 })
  } finally {
    isSaving.value = false
  }
}

async function loadBookData() {
  if (!props.bookId) return

  previewUrl.value = null
  selectedFile.value = null

  try {
    const response = await api.getBookById(props.bookId)

    book.value.title = response.title || ''
    book.value.authors = response.authors || ''
    book.value.isbn = response.isbn || ''
    book.value.publisher = response.publisher_name || response.publisher || ''
    book.value.tags = response.tags || ''

    if (isValidReadDate(response.read_date)) {
      const d = new Date(response.read_date)
      book.value.read_date = new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
    } else {
      book.value.read_date = null
    }

    if (response.publication_date) {
      const d = new Date(response.publication_date)
      book.value.pubdate = new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
    } else {
      book.value.pubdate = null
    }

  } catch (error) {
    console.error('Erro ao buscar detalhes:', error)
    book.value.title = 'Erro ao carregar dados'
    toast.add({ severity: 'warn', summary: 'Atenção', detail: 'Não foi possível carregar os detalhes.', life: 3000 })
  }
}

watch(() => props.modelValue, (val) => visible.value = val)
watch(visible, (val) => emits('update:modelValue', val))

onMounted(() => {
  if (visible.value) loadBookData()
})
</script>

<style>
.p-dialog.modern-book-dialog {
  border: none !important;
  border-radius: 16px !important;
  overflow: hidden !important;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5) !important;
}

.modern-book-dialog .p-dialog-content {
  padding: 0 !important;
  background-color: #18181b;
}

.modern-book-dialog .p-dialog-header {
  display: none !important;
}

.p-confirm-dialog .p-dialog-content,
.p-confirm-dialog .p-dialog-header,
.p-confirm-dialog .p-dialog-footer {
  background-color: #18181b !important;
  color: #fff !important;
  border: none !important;
}

.p-confirm-dialog .p-confirm-dialog-message {
  color: #ccc;
}

.btn-action-primary {
  background-color: var(--main-color, #4caf50) !important;
  border-color: var(--main-color, #4caf50) !important;
  color: #000 !important;
}

.btn-action-primary:hover {
  filter: brightness(1.1) !important;
}
</style>

<style scoped>
.dialog-body {
  display: flex;
  flex-direction: row;
  min-height: 500px;
  position: relative;
  width: 100%;
}

.close-btn {
  position: absolute;
  top: 1rem;
  right: 1rem;
  z-index: 10;
  background: rgba(0, 0, 0, 0.5);
  border: none;
  border-radius: 50%;
  width: 32px;
  height: 32px;
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s;
}

.close-btn:hover {
  background: rgba(255, 255, 255, 0.2);
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
  background-color: #000;
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
  align-items: center;
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
  cursor: default;
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
  color: var(--main-color, #4caf50);
}

.edit-overlay span {
  font-weight: 600;
  text-transform: uppercase;
  font-size: 0.8rem;
  letter-spacing: 1px;
}

.details-section {
  flex: 1.5;
  padding: 2.5rem;
  background-color: #18181b;
  color: #f4f4f5;
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
}

.book-author {
  font-size: 1.2rem;
  color: #a1a1aa;
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
  background-color: #27272a;
  border-color: var(--main-color, #4caf50);
  outline: none;
}

.modern-input.readonly {
  padding: 0;
  cursor: default;
}

.title-input {
  font-size: 2rem;
  font-weight: 700;
}

.author-input {
  font-size: 1.2rem;
  color: #a1a1aa;
}

.details-content {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.info-group label {
  display: block;
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #71717a;
  margin-bottom: 0.5rem;
  font-weight: 600;
}

.tags-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.custom-chip {
  background-color: #27272a;
  color: #e4e4e7;
  font-weight: 500;
  border: 1px solid #3f3f46;
}

.empty-text {
  color: #52525b;
  font-style: italic;
}

.dates-grid,
.meta-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.5rem;
}

.date-input-wrapper {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  background-color: #27272a;
  padding: 0.5rem 1rem;
  border-radius: 8px;
}

.text-theme {
  color: var(--main-color, #4caf50);
  font-weight: bold;
}

.text-gray {
  color: #71717a;
}

:deep(.modern-calendar .p-inputtext) {
  background: transparent;
  border: none;
  color: #fff;
  padding: 0;
  font-size: 1rem;
  width: 100%;
}

:deep(.modern-calendar .p-inputtext:enabled:focus) {
  box-shadow: none;
}

.meta-input {
  background-color: #27272a;
  padding: 0.75rem;
  border-radius: 8px;
}

.meta-input.readonly {
  background-color: transparent;
  padding: 0;
}

@media (max-width: 768px) {
  .dialog-body {
    flex-direction: column;
  }

  .cover-section {
    max-width: 100%;
    height: 250px;
    border-bottom: 1px solid #27272a;
    padding: 0;
  }

  .image-container {
    padding: 1rem;
  }

  .main-cover {
    box-shadow: 0 5px 15px rgba(0, 0, 0, 0.5);
  }

  .details-section {
    padding: 1.5rem;
    gap: 1.5rem;
  }

  .book-title {
    font-size: 1.5rem;
  }

  .title-input {
    font-size: 1.5rem;
  }

  .dates-grid,
  .meta-grid {
    grid-template-columns: 1fr;
    gap: 1rem;
  }
}
</style>
