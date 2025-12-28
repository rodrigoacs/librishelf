<template>
  <Dialog
    v-model:visible="internalVisible"
    header="Add New Book"
    modal
    :closable="true"
    :style="{ width: '90%', maxWidth: '800px' }"
    @hide="closeDialog"
  >
    <div class="add-book-form">
      <div class="form-left">
        <div class="form-fields">
          <InputText
            v-model="newBook.title"
            placeholder="Title"
          />

          <AutoComplete
            v-model="selectedAuthor"
            :suggestions="filteredAuthors"
            @complete="searchAuthors"
            placeholder="Author"
            dropdown
          >
            <template #footer>
              <div
                class="p-2"
                v-if="allowNewAuthor"
              >
                <Button
                  label="Add New Author"
                  icon="pi pi-plus"
                  class="p-button-text p-button-sm"
                  @click="addNewAuthor"
                />
              </div>
            </template>
          </AutoComplete>

          <AutoComplete
            v-model="selectedPublisher"
            :suggestions="filteredPublishers"
            @complete="searchPublishers"
            placeholder="Publisher"
            dropdown
          >
            <template #footer>
              <div
                class="p-2"
                v-if="allowNewPublisher"
              >
                <Button
                  label="Add New Publisher"
                  icon="pi pi-plus"
                  class="p-button-text p-button-sm"
                  @click="addNewPublisher"
                />
              </div>
            </template>
          </AutoComplete>

          <InputText
            v-model="newBook.isbn"
            placeholder="ISBN"
          />

          <Calendar
            v-model="newBook.pubDate"
            placeholder="Publication Date"
            showIcon
            dateFormat="dd/mm/yy"
          />

          <Calendar
            v-model="newBook.readDate"
            placeholder="Read Date"
            showIcon
            dateFormat="dd/mm/yy"
          />

          <InputText
            v-model="newBook.tags"
            placeholder="Tags (comma-separated)"
          />
        </div>
      </div>

      <div
        class="image-preview"
        @click="triggerFileUpload"
      >
        <img
          :src="coverImagePreview || '/placeholder_cover.png'"
          alt="Cover Preview"
          @error="handleImageError"
        />
        <span
          v-if="!newBook.coverImage"
          class="upload-hint"
        >Click to upload cover</span>
      </div>

      <input
        type="file"
        ref="fileInput"
        @change="onCoverImageChange"
        accept="image/*"
        style="display: none;"
      />
    </div>

    <div class="save-button">
      <Button
        label="Save"
        icon="pi pi-check"
        @click="saveBook"
        class="p-button-success"
        :loading="isLoading"
      />
    </div>
  </Dialog>
</template>

<script setup>
import { ref, watch, defineProps, defineEmits } from 'vue'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Button from 'primevue/button'
import AutoComplete from 'primevue/autocomplete'
import Calendar from 'primevue/calendar'
import api from '../services/api.js'

const props = defineProps({
  visible: Boolean,
  onSave: Function
})

const emit = defineEmits(['update:visible'])

const internalVisible = ref(props.visible)
const isLoading = ref(false)

const newBook = ref({
  title: '',
  isbn: '',
  pubDate: null,
  readDate: null,
  tags: '',
  coverImage: null
})

const coverImagePreview = ref(null)
const fileInput = ref(null)

const selectedAuthor = ref(null)
const filteredAuthors = ref([])
const allowNewAuthor = ref(false)

const selectedPublisher = ref(null)
const filteredPublishers = ref([])
const allowNewPublisher = ref(false)

watch(() => props.visible, (newVal) => {
  internalVisible.value = newVal
})

function closeDialog() {
  emit('update:visible', false)
}

function triggerFileUpload() {
  fileInput.value.click()
}

function onCoverImageChange(event) {
  const file = event.target.files[0]
  if (file) {
    newBook.value.coverImage = file
    const reader = new FileReader()
    reader.onload = e => {
      coverImagePreview.value = e.target.result
    }
    reader.readAsDataURL(file)
  }
}

function handleImageError(e) {
  e.target.src = 'https://placehold.co/300x450?text=Upload+Cover'
}

