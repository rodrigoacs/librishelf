<template>
  <Dialog
    v-model:visible="visible"
    :modal="true"
    :dismissableMask="true"
    class="modern-add-dialog"
    :breakpoints="{ '960px': '75vw', '640px': '95vw' }"
    :style="{ width: '900px', maxWidth: '95vw' }"
    :showHeader="false"
  >
    <div class="dialog-body">
      <button
        class="close-btn"
        @click="visible = false"
      >
        <i class="pi pi-times"></i>
      </button>

      <div class="cover-section">
        <img
          v-if="previewUrl"
          :src="previewUrl"
          class="blur-bg"
          aria-hidden="true"
          @error="handlePreviewError"
        />

        <div
          class="upload-container"
          @click="triggerFileInput"
        >
          <div
            v-if="previewUrl"
            class="preview-wrapper"
          >
            <img
              :src="previewUrl"
              class="cover-preview"
              @error="handlePreviewError"
            />
            <div class="change-overlay">
              <i class="pi pi-refresh"></i>
              <span>Trocar</span>
            </div>
          </div>

          <div
            v-else
            class="upload-placeholder"
          >
            <div class="icon-circle">
              <i class="pi pi-camera"></i>
            </div>
            <span class="upload-text">{{ t('book.add_cover') }}</span>
            <span class="upload-subtext">{{ t('book.click_select') }}</span>
          </div>

          <input
            type="file"
            ref="fileInput"
            accept="image/*"
            class="hidden-input"
            @change="onFileSelect"
          />
        </div>
      </div>

      <div class="form-section">
        <div class="form-header">
          <h2>{{ t('book.new_title') }}</h2>
          <p>{{ t('book.new_subtitle') }}</p>
        </div>

        <div class="form-content">
          <div class="input-group main-group">
            <input
              v-model="book.title"
              class="modern-input title-input"
              :placeholder="t('book.title_ph')"
              :class="{ 'error': submitted && !book.title }"
            />
            <small
              v-if="submitted && !book.title"
              class="error-msg"
            >{{ t('book.validation_title') }}</small>
          </div>

          <div class="input-group">
            <i class="pi pi-user input-icon"></i>
            <input
              v-model="book.author"
              class="modern-input"
              :placeholder="t('book.author_ph')"
            />
          </div>

          <div class="input-group">
            <i class="pi pi-tags input-icon"></i>
            <input
              v-model="book.tags"
              class="modern-input"
              :placeholder="t('book.tags_ph')"
            />
          </div>

          <div class="dates-grid">
            <div class="input-group">
              <label>{{ t('book.read_status') }}</label>
              <div class="date-wrapper">
                <i
                  class="pi"
                  :class="book.readDate ? 'pi-check-circle text-theme' : 'pi-circle text-gray'"
                ></i>
                <Calendar
                  v-model="book.readDate"
                  dateFormat="dd/mm/yy"
                  :placeholder="t('book.unread')"
                  class="modern-calendar"
                  :showIcon="false"
                />
              </div>
            </div>

            <div class="input-group">
              <label>{{ t('book.pub_date') }}</label>
              <div class="date-wrapper">
                <i class="pi pi-calendar text-gray"></i>
                <Calendar
                  v-model="book.pubDate"
                  dateFormat="dd/mm/yy"
                  :placeholder="t('book.pub_date')"
                  class="modern-calendar"
                  :showIcon="false"
                />
              </div>
            </div>
          </div>

          <div class="meta-grid">
            <div class="input-group">
              <label>{{ t('book.publisher') }}</label>
              <input
                v-model="book.publisher"
                class="modern-input meta-input"
                placeholder="-"
              />
            </div>
            <div class="input-group">
              <label>ISBN</label>
              <input
                v-model="book.isbn"
                class="modern-input meta-input"
                placeholder="-"
              />
            </div>
          </div>
        </div>

        <div class="form-footer">
          <Button
            :label="t('common.cancel')"
            class="p-button-text p-button-secondary"
            @click="visible = false"
          />
          <Button
            :label="t('common.new')"
            icon="pi pi-plus"
            class="btn-action-primary"
            @click="saveBook"
            :loading="loading"
          />
        </div>
      </div>
    </div>
  </Dialog>
