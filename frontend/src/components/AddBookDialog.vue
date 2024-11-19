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
          >
            <template #footer>
              <Button
                v-if="allowNewAuthor"
                label="Add New Author"
                icon="pi pi-plus"
                class="p-button-text"
                @click="addNewAuthor"
              />
            </template>
          </AutoComplete>
          <AutoComplete
            v-model="selectedPublisher"
            :suggestions="filteredPublishers"
            @complete="searchPublishers"
            placeholder="Publisher"
          >
            <template #footer>
              <Button
                v-if="allowNewPublisher"
                label="Add New Publisher"
                icon="pi pi-plus"
                class="p-button-text"
                @click="addNewPublisher"
              />
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
          />
          <Calendar
            v-model="newBook.readDate"
            placeholder="Read Date"
            showIcon
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
          :src="coverImagePreview || './src/assets/book-cover.png'"
          alt="Cover Preview"
        />
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
      />
    </div>
  </Dialog>
</template>

<script setup>
import { ref, watch } from 'vue'
import { defineProps, defineEmits } from 'vue'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Button from 'primevue/button'
import AutoComplete from 'primevue/autocomplete'
import Calendar from 'primevue/calendar'
import { fetchAuthors, fetchPublishers, addNewBook } from '../../../backend/src/services/api.js'

const props = defineProps({
  visible: Boolean,
  onSave: Function
})

const emit = defineEmits(['update:visible'])

const internalVisible = ref(props.visible)

const newBook = ref({
  title: '',
  author: '',
  publisher: '',
  isbn: '',
  pubDate: null,
  readDate: null,
  tags: '',
  coverImage: null
})

const coverImagePreview = ref('./src/assets/book-cover.png')
const fileInput = ref(null)

const selectedAuthor = ref(null)
const filteredAuthors = ref([])
const allowNewAuthor = ref(true)

const selectedPublisher = ref(null)
const filteredPublishers = ref([])
const allowNewPublisher = ref(true)

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

async function searchAuthors(event) {
  try {
    const query = event.query.trim()
    const publisherQuery = selectedPublisher.value ? selectedPublisher.value.trim() : ''
    const response = await fetchAuthors(publisherQuery)
    filteredAuthors.value = response.map(author => author.name).filter(name => name.toLowerCase().includes(query.toLowerCase()))
    allowNewAuthor.value = !filteredAuthors.value.includes(query)
  } catch (error) {
    console.error('Error fetching authors:', error)
  }
}

async function searchPublishers(event) {
  try {
    const query = event.query.trim()
    const authorQuery = selectedAuthor.value ? selectedAuthor.value.trim() : ''
    const response = await fetchPublishers(authorQuery)
    filteredPublishers.value = response.map(publisher => publisher.name).filter(name => name.toLowerCase().includes(query.toLowerCase()))
    allowNewPublisher.value = !filteredPublishers.value.includes(query)
  } catch (error) {
    console.error('Error fetching publishers:', error)
  }
}

function addNewAuthor() {
  selectedAuthor.value = selectedAuthor.value.trim()
  allowNewAuthor.value = false
}

function addNewPublisher() {
  selectedPublisher.value = selectedPublisher.value.trim()
  allowNewPublisher.value = false
}

function saveBook() {
  const formData = new FormData()

  formData.append('title', newBook.value.title)
  formData.append('author', selectedAuthor.value)
  formData.append('publisher', selectedPublisher.value)
  formData.append('isbn', newBook.value.isbn)

  if (newBook.value.pubDate) {
    formData.append('pubDate', newBook.value.pubDate.toISOString().split('T')[0])
  }
  if (newBook.value.readDate) {
    formData.append('readDate', newBook.value.readDate.toISOString().split('T')[0])
  }

  formData.append('tags', newBook.value.tags.split(',').map(tag => tag.trim()).join(','))

  if (newBook.value.coverImage) {
    formData.append('coverImage', newBook.value.coverImage)
  }

  addNewBook(formData)
    .then(() => {
      props.onSave()
      closeDialog()
      resetForm()
    })
    .catch(error => {
      console.error('Error adding new book:', error)
    })
}

function resetForm() {
  newBook.value = { title: '', author: '', publisher: '', isbn: '', pubDate: null, readDate: null, tags: '', coverImage: null }
  selectedAuthor.value = null
  selectedPublisher.value = null
  coverImagePreview.value = './src/assets/book-cover.png'
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

::v-deep .p-autocomplete-input {
  width: 100%;
}

.image-preview {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 40%;
  height: 420px;
  border: 1px solid #52525b;
}

.image-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  cursor: pointer;
}

.read-section {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.save-button {
  margin-top: 1rem;
  text-align: center;
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
  }
}

@media (max-width: 480px) {
  .form-fields {
    gap: 0.5rem;
  }

  .image-preview {
    height: 250px;
  }

  .save-button {
    width: 100%;
  }
}
</style>