async function searchAuthors(event) {
  try {
    const query = event.query.trim().toLowerCase()
    const publisherQuery = selectedPublisher.value ? selectedPublisher.value : ''

    const response = await api.getAuthors(publisherQuery)

    const allNames = response.map(a => a.name)

    filteredAuthors.value = allNames.filter(name =>
      name.toLowerCase().includes(query)
    )

    allowNewAuthor.value = query.length > 0 && !allNames.some(n => n.toLowerCase() === query)
  } catch (error) {
    console.error('Error fetching authors:', error)
  }
}

async function searchPublishers(event) {
  try {
    const query = event.query.trim().toLowerCase()
    const authorQuery = selectedAuthor.value ? selectedAuthor.value : ''

    const response = await api.getPublishers(authorQuery)
    const allNames = response.map(p => p.name)

    filteredPublishers.value = allNames.filter(name =>
      name.toLowerCase().includes(query)
    )

    allowNewPublisher.value = query.length > 0 && !allNames.some(n => n.toLowerCase() === query)
  } catch (error) {
    console.error('Error fetching publishers:', error)
  }
}

function addNewAuthor() {
  allowNewAuthor.value = false
}

function addNewPublisher() {
  allowNewPublisher.value = false
}

function formatDate(date) {
  if (!date) return null
  const d = new Date(date)
  const offset = d.getTimezoneOffset()
  const localDate = new Date(d.getTime() - (offset * 60 * 1000))
  return localDate.toISOString().split('T')[0]
}

async function saveBook() {
  isLoading.value = true

  try {
    const formData = new FormData()

    if (!newBook.value.title || !selectedAuthor.value) {
      alert('Title and Author are required.')
      isLoading.value = false
      return
    }

    formData.append('title', newBook.value.title)

    const authorName = typeof selectedAuthor.value === 'object' ? selectedAuthor.value.name : selectedAuthor.value
    const publisherName = typeof selectedPublisher.value === 'object' ? selectedPublisher.value.name : selectedPublisher.value

    formData.append('author', authorName || '')
    formData.append('publisher', publisherName || '')
    formData.append('isbn', newBook.value.isbn || '')

    if (newBook.value.pubDate) {
      formData.append('pubDate', formatDate(newBook.value.pubDate))
    }
    if (newBook.value.readDate) {
      formData.append('readDate', formatDate(newBook.value.readDate))
    }

    formData.append('tags', newBook.value.tags)

    if (newBook.value.coverImage) {
      formData.append('coverImage', newBook.value.coverImage)
    }

    await api.createBook(formData)

    if (props.onSave) props.onSave()
    closeDialog()
    resetForm()

  } catch (error) {
    console.error('Error adding new book:', error)
    alert('Erro ao salvar livro: ' + (error.message || 'Erro desconhecido'))
  } finally {
    isLoading.value = false
  }
}

function resetForm() {
  newBook.value = { title: '', isbn: '', pubDate: null, readDate: null, tags: '', coverImage: null }
  selectedAuthor.value = null
  selectedPublisher.value = null
  coverImagePreview.value = null
}
</script>

<style scoped>
.add-book-form {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
}

.form-left {
  flex: 1;
}

.form-fields {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  width: 100%;
  max-width: 400px;
}

:deep(.p-autocomplete),
:deep(.p-autocomplete-input) {
  width: 100%;
}

.image-preview {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  width: 40%;
  height: 420px;
  border: 2px dashed #52525b;
  border-radius: 8px;
  position: relative;
  overflow: hidden;
  background-color: #1e1e1e;
}

.image-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  cursor: pointer;
}

.upload-hint {
  position: absolute;
  color: #aaa;
  font-size: 0.8rem;
  pointer-events: none;
  background: rgba(0, 0, 0, 0.7);
  padding: 4px 8px;
  border-radius: 4px;
}

.save-button {
  margin-top: 1rem;
  text-align: right;
}

@media (max-width: 1024px) {
  .add-book-form {
    gap: 0.5rem;
  }

  .image-preview {
    height: 360px;
  }
}

@media (max-width: 768px) {
  .add-book-form {
    flex-direction: column;
    align-items: center;
    gap: 1rem;
  }

  .form-fields {
    max-width: 100%;
  }

  .image-preview {
    width: 100%;
    height: 300px;
  }

  .save-button {
    width: 100%;
    text-align: center;
  }
}
</style>