</template>

<script setup>
import { ref, reactive, watch, defineProps, defineEmits } from 'vue'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import Calendar from 'primevue/calendar'
import { useToast } from 'primevue/usetoast'
import api from '../services/api.js'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const props = defineProps({
  visible: Boolean
})

const emit = defineEmits(['update:visible', 'save'])
const toast = useToast()

const visible = ref(props.visible)
const loading = ref(false)
const submitted = ref(false)
const fileInput = ref(null)
const previewUrl = ref(null)
const selectedFile = ref(null)

const initialBookState = {
  title: '',
  author: '',
  publisher: '',
  tags: '',
  isbn: '',
  readDate: null,
  pubDate: null
}

const book = reactive({ ...initialBookState })

watch(() => props.visible, (newVal) => {
  visible.value = newVal
  if (newVal) {
    resetForm()
  }
})

watch(visible, (newVal) => {
  emit('update:visible', newVal)
})

function resetForm() {
  Object.assign(book, initialBookState)
  selectedFile.value = null
  previewUrl.value = null
  submitted.value = false
}

function triggerFileInput() {
  fileInput.value.click()
}

function onFileSelect(event) {
  const file = event.target.files[0]
  if (file) {
    selectedFile.value = file
    previewUrl.value = URL.createObjectURL(file)
  }
}

function formatDateISO(date) {
  if (!date) return null
  const d = new Date(date)
  if (isNaN(d.getTime())) return null
  const offset = d.getTimezoneOffset()
  const localDate = new Date(d.getTime() - (offset * 60 * 1000))
  return localDate.toISOString().split('T')[0]
}

async function saveBook() {
  submitted.value = true

  if (!book.title.trim()) {
    toast.add({ severity: 'warn', summary: t('common.error'), detail: t('book.validation_title'), life: 3000 })
    return
  }

  loading.value = true

  try {
    const formData = new FormData()

    formData.append('title', book.title)
    formData.append('author', book.author || '')
    formData.append('publisher', book.publisher || '')
    formData.append('isbn', book.isbn || '')

    formData.append('tags', book.tags)

    if (book.pubDate) formData.append('pubDate', formatDateISO(book.pubDate))
    if (book.readDate) formData.append('readDate', formatDateISO(book.readDate))

    if (selectedFile.value) {
      formData.append('coverImage', selectedFile.value)
    }

    await api.createBook(formData)

    toast.add({ severity: 'success', summary: t('common.success'), detail: t('book.toast_added'), life: 3000 })
    emit('save')
    visible.value = false

  } catch (error) {
    console.error('Erro ao criar livro:', error)
    toast.add({ severity: 'error', summary: t('common.error'), detail: error.message || t('book.toast_error'), life: 4000 })
  } finally {
    loading.value = false
  }
}

function handlePreviewError(event) {
  const img = event.target
  if (img.src.startsWith('blob:')) return

  if (img.src.includes('.avif')) {
    img.src = img.src.replace('.avif', '.jpg')
  }
}
</script>

<style>
.p-dialog.modern-add-dialog {
  border: 1px solid var(--border-color) !important;
  border-radius: 16px !important;
  overflow: hidden !important;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5) !important;
  background-color: var(--bg-panel) !important;
}

.modern-add-dialog .p-dialog-content {
  padding: 0 !important;
  background-color: var(--bg-panel);
}

.modern-add-dialog .p-dialog-header {
  display: none !important;
}

.btn-action-primary {
  background-color: var(--main-color) !important;
  border-color: var(--main-color) !important;
  color: #000 !important;
  font-weight: 600 !important;
}

.btn-action-primary:hover {
  filter: brightness(1.1);
}
</style>

<style scoped>
.dialog-body {
  display: flex;
  flex-direction: row;
  min-height: 550px;
  width: 100%;
  position: relative;
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
  background-color: var(--bg-input);
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
  padding: 2rem;
}

.blur-bg {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  filter: blur(40px) brightness(0.4);
  z-index: 1;
  transform: scale(1.2);
}

