<template>
  <Dialog
    v-model:visible="internalVisible"
    header="Add New Book"
    modal
    :closable="true"
    :style="{ width: '60vw' }"
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
            placeholder="Select or Add Author"
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
            placeholder="Select or Add Publisher"
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
            v-model="newBook.pubdate"
            placeholder="Publication Date"
            showIcon
          />
          <div class="image-upload">
            <label for="coverImage">Upload Book Cover</label>
            <input
              type="file"
              @change="onCoverImageChange"
              accept="image/*"
              id="coverImage"
            />
          </div>

          <!-- Alinhando read checkbox e read date lado a lado -->
          <div class="read-section">
            <div class="checkbox-wrapper">
              <Checkbox
                v-model="newBook.read"
                inputId="read"
                @change="onReadChange"
              >
                <template #icon>
                  <i
                    v-if="newBook.read"
                    style="color: var(--main-color);"
                    class="pi pi-bookmark-fill"
                  />
                  <i
                    v-else
                    style="color: var(--main-color);"
                    class="pi pi-bookmark"
                  />
                </template>
              </Checkbox>
            </div>

            <div v-if="newBook.read">
              <Calendar
                v-model="newBook.readDate"
                placeholder="Read Date"
                showIcon
              />
            </div>
          </div>

          <InputText
            v-model="newBook.tags"
            placeholder="Tags (comma-separated)"
          />
        </div>
      </div>

      <!-- Preview da imagem -->
      <div
        class="image-preview"
        v-if="coverImagePreview"
      >
        <img
          :src="coverImagePreview"
          alt="Cover Preview"
        />
      </div>
    </div>

    <!-- Botão de salvar -->
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
import { fetchAuthors, fetchPublishers } from '../../../backend/src/services/api.js'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Button from 'primevue/button'
import AutoComplete from 'primevue/autocomplete'
import Calendar from 'primevue/calendar'
import Checkbox from 'primevue/checkbox'

const props = defineProps({
  visible: Boolean,
  onSave: Function
})

const emit = defineEmits(['update:visible'])

const internalVisible = ref(props.visible)

watch(() => props.visible, (newVal) => {
  internalVisible.value = newVal
})

function closeDialog() {
  emit('update:visible', false)
}

const newBook = ref({
  title: '',
  author: '',
  publisher: '',
  isbn: '',
  pubdate: null,
  read: false,
  readDate: null,
  tags: '',
  coverImage: null // Armazena a imagem de capa
})

const coverImagePreview = ref(null)

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

const selectedAuthor = ref(null)
const filteredAuthors = ref([])
const allowNewAuthor = ref(true)

const selectedPublisher = ref(null)
const filteredPublishers = ref([])
const allowNewPublisher = ref(true)

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

function onReadChange() {
  if (!newBook.value.read) {
    newBook.value.readDate = null
  }
}

function saveBook() {
  if (newBook.value.title && selectedAuthor.value && selectedPublisher.value && newBook.value.isbn) {
    newBook.value.author = selectedAuthor.value
    newBook.value.publisher = selectedPublisher.value
    newBook.value.tags = newBook.value.tags.split(',').map(tag => tag.trim()) // Converte tags separadas por vírgula
    props.onSave(newBook.value)
    resetForm()
    closeDialog()
  }
}

function resetForm() {
  newBook.value = { title: '', author: '', publisher: '', isbn: '', pubdate: null, read: false, readDate: null, tags: '', coverImage: null }
  selectedAuthor.value = null
  selectedPublisher.value = null
  coverImagePreview.value = null
}
</script>

<style scoped>
.add-book-form {
  display: flex;
  justify-content: space-between;
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

.form-fields input,
.form-fields .p-autocomplete,
.form-fields .p-calendar,
.form-fields .p-inputtext,
.p-autocomplete-panel input,
.p-autocomplete-panel .p-inputtext,
.p-autocomplete .p-component,
.p-inputwrapper input {
  width: 100%;
  max-width: 400px;
}

.image-preview {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 40%;
}

.image-preview img {
  max-height: 40vh;
  max-width: 100%;
  object-fit: contain;
}

.read-section {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.save-button {
  margin-top: 1rem;
  text-align: right;
}

.image-upload label {
  font-weight: bold;
}

.image-upload input {
  width: 100%;
  max-width: 400px;
}
</style>