.upload-container {
  width: 100%;
  max-width: 250px;
  aspect-ratio: 2/3;
  border-radius: 12px;
  border: 2px dashed var(--border-color);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.3s ease;
  position: relative;
  z-index: 2;
  background-color: rgba(24, 24, 27, 0.5);
}

.upload-container:hover {
  border-color: var(--main-color);
  background-color: rgba(var(--main-color-rgb), 0.1);
}

.upload-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  color: #a1a1aa;
}

.icon-circle {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  background-color: rgba(255, 255, 255, 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 1rem;
  transition: transform 0.2s;
}

.upload-container:hover .icon-circle {
  transform: scale(1.1);
  background-color: var(--main-color);
  color: #000;
}

.icon-circle i {
  font-size: 1.5rem;
}

.upload-text {
  font-weight: 600;
  font-size: 1rem;
  color: #e4e4e7;
}

.upload-subtext {
  font-size: 0.8rem;
  margin-top: 0.25rem;
}

.hidden-input {
  display: none;
}

.preview-wrapper {
  width: 100%;
  height: 100%;
  position: relative;
  border-radius: 10px;
  overflow: hidden;
}

.cover-preview {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.change-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.2s;
  color: white;
  gap: 0.5rem;
}

.preview-wrapper:hover .change-overlay {
  opacity: 1;
}

.form-section {
  flex: 1.5;
  padding: 3rem;
  background-color: var(--bg-panel);
  color: var(--text-primary);
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  max-height: 90vh;
}

.form-header {
  margin-bottom: 2rem;
}

.form-header h2 {
  font-size: 2rem;
  margin: 0 0 0.5rem 0;
  font-weight: 700;
  color: var(--text-primary);
}

.form-header p {
  margin: 0;
  color: var(--text-secondary);
  font-size: 1rem;
}

.form-content {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  flex: 1;
}

.input-group {
  position: relative;
  width: 100%;
}

.input-group label {
  display: block;
  font-size: 0.8rem;
  color: var(--text-muted);
  text-transform: uppercase;
  font-weight: 600;
  margin-bottom: 0.5rem;
  letter-spacing: 0.5px;
}

.input-icon {
  position: absolute;
  left: 1rem;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-muted);
}

.modern-input {
  width: 100%;
  background-color: var(--bg-input);
  border: 1px solid transparent;
  padding: 0.75rem 1rem;
  border-radius: 8px;
  color: var(--text-primary);
  font-family: inherit;
  font-size: 1rem;
  transition: all 0.2s;
}

.input-group:has(.input-icon) .modern-input {
  padding-left: 2.8rem;
}

.modern-input:focus {
  outline: none;
  border-color: var(--main-color);
  background-color: var(--bg-hover);
}

.modern-input::placeholder {
  color: var(--text-muted);
}

.title-input {
  font-size: 1.5rem;
  font-weight: 700;
  padding: 1rem;
  background-color: transparent;
  border-bottom: 2px solid var(--border-color);
  border-radius: 0;
}

.title-input:focus {
  background-color: transparent;
  border-bottom-color: var(--main-color);
}

.title-input.error {
  border-bottom-color: #ef4444;
}

.error-msg {
  color: #ef4444;
  font-size: 0.8rem;
  margin-top: 0.25rem;
  display: block;
}

.dates-grid,
.meta-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.5rem;
}

.date-wrapper {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  background-color: var(--bg-input);
  padding: 0.5rem 1rem;
  border-radius: 8px;
  border: 1px solid transparent;
  transition: border-color 0.2s;
}

.date-wrapper:focus-within {
  border-color: var(--main-color);
}

.text-theme {
  color: var(--main-color);
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

:deep(.modern-calendar .p-inputtext:enabled:focus) {
  box-shadow: none;
}

.form-footer {
  margin-top: 3rem;
  display: flex;
  justify-content: flex-end;
  gap: 1rem;
  padding-top: 1.5rem;
  border-top: 1px solid var(--border-color);
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
    padding: 2rem 1rem;
    height: auto;
  }

  .upload-container {
    max-width: 150px;
  }

  .form-section {
    padding: 1.5rem;
  }

  .form-header h2 {
    font-size: 1.5rem;
  }

  .dates-grid,
  .meta-grid {
    grid-template-columns: 1fr;
    gap: 1rem;
  }
}
</style>
