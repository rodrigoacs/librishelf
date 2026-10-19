#!/usr/bin/env bash
# Librishelf — pacote 2 de 4: formulário de livro único
#
# Rode na raiz do repositório Librishelf, na branch fix/audit-2026-08, com
# o pacote anterior já commitado:   bash pacote-2-formulario-de-livro.sh
#
# O que faz: aplica o patch (git apply; se o editor tiver reformatado algum
# arquivo, tenta git apply --3way), roda os testes unitários do backend e o
# build do frontend, e mostra a mensagem de commit sugerida.
# Não commita nem faz push.
set -euo pipefail

ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || { echo "✗ Rode dentro do repositório do Librishelf."; exit 1; }
cd "$ROOT"
[ -d frontend ] && [ -d backend ] || { echo "✗ Não parece ser o repositório do Librishelf."; exit 1; }

BRANCH=$(git rev-parse --abbrev-ref HEAD)
[ "$BRANCH" = "fix/audit-2026-08" ] || echo "⚠ Branch atual: $BRANCH (esperado fix/audit-2026-08). Continuando."

FILES=(
  frontend/src/components/AddBookDialog.vue
  frontend/src/components/AuthorsInput.vue
  frontend/src/components/BookDialog.vue
  frontend/src/components/book/BookCommunity.vue
  frontend/src/components/book/BookEditForm.vue
  frontend/src/components/book/BookView.vue
  frontend/src/components/form/CoverDrop.vue
  frontend/src/components/form/DateField.vue
  frontend/src/components/form/FieldLabel.vue
  frontend/src/components/form/IconButton.vue
  frontend/src/components/form/PillButton.vue
  frontend/src/components/form/TextField.vue
  frontend/src/locales/en.json
  frontend/src/locales/pt.json
  frontend/src/utils/bookFormErrors.js
)

DIRTY=$(git status --porcelain -- "${FILES[@]}")
if [ -n "$DIRTY" ]; then
  echo "✗ Estes arquivos têm mudanças não commitadas; commite ou descarte antes:"
  echo "$DIRTY"
  exit 1
fi

PATCH_FILE=$(mktemp)
trap 'rm -f "$PATCH_FILE"' EXIT
cat > "$PATCH_FILE" <<'__LIBRISHELF_PATCH__'
diff --git a/frontend/src/components/AddBookDialog.vue b/frontend/src/components/AddBookDialog.vue
index a1bac0ab874a8dd81740b4d8cf95f4098c68d859..0c0ef343e9bc17105a4ae32270a3a07691ae1d89 100644
--- a/frontend/src/components/AddBookDialog.vue
+++ b/frontend/src/components/AddBookDialog.vue
@@ -2,991 +2,113 @@
   <Dialog
     v-model:visible="visible"
     :modal="true"
-    :dismissableMask="true"
-    class="modern-add-dialog"
-    :breakpoints="{ '960px': '75vw', '640px': '95vw' }"
-    :style="{ width: '900px', maxWidth: '95vw' }"
+    :dismissableMask="false"
+    class="book-form-dialog"
+    :style="{ width: '960px', maxWidth: 'calc(100vw - 2rem)' }"
     :showHeader="false"
     :aria-label="t('book.dialog_label')"
   >
-    <div class="dialog-body">
-      <button
-        type="button"
+    <div class="dialog-shell">
+      <IconButton
         class="close-btn"
-        :aria-label="t('common.close')"
+        icon="pi pi-times"
+        :label="t('common.close')"
         @click="visible = false"
-      >
-        <i
-          class="pi pi-times"
-          aria-hidden="true"
-        ></i>
-      </button>
-
-      <div class="cover-section">
-        <img
-          v-if="previewUrl"
-          :src="previewUrl"
-          class="blur-bg"
-          alt=""
-          aria-hidden="true"
-        />
-
-        <button
-          type="button"
-          class="upload-container"
-          :aria-label="t('book.select_cover')"
-          @click="fileInput?.click()"
-        >
-          <span
-            v-if="previewUrl"
-            class="preview-wrapper"
-          >
-            <img
-              :src="previewUrl"
-              class="cover-preview"
-              alt=""
-            />
-            <span
-              class="change-overlay"
-              aria-hidden="true"
-            >
-              <i class="pi pi-refresh"></i>
-              <span>{{ t('book.change') }}</span>
-            </span>
-          </span>
-
-          <span
-            v-else
-            class="upload-placeholder"
-          >
-            <span
-              class="icon-circle"
-              aria-hidden="true"
-            >
-              <i class="pi pi-camera"></i>
-            </span>
-            <span class="upload-text">{{ t('book.add_cover') }}</span>
-            <span class="upload-subtext">{{ t('book.click_select') }}</span>
-          </span>
-        </button>
-
-        <input
-          type="file"
-          ref="fileInput"
-          accept="image/*"
-          class="hidden-input"
-          tabindex="-1"
-          aria-hidden="true"
-          @change="onFileSelect"
-        />
-      </div>
-
-      <div class="form-section">
-        <div class="form-header">
-          <h2>{{ t('book.new_title') }}</h2>
-          <p>{{ t('book.new_subtitle') }}</p>
-        </div>
-
-        <form
-          class="form-content"
-          novalidate
-          @submit.prevent="saveBook"
-        >
-          <div class="isbn-lookup">
-            <label for="new-book-isbn">{{ t('book.isbn') }}</label>
-            <div class="isbn-row">
-              <input
-                id="new-book-isbn"
-                v-model="book.isbn"
-                class="modern-input meta-input"
-                :placeholder="t('isbn.placeholder')"
-                inputmode="numeric"
-                autocomplete="off"
-                aria-describedby="new-book-isbn-hint"
-                @keydown.enter.prevent="lookupIsbn"
-              />
-              <Button
-                type="button"
-                :label="t('isbn.search')"
-                icon="pi pi-search"
-                class="p-button-outlined isbn-btn"
-                :loading="lookingUp"
-                :disabled="!book.isbn.trim()"
-                @click="lookupIsbn"
-              />
-            </div>
-            <small
-              id="new-book-isbn-hint"
-              class="isbn-hint"
-              :class="{ found: lookupState === 'found', missing: lookupState === 'missing' }"
-              aria-live="polite"
-            >{{ lookupMessage }}</small>
-          </div>
-
-          <div class="input-group main-group">
-            <label
-              for="new-book-title"
-              class="sr-only"
-            >{{ t('book.title_ph') }}</label>
-            <input
-              id="new-book-title"
-              v-model="book.title"
-              class="modern-input title-input"
-              :placeholder="t('book.title_ph')"
-              :class="{ 'error': submitted && !book.title.trim() }"
-              :aria-invalid="submitted && !book.title.trim()"
-              aria-describedby="new-book-title-error"
-              required
-            />
-            <small
-              v-if="submitted && !book.title.trim()"
-              id="new-book-title-error"
-              class="error-msg"
-            >{{ t('book.validation_title') }}</small>
-          </div>
-
-          <div class="input-group">
-            <label
-              for="new-book-authors"
-              class="sr-only"
-            >{{ t('book.author_ph') }}</label>
-            <AuthorsInput
-              v-model="book.authors"
-              input-id="new-book-authors"
-              :placeholder="`${t('book.author_ph')} *`"
-              :invalid="submitted && book.authors.length === 0"
-            />
-            <small
-              v-if="submitted && book.authors.length === 0"
-              id="new-book-authors-error"
-              class="error-msg"
-            >{{ t('book.validation_authors') }}</small>
-          </div>
-
-          <div class="input-group">
-            <i
-              class="pi pi-tags input-icon"
-              aria-hidden="true"
-            ></i>
-            <label
-              for="new-book-tags"
-              class="sr-only"
-            >{{ t('book.tags_ph') }}</label>
-            <input
-              id="new-book-tags"
-              v-model="book.tags"
-              class="modern-input"
-              :placeholder="t('book.tags_ph')"
-            />
-          </div>
-
-          <div class="series-grid">
-            <div class="input-group">
-              <label for="new-book-series">{{ t('series.name') }}</label>
-              <input
-                id="new-book-series"
-                v-model="book.series"
-                class="modern-input meta-input"
-                list="new-book-series-options"
-                maxlength="200"
-                autocomplete="off"
-                :placeholder="t('series.namePlaceholder')"
-                @focus="loadSeriesOptions"
-              />
-              <datalist id="new-book-series-options">
-                <option
-                  v-for="item in seriesOptions"
-                  :key="item.name"
-                  :value="item.name"
-                ></option>
-              </datalist>
-            </div>
-            <div class="input-group">
-              <label for="new-book-series-index">{{ t('series.volume') }}</label>
-              <input
-                id="new-book-series-index"
-                v-model="book.seriesIndex"
-                class="modern-input meta-input"
-                inputmode="decimal"
-                maxlength="7"
-                autocomplete="off"
-                placeholder="-"
-              />
-            </div>
-          </div>
-
-          <div class="dates-grid">
-            <div class="input-group">
-              <label for="new-book-read-date">{{ t('book.read_status') }}</label>
-              <div class="date-wrapper">
-                <i
-                  class="pi"
-                  :class="book.readDate ? 'pi-check-circle text-theme' : 'pi-circle text-gray'"
-                  aria-hidden="true"
-                ></i>
-                <Calendar
-                  inputId="new-book-read-date"
-                  v-model="book.readDate"
-                  :maxDate="today"
-                  dateFormat="dd/mm/yy"
-                  :placeholder="t('book.unread')"
-                  class="modern-calendar"
-                  :showIcon="false"
-                  showButtonBar
-                />
-              </div>
-            </div>
-
-            <div class="input-group">
-              <label for="new-book-pub-date">{{ t('book.pub_date') }}</label>
-              <div class="date-wrapper">
-                <i
-                  class="pi pi-calendar text-gray"
-                  aria-hidden="true"
-                ></i>
-                <Calendar
-                  inputId="new-book-pub-date"
-                  v-model="book.pubDate"
-                  dateFormat="dd/mm/yy"
-                  :placeholder="t('book.pub_date')"
-                  class="modern-calendar"
-                  :showIcon="false"
-                  showButtonBar
-                />
-              </div>
-            </div>
-          </div>
-
-          <div class="meta-grid">
-            <div class="input-group">
-              <label for="new-book-publisher">{{ t('book.publisher') }}</label>
-              <input
-                id="new-book-publisher"
-                v-model="book.publisher"
-                class="modern-input meta-input"
-                placeholder="-"
-              />
-            </div>
-            <div class="input-group">
-              <span
-                id="new-book-rating-label"
-                class="group-label"
-              >{{ t('rating.label') }}</span>
-              <StarRating
-                v-model="book.rating"
-                size="lg"
-                :label="t('rating.label')"
-              />
-            </div>
-          </div>
-
-          <div class="form-footer">
-            <Button
-              type="button"
-              :label="t('common.cancel')"
-              class="p-button-text p-button-secondary"
-              @click="visible = false"
-            />
-            <Button
-              type="submit"
-              :label="t('common.new')"
-              icon="pi pi-plus"
-              class="btn-action-primary"
-              :loading="loading"
-            />
-          </div>
-        </form>
-      </div>
+      />
+      <BookEditForm
+        v-if="visible"
+        :key="formKey"
+        mode="create"
+        id-prefix="new-book"
+        @saved="onSaved"
+        @cancel="visible = false"
+      />
     </div>
   </Dialog>
 </template>
 
 <script setup>
-import { ref, reactive, computed, watch, onBeforeUnmount } from 'vue'
+import { ref, watch } from 'vue'
 import Dialog from 'primevue/dialog'
-import Button from 'primevue/button'
-import Calendar from 'primevue/calendar'
-import { useToast } from 'primevue/usetoast'
-import api from '../services/api.js'
-import AuthorsInput from './AuthorsInput.vue'
-import StarRating from './StarRating.vue'
 import { useI18n } from 'vue-i18n'
-import { toApiDate } from '../utils/dates.js'
-import { validateImageFile, createPreviewHandle } from '../utils/files.js'
+import BookEditForm from './book/BookEditForm.vue'
+import IconButton from './form/IconButton.vue'
 
 const { t } = useI18n()
 
-// Data de leitura não pode estar no futuro (o servidor também recusa).
-const today = new Date()
-
 const props = defineProps({
   visible: Boolean
 })
 
 const emit = defineEmits(['update:visible', 'save'])
-const toast = useToast()
 
 const visible = ref(props.visible)
-const loading = ref(false)
-const submitted = ref(false)
-const fileInput = ref(null)
-const previewUrl = ref(null)
-const selectedFile = ref(null)
-const preview = createPreviewHandle()
+// Formulário novo a cada abertura
+const formKey = ref(0)
 
-const initialBookState = {
-  title: '',
-  authors: [],
-  publisher: '',
-  tags: '',
-  isbn: '',
-  readDate: null,
-  pubDate: null,
-  rating: null,
-  series: '',
-  seriesIndex: ''
-}
-
-// Séries já usadas, para autocompletar (carrega na primeira vez que o campo recebe foco).
-const seriesOptions = ref([])
-async function loadSeriesOptions() {
-  if (seriesOptions.value.length) return
-  try {
-    seriesOptions.value = await api.getSeries()
-  } catch {
-    seriesOptions.value = []
-  }
-}
-
-// Resultado da busca por ISBN: as chaves do Open Library só valem para o ISBN
-// buscado; se a pessoa trocar o ISBN depois, elas não são enviadas.
-const lookup = reactive({ isbn: null, olWorkKey: null, olEditionKey: null, coverId: null })
-const lookingUp = ref(false)
-const lookupState = ref('idle') // idle | found | missing | error
-
-const lookupMessage = computed(() => {
-  if (lookupState.value === 'found') return t('isbn.found')
-  if (lookupState.value === 'missing') return t('isbn.not_found')
-  if (lookupState.value === 'error') return t('isbn.error')
-  return t('isbn.hint')
-})
-
-const book = reactive({ ...initialBookState })
-
-watch(() => props.visible, (newVal) => {
-  visible.value = newVal
-  if (newVal) resetForm()
-})
-
-watch(visible, (newVal) => {
-  emit('update:visible', newVal)
-  if (!newVal) preview.clear()
+watch(() => props.visible, value => {
+  visible.value = value
+  if (value) formKey.value++
 })
 
-function resetForm() {
-  Object.assign(book, { ...initialBookState, authors: [] })
-  selectedFile.value = null
-  previewUrl.value = null
-  preview.clear()
-  submitted.value = false
-  clearLookup()
-  lookupState.value = 'idle'
-}
-
-function clearLookup() {
-  Object.assign(lookup, { isbn: null, olWorkKey: null, olEditionKey: null, coverId: null })
-  if (!selectedFile.value) previewUrl.value = null
-}
+watch(visible, value => emit('update:visible', value))
 
-function parseApiDate(value) {
-  if (!value) return null
-  const [year, month, day] = value.split('-').map(Number)
-  return new Date(year, month - 1, day)
+function onSaved(result) {
+  emit('save', result)
+  visible.value = false
 }
-
-// Preenche só os campos vazios: o que a pessoa já digitou tem prioridade.
-async function lookupIsbn() {
-  const isbn = book.isbn.trim()
-  if (!isbn || lookingUp.value) return
-
-  lookingUp.value = true
-  try {
-    const found = await api.lookupIsbn(isbn)
-
-    if (!book.title.trim() && found.title) book.title = found.title
-    if (book.authors.length === 0 && found.authors?.length) book.authors = [...found.authors]
-    if (!book.publisher.trim() && found.publisher) book.publisher = found.publisher
-    if (!book.pubDate && found.pubDate) book.pubDate = parseApiDate(found.pubDate)
-
-    Object.assign(lookup, {
-      isbn,
-      olWorkKey: found.olWorkKey,
-      olEditionKey: found.olEditionKey,
-      coverId: found.coverId
-    })
-
-    if (!selectedFile.value && found.coverId) {
-      previewUrl.value = api.isbnCoverUrl(found.coverId)
-    }
-
-    lookupState.value = 'found'
-  } catch (error) {
-    clearLookup()
-    if (error.status === 404) {
-      lookupState.value = 'missing'
-    } else if (error.status === 400) {
-      lookupState.value = 'idle'
-      toast.add({ severity: 'warn', summary: t('common.error'), detail: t('isbn.invalid'), life: 4000 })
-    } else {
-      lookupState.value = 'error'
-    }
-  } finally {
-    lookingUp.value = false
-  }
-}
-
-watch(() => book.isbn, (value) => {
-  if (lookup.isbn && value.trim() !== lookup.isbn) {
-    clearLookup()
-    lookupState.value = 'idle'
-  }
-})
-
-function onFileSelect(event) {
-  const file = event.target.files[0]
-  event.target.value = ''
-  if (!file) return
-
-  const problem = validateImageFile(file)
-  if (problem) {
-    toast.add({ severity: 'warn', summary: t('common.error'), detail: t(problem.key, problem.params || {}), life: 4000 })
-    return
-  }
-
-  selectedFile.value = file
-  previewUrl.value = preview.set(file)
-  lookup.coverId = null
-}
-
-async function saveBook() {
-  submitted.value = true
-
-  if (!book.title.trim()) {
-    toast.add({ severity: 'warn', summary: t('common.error'), detail: t('book.validation_title'), life: 3000 })
-    return
-  }
-
-  if (book.authors.length === 0) {
-    toast.add({ severity: 'warn', summary: t('common.error'), detail: t('book.validation_authors'), life: 3000 })
-    return
-  }
-
-  loading.value = true
-
-  try {
-    const formData = new FormData()
-
-    formData.append('title', book.title.trim())
-    // Um campo "authors" por autor: nomes podem conter vírgula.
-    book.authors.forEach(name => formData.append('authors', name))
-    formData.append('publisher', book.publisher || '')
-    formData.append('isbn', book.isbn || '')
-    formData.append('tags', book.tags || '')
-
-    if (book.pubDate) formData.append('pubDate', toApiDate(book.pubDate))
-    if (book.readDate) formData.append('readDate', toApiDate(book.readDate))
-    if (book.rating) formData.append('rating', String(book.rating))
-    if (book.series?.trim()) formData.append('series', book.series.trim())
-    if (String(book.seriesIndex ?? '').trim()) formData.append('seriesIndex', String(book.seriesIndex).trim())
-
-    if (lookup.isbn && lookup.isbn === book.isbn.trim()) {
-      if (lookup.olWorkKey) formData.append('olWorkKey', lookup.olWorkKey)
-      if (lookup.olEditionKey) formData.append('olEditionKey', lookup.olEditionKey)
-      if (!selectedFile.value && lookup.coverId) formData.append('olCoverId', String(lookup.coverId))
-    }
-
-    if (selectedFile.value) {
-      formData.append('coverImage', selectedFile.value)
-    }
-
-    const result = await api.createBook(formData)
-
-    const expectedCover = selectedFile.value || formData.has('olCoverId')
-    if (expectedCover && result?.coverSaved === false) {
-      toast.add({ severity: 'warn', summary: t('common.success'), detail: t('book.cover_not_saved'), life: 6000 })
-    } else {
-      toast.add({ severity: 'success', summary: t('common.success'), detail: t('book.toast_added'), life: 3000 })
-    }
-
-    emit('save', result)
-    visible.value = false
-  } catch (error) {
-    toast.add({ severity: 'error', summary: t('common.error'), detail: error.message || t('book.toast_error'), life: 4000 })
-  } finally {
-    loading.value = false
-  }
-}
-
-onBeforeUnmount(() => preview.clear())
 </script>
 
 <style>
-.p-dialog.modern-add-dialog {
-  border: 1px solid var(--border-color) !important;
-  border-radius: 16px !important;
-  overflow: hidden !important;
-  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5) !important;
-  background-color: var(--bg-panel) !important;
-}
-
-.modern-add-dialog .p-dialog-content {
-  padding: 0 !important;
+/* Moldura dos diálogos de livro (Novo livro e o livro aberto) */
+.p-dialog.book-form-dialog {
+  border: 1px solid var(--border-color);
+  border-radius: 16px;
+  overflow: hidden;
+  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
   background-color: var(--bg-panel);
+  max-height: min(92vh, 860px);
 }
 
-.modern-add-dialog .p-dialog-header {
-  display: none !important;
-}
-
-.btn-action-primary {
-  background-color: var(--main-solid) !important;
-  border-color: var(--main-solid) !important;
-  color: var(--on-main) !important;
-  font-weight: 600 !important;
-}
-
-.btn-action-primary:hover {
-  filter: brightness(1.1);
-}
-</style>
-
-<style scoped>
-.dialog-body {
-  display: flex;
-  flex-direction: row;
-  min-height: 550px;
-  width: 100%;
-  position: relative;
+.book-form-dialog .p-dialog-content {
+  padding: 0;
   background-color: var(--bg-panel);
-}
-
-.close-btn {
-  position: absolute;
-  top: 1rem;
-  right: 1rem;
-  z-index: 10;
-  background: rgba(0, 0, 0, 0.2);
-  border: none;
-  border-radius: 50%;
-  width: 32px;
-  height: 32px;
-  color: var(--text-primary);
-  cursor: pointer;
-  display: flex;
-  align-items: center;
-  justify-content: center;
-  transition: background 0.2s;
-}
-
-.close-btn:hover {
-  background: rgba(var(--main-color-rgb), 0.2);
-  color: var(--main-color);
-}
-
-.cover-section {
-  flex: 1;
-  max-width: 350px;
-  background-color: var(--bg-input);
-  display: flex;
-  align-items: center;
-  justify-content: center;
-  position: relative;
   overflow: hidden;
-  padding: 2rem;
-}
-
-.blur-bg {
-  position: absolute;
-  top: 0;
-  left: 0;
-  width: 100%;
-  height: 100%;
-  object-fit: cover;
-  filter: blur(40px) brightness(0.4);
-  z-index: 1;
-  transform: scale(1.2);
-}
-
-button.upload-container {
-  border: none;
-  padding: 0;
-  background: none;
-  font: inherit;
-  color: inherit;
-  width: 100%;
-}
-
-.upload-container {
-  width: 100%;
-  max-width: 250px;
-  aspect-ratio: 2/3;
-  border-radius: 12px;
-  border: 2px dashed var(--border-color);
-  display: flex;
-  flex-direction: column;
-  align-items: center;
-  justify-content: center;
-  cursor: pointer;
-  transition: all 0.3s ease;
-  position: relative;
-  z-index: 2;
-  background-color: rgba(24, 24, 27, 0.5);
-}
-
-.upload-container:hover {
-  border-color: var(--main-color);
-  background-color: rgba(var(--main-color-rgb), 0.1);
-}
-
-.upload-placeholder {
   display: flex;
   flex-direction: column;
-  align-items: center;
-  color: #a1a1aa;
-}
-
-.icon-circle {
-  width: 60px;
-  height: 60px;
-  border-radius: 50%;
-  background-color: rgba(255, 255, 255, 0.1);
-  display: flex;
-  align-items: center;
-  justify-content: center;
-  margin-bottom: 1rem;
-  transition: transform 0.2s;
-}
-
-.upload-container:hover .icon-circle {
-  transform: scale(1.1);
-  background-color: var(--main-solid);
-  color: var(--on-main);
-}
-
-.icon-circle i {
-  font-size: var(--fs-xl);
-}
-
-.upload-text,
-.upload-subtext {
-  display: block;
-}
-
-.upload-text {
-  font-weight: 600;
-  font-size: var(--fs-md);
-  color: #e4e4e7;
-}
-
-.upload-subtext {
-  font-size: var(--fs-sm);
-  margin-top: 0.25rem;
 }
 
-.hidden-input {
-  display: none;
+@media (max-width: 768px) {
+  .p-dialog.book-form-dialog {
+    max-height: calc(100dvh - 2rem);
+  }
 }
+</style>
 
-.preview-wrapper {
-  display: block;
-  width: 100%;
-  height: 100%;
+<style scoped>
+.dialog-shell {
   position: relative;
-  border-radius: 10px;
-  overflow: hidden;
-}
-
-.cover-preview {
-  width: 100%;
-  height: 100%;
-  object-fit: cover;
-}
-
-.change-overlay {
-  position: absolute;
-  inset: 0;
-  background: rgba(0, 0, 0, 0.6);
-  display: flex;
-  flex-direction: column;
-  align-items: center;
-  justify-content: center;
-  opacity: 0;
-  transition: opacity 0.2s;
-  color: white;
-  gap: 0.5rem;
-}
-
-.upload-container:focus-visible .change-overlay,
-.preview-wrapper:hover .change-overlay {
-  opacity: 1;
-}
-
-.form-section {
-  flex: 1.5;
-  padding: 3rem;
-  background-color: var(--bg-panel);
-  color: var(--text-primary);
   display: flex;
   flex-direction: column;
-  overflow-y: auto;
-  max-height: 90vh;
-}
-
-.form-header {
-  margin-bottom: 2rem;
-}
-
-.form-header h2 {
-  font-size: var(--fs-2xl);
-  margin: 0 0 0.5rem 0;
-  font-weight: 700;
-  color: var(--text-primary);
-}
-
-.form-header p {
-  margin: 0;
-  color: var(--text-secondary);
-  font-size: var(--fs-md);
+  min-height: 0;
+  max-height: min(92vh, 860px);
 }
 
-.form-content {
-  display: flex;
-  flex-direction: column;
-  gap: 1.5rem;
-  flex: 1;
-}
-
-.input-group {
-  position: relative;
-  width: 100%;
-}
-
-.input-group label {
-  display: block;
-  font-size: var(--fs-sm);
-  color: var(--text-muted);
-  text-transform: uppercase;
-  font-weight: 600;
-  margin-bottom: 0.5rem;
-  letter-spacing: 0.5px;
-}
-
-.input-icon {
+.close-btn {
   position: absolute;
-  left: 1rem;
-  top: 50%;
-  transform: translateY(-50%);
-  color: var(--text-muted);
-}
-
-.modern-input {
-  width: 100%;
-  background-color: var(--bg-input);
-  border: 1px solid transparent;
-  padding: 0.75rem 1rem;
-  border-radius: 8px;
-  color: var(--text-primary);
-  font-family: inherit;
-  font-size: var(--fs-md);
-  transition: all 0.2s;
-}
-
-.input-group:has(.input-icon) .modern-input {
-  padding-left: 2.8rem;
-}
-
-.modern-input:focus {
-  outline: none;
-  border-color: var(--main-color);
-  background-color: var(--bg-hover);
-}
-
-.modern-input::placeholder {
-  color: var(--text-muted);
-}
-
-.title-input {
-  font-size: var(--fs-xl);
-  font-weight: 700;
-  padding: 1rem;
-  background-color: transparent;
-  border-bottom: 2px solid var(--border-color);
-  border-radius: 0;
-}
-
-.title-input:focus {
-  background-color: transparent;
-  border-bottom-color: var(--main-color);
-}
-
-.title-input.error {
-  border-bottom-color: #ef4444;
-}
-
-.error-msg {
-  color: #ef4444;
-  font-size: var(--fs-sm);
-  margin-top: 0.25rem;
-  display: block;
-}
-
-.dates-grid,
-.isbn-lookup {
-  display: flex;
-  flex-direction: column;
-  gap: 0.4rem;
-}
-
-.isbn-lookup label,
-.group-label {
-  display: block;
-  font-size: var(--fs-sm);
-  color: var(--text-muted);
-  text-transform: uppercase;
-  font-weight: 600;
-  letter-spacing: 0.5px;
-}
-
-.group-label {
-  margin-bottom: 0.5rem;
-}
-
-.isbn-row {
-  display: flex;
-  gap: 0.5rem;
-}
-
-.isbn-row .modern-input {
-  flex: 1;
-  min-width: 0;
-}
-
-.isbn-btn {
-  flex-shrink: 0;
-}
-
-.isbn-hint {
-  font-size: var(--fs-xs);
-  color: var(--text-secondary);
-}
-
-.isbn-hint.found {
-  color: var(--main-color);
-}
-
-.isbn-hint.missing {
-  color: #f59e0b;
-}
-
-.meta-grid {
-  display: grid;
-  grid-template-columns: 1fr 1fr;
-  gap: 1.5rem;
-}
-
-.series-grid {
-  display: grid;
-  grid-template-columns: minmax(0, 1fr) 6.5rem;
-  gap: 1rem;
-}
-
-.date-wrapper {
-  display: flex;
-  align-items: center;
-  gap: 0.75rem;
-  background-color: var(--bg-input);
-  padding: 0.5rem 1rem;
-  border-radius: 8px;
-  border: 1px solid transparent;
-  transition: border-color 0.2s;
-}
-
-.date-wrapper:focus-within {
-  border-color: var(--main-color);
-}
-
-.text-theme {
-  color: var(--main-color);
-}
-
-.text-gray {
-  color: var(--text-muted);
-}
-
-:deep(.modern-calendar .p-inputtext) {
-  background: transparent;
-  border: none;
-  color: var(--text-primary);
-  padding: 0;
-  font-size: var(--fs-md);
-  width: 100%;
-}
-
-:deep(.modern-calendar .p-inputtext:enabled:focus) {
-  box-shadow: none;
-}
-
-.form-footer {
-  margin-top: 3rem;
-  display: flex;
-  justify-content: flex-end;
-  gap: 1rem;
-  padding-top: 1.5rem;
-  border-top: 1px solid var(--border-color);
-}
-
-.p-button.p-button-secondary.p-button-text {
-  color: var(--text-secondary) !important;
-}
-
-.p-button.p-button-secondary.p-button-text:hover {
-  color: var(--text-primary) !important;
-  background-color: var(--bg-hover) !important;
+  top: 1rem;
+  right: 1rem;
+  z-index: 10;
 }
 
 @media (max-width: 768px) {
-  .dialog-body {
-    flex-direction: column;
-    min-height: 0;
+  .dialog-shell {
     max-height: calc(100dvh - 2rem);
   }
 
-  .cover-section {
-    flex: none;
-    max-width: 100%;
-    padding: 1rem;
-    height: auto;
-  }
-
-  .upload-container {
-    max-width: 110px;
-  }
-
-  .form-section {
-    flex: 1;
-    min-height: 0;
-    max-height: none;
-    padding: 1.25rem;
-  }
-
-  .form-header h2 {
-    font-size: var(--fs-xl);
-  }
-
-  .dates-grid,
-  .meta-grid {
-    grid-template-columns: 1fr;
-    gap: 1rem;
+  .close-btn {
+    top: 0.75rem;
+    right: 0.75rem;
   }
 }
-</style>
\ No newline at end of file
+</style>
diff --git a/frontend/src/components/AuthorsInput.vue b/frontend/src/components/AuthorsInput.vue
index 28f6535feb18b3d3bdc5a22168b17963a31a3467..521478c92c407919414aa6282396e1e2d0da8ff1 100644
--- a/frontend/src/components/AuthorsInput.vue
+++ b/frontend/src/components/AuthorsInput.vue
@@ -1,47 +1,75 @@
 <template>
   <div
     class="authors-input"
-    :class="{ invalid }"
+    :class="{ invalid: Boolean(error), floated: focused || modelValue.length > 0 }"
   >
-    <Chips
-      :modelValue="modelValue"
-      :inputId="inputId"
-      :placeholder="modelValue.length ? '' : placeholder"
-      :allowDuplicate="false"
-      addOnBlur
-      :max="maxAuthors"
-      :aria-invalid="invalid || undefined"
-      :aria-describedby="`${inputId}-hint`"
-      @update:modelValue="onUpdate"
-    />
+    <div class="field-box">
+      <Chips
+        :modelValue="modelValue"
+        :inputId="inputId"
+        :allowDuplicate="false"
+        addOnBlur
+        :max="maxAuthors"
+        :aria-invalid="error ? 'true' : undefined"
+        :aria-describedby="describedBy"
+        @update:modelValue="onUpdate"
+        @focus="focused = true"
+        @blur="focused = false"
+      />
+      <label
+        :for="inputId"
+        class="field-label"
+      >{{ label }}<span
+          v-if="required"
+          class="required-mark"
+          aria-hidden="true"
+        > *</span></label>
+    </div>
+    <small
+      v-if="error"
+      :id="`${inputId}-error`"
+      class="field-error"
+    >
+      <i
+        class="pi pi-exclamation-circle"
+        aria-hidden="true"
+      ></i>
+      {{ error }}
+    </small>
     <small
       :id="`${inputId}-hint`"
-      class="authors-hint"
+      class="field-hint"
     >{{ t('book.authors_hint') }}</small>
   </div>
 </template>
 
 <script setup>
+import { computed, ref } from 'vue'
 import Chips from 'primevue/chips'
 import { useI18n } from 'vue-i18n'
 
 /**
- * Lista de autores como etiquetas. Cada autor entra com Enter (ou ao sair do
- * campo), então vírgula faz parte do nome e nunca separa autores.
+ * Lista de autores como etiquetas, com rótulo flutuante igual ao TextField.
+ * Cada autor entra com Enter (ou ao sair do campo), então vírgula faz parte
+ * do nome e nunca separa autores.
  */
 const props = defineProps({
   modelValue: { type: Array, default: () => [] },
   inputId: { type: String, required: true },
-  placeholder: { type: String, default: '' },
-  invalid: { type: Boolean, default: false }
+  label: { type: String, default: '' },
+  error: { type: String, default: '' },
+  required: { type: Boolean, default: false }
 })
 
 const emit = defineEmits(['update:modelValue'])
 const { t } = useI18n()
+const focused = ref(false)
 
 // Mesmo limite do backend (utils/nameList.js → MAX_NAMES).
 const maxAuthors = 30
 
+const describedBy = computed(() => [props.error ? `${props.inputId}-error` : '', `${props.inputId}-hint`].filter(Boolean).join(' '))
+
 function onUpdate(values) {
   const seen = new Set()
   const cleaned = []
@@ -62,8 +90,26 @@ function onUpdate(values) {
 .authors-input {
   display: flex;
   flex-direction: column;
-  gap: 0.35rem;
+  gap: 0.3rem;
   width: 100%;
+  min-width: 0;
+}
+
+.field-box {
+  position: relative;
+  background-color: var(--bg-input);
+  border: 1px solid transparent;
+  border-radius: 10px;
+  transition: border-color 0.15s ease, box-shadow 0.15s ease;
+}
+
+.field-box:focus-within {
+  border-color: var(--main-color);
+  box-shadow: 0 0 0 3px rgba(var(--main-color-rgb), 0.18);
+}
+
+.invalid .field-box {
+  border-color: var(--red);
 }
 
 .authors-input :deep(.p-chips) {
@@ -72,30 +118,22 @@ function onUpdate(values) {
 
 .authors-input :deep(.p-chips-multiple-container) {
   width: 100%;
-  min-height: 2.75rem;
-  background-color: var(--bg-input);
-  border: 1px solid var(--border-color);
-  border-radius: 8px;
-  padding: 0.35rem 0.5rem;
+  min-height: 3.25rem;
+  background: transparent;
+  border: none;
+  box-shadow: none;
+  border-radius: 10px;
+  padding: 1.4rem 0.6rem 0.4rem;
   gap: 0.35rem;
   flex-wrap: wrap;
 }
 
-.authors-input :deep(.p-chips.p-focus .p-chips-multiple-container) {
-  border-color: var(--main-color);
-  box-shadow: 0 0 0 2px rgba(var(--main-color-rgb), 0.2);
-}
-
-.authors-input.invalid :deep(.p-chips-multiple-container) {
-  border-color: var(--red);
-}
-
 .authors-input :deep(.p-chips-token) {
   background-color: rgba(var(--main-color-rgb), 0.15);
   color: var(--text-primary);
   border-radius: 999px;
-  padding: 0.2rem 0.65rem;
-  font-size: var(--fs-md);
+  padding: 0.15rem 0.65rem;
+  font-size: var(--fs-sm);
 }
 
 .authors-input :deep(.p-chips-input-token) {
@@ -107,16 +145,66 @@ function onUpdate(values) {
 .authors-input :deep(.p-chips-input-token input:focus) {
   width: 100%;
   color: var(--text-primary);
-  background: transparent !important;
-  border: none !important;
-  box-shadow: none !important;
+  background: transparent;
+  border: none;
+  box-shadow: none;
   outline: none;
-  padding: 0.25rem 0.15rem;
+  padding: 0.1rem 0.3rem;
+  font: inherit;
   font-size: var(--fs-md);
 }
 
-.authors-hint {
+.field-label {
+  position: absolute;
+  left: 0.9rem;
+  right: 0.9rem;
+  top: 1rem;
+  color: var(--text-secondary);
+  font-size: var(--fs-md);
+  line-height: 1.2;
+  pointer-events: none;
+  transform-origin: left top;
+  transition: transform 0.15s ease, color 0.15s ease;
+}
+
+.floated .field-label {
+  transform: translateY(-0.6rem) scale(0.8);
+  font-weight: 600;
+}
+
+.field-box:focus-within .field-label {
+  color: var(--main-color);
+}
+
+.invalid .field-label {
+  color: var(--red);
+}
+
+.required-mark {
   color: var(--text-muted);
+}
+
+.field-error {
+  display: flex;
+  align-items: center;
+  gap: 0.35rem;
+  color: var(--red);
   font-size: var(--fs-xs);
+  font-weight: 500;
+}
+
+.field-error .pi {
+  font-size: var(--fs-xs);
+}
+
+.field-hint {
+  color: var(--text-muted);
+  font-size: var(--fs-xs);
+}
+
+@media (prefers-reduced-motion: reduce) {
+  .field-label {
+    transition: none;
+  }
 }
 </style>
diff --git a/frontend/src/components/BookDialog.vue b/frontend/src/components/BookDialog.vue
index 3a87a5afb6f2deaade07b24e3d4476ac39ba8f03..f237ec956f9a91aa7d9ecc8c4028fbd4b6faa5d8 100644
--- a/frontend/src/components/BookDialog.vue
+++ b/frontend/src/components/BookDialog.vue
@@ -3,26 +3,39 @@
     v-model:visible="visible"
     :modal="true"
     :dismissableMask="!isEditing"
-    @hide="closeDialog"
-    class="modern-book-dialog"
-    :breakpoints="{ '960px': '75vw', '640px': '95vw' }"
-    :style="{ width: '900px', maxWidth: '95vw' }"
+    class="book-form-dialog"
+    :style="{ width: isEditing ? '960px' : '900px', maxWidth: 'calc(100vw - 2rem)' }"
     :showHeader="false"
     :aria-label="book.title || t('bookDialog.dialog_label')"
+    @hide="closeDialog"
   >
-    <div class="dialog-body">
-      <button
-        type="button"
+    <div
+      class="dialog-shell"
+      :class="{ viewing: !isEditing }"
+    >
+      <IconButton
         class="close-btn"
-        :aria-label="t('common.close')"
+        icon="pi pi-times"
+        :label="t('common.close')"
         @click="visible = false"
-      >
-        <i
-          class="pi pi-times"
-          aria-hidden="true"
-        ></i>
-      </button>
+      />
+
+      <BookEditForm
+        v-if="isEditing"
+        mode="edit"
+        :book-id="bookId"
+        :initial="book"
+        :cover-version="coverVersion"
+        :confirm-message="t('bookDialog.confirmSave')"
+        id-prefix="book-edit"
+        @saved="onSaved"
+        @cancel="isEditing = false"
+      />
 
+      <div
+        v-else
+        class="dialog-body"
+      >
       <div
         class="cover-section"
         :style="coverMissing ? { '--cover-color': colorFor(book.title || book.authors) } : undefined"
@@ -36,14 +49,7 @@
           aria-hidden="true"
         />
         <div class="image-container">
-          <component
-            :is="isEditing ? 'button' : 'div'"
-            :type="isEditing ? 'button' : undefined"
-            class="cover-wrapper"
-            :class="{ 'editable': isEditing }"
-            :aria-label="isEditing ? t('bookDialog.changeCover') : undefined"
-            @click="triggerFileInput"
-          >
+          <div class="cover-wrapper">
             <img
               v-if="!coverMissing"
               :key="displayCoverUrl"
@@ -58,483 +64,33 @@
               :title="book.title"
               :author="book.authors"
             />
-            <span
-              v-if="isEditing"
-              class="edit-overlay"
-              aria-hidden="true"
-            >
-              <i class="pi pi-camera"></i>
-              <span>{{ t('bookDialog.changeCover') }}</span>
-            </span>
-          </component>
-          <input
-            type="file"
-            ref="fileInput"
-            style="display: none"
-            accept="image/*"
-            tabindex="-1"
-            aria-hidden="true"
-            @change="onFileSelected"
-          />
-        </div>
-      </div>
-
-      <div class="details-section">
-        <div class="details-header">
-          <div class="title-area">
-            <template v-if="isEditing">
-              <label
-                for="book-edit-title"
-                class="sr-only"
-              >{{ t('bookDialog.bookTitle') }}</label>
-              <input
-                id="book-edit-title"
-                v-model="book.title"
-                class="modern-input title-input"
-                :placeholder="t('bookDialog.bookTitle')"
-                :aria-invalid="submitted && !book.title.trim()"
-              />
-              <label
-                for="book-edit-authors"
-                class="sr-only"
-              >{{ t('bookDialog.authorNames') }}</label>
-              <AuthorsInput
-                v-model="book.authorNames"
-                input-id="book-edit-authors"
-                class="author-input"
-                :placeholder="t('bookDialog.authorNames')"
-                :invalid="submitted && book.authorNames.length === 0"
-              />
-              <StarRating
-                v-model="book.rating"
-                class="rating-row"
-                :label="t('rating.label')"
-              />
-            </template>
-            <template v-else>
-              <h1 class="book-title">{{ loading ? t('bookDialog.loading') : (book.title || t('bookDialog.noTitle')) }}
-              </h1>
-              <h2 class="book-author">{{ book.authors || (loading ? '' : t('bookDialog.unknownAuthor')) }}</h2>
-              <template v-if="book.series && !loading">
-                <router-link
-                  v-if="!isReadOnly"
-                  :to="{ name: 'library', query: { series: book.series, sort: 'series', order: 'asc' } }"
-                  class="series-line"
-                  :title="t('series.seeAll', { series: book.series })"
-                  @click="visible = false"
-                >
-                  <i
-                    class="pi pi-clone"
-                    aria-hidden="true"
-                  ></i>
-                  {{ seriesLabel }}
-                </router-link>
-                <span
-                  v-else
-                  class="series-line"
-                >
-                  <i
-                    class="pi pi-clone"
-                    aria-hidden="true"
-                  ></i>
-                  {{ seriesLabel }}
-                </span>
-              </template>
-              <template v-if="!loading && !loadFailed">
-                <StarRating
-                  v-if="!isReadOnly"
-                  :model-value="book.rating"
-                  class="rating-row"
-                  :disabled="ratingSaving"
-                  :label="t('rating.label')"
-                  @update:model-value="quickRate"
-                />
-                <StarRating
-                  v-else-if="book.rating"
-                  :model-value="book.rating"
-                  class="rating-row"
-                  readonly
-                />
-              </template>
-            </template>
-          </div>
-
-        </div>
-
-        <!-- Edição: formulário completo -->
-        <div
-          v-if="isEditing"
-          class="details-content"
-        >
-          <div class="info-group">
-            <label for="book-edit-tags">{{ t('bookDialog.tags') }}</label>
-            <input
-              id="book-edit-tags"
-              v-model="book.tags"
-              class="modern-input"
-              :placeholder="t('bookDialog.tagsPlaceholder')"
-            />
-          </div>
-
-          <div class="series-grid">
-            <div class="info-group">
-              <label for="book-series">{{ t('series.name') }}</label>
-              <input
-                id="book-series"
-                v-model="book.series"
-                class="modern-input"
-                list="book-series-options"
-                maxlength="200"
-                autocomplete="off"
-                :placeholder="t('series.namePlaceholder')"
-              />
-              <datalist id="book-series-options">
-                <option
-                  v-for="item in seriesOptions"
-                  :key="item.name"
-                  :value="item.name"
-                ></option>
-              </datalist>
-            </div>
-            <div class="info-group">
-              <label for="book-series-index">{{ t('series.volume') }}</label>
-              <input
-                id="book-series-index"
-                v-model="book.series_index"
-                class="modern-input"
-                inputmode="decimal"
-                maxlength="7"
-                autocomplete="off"
-                placeholder="-"
-              />
-            </div>
-          </div>
-
-          <div class="info-group">
-            <label for="book-notes">{{ t('notes.label') }}</label>
-            <textarea
-              id="book-notes"
-              v-model="book.notes"
-              class="modern-input notes-input"
-              rows="4"
-              maxlength="5000"
-              :placeholder="t('notes.placeholder')"
-            ></textarea>
-            <span class="field-hint">{{ t('notes.privateHint') }} · {{ (book.notes || '').length }}/5000</span>
-          </div>
-
-          <div class="dates-grid">
-            <div class="info-group">
-              <label for="book-read-date">{{ t('bookDialog.readDateLabel') }}</label>
-              <div class="date-input-wrapper">
-                <i
-                  class="pi"
-                  :class="book.read_date ? 'pi-check-circle text-theme' : 'pi-circle text-gray'"
-                  aria-hidden="true"
-                ></i>
-                <Calendar
-                  inputId="book-read-date"
-                  v-model="book.read_date"
-                  :maxDate="today"
-                  dateFormat="dd/mm/yy"
-                  :placeholder="t('bookDialog.notRead')"
-                  class="modern-calendar"
-                  :showIcon="false"
-                  showButtonBar
-                />
-              </div>
-            </div>
-
-            <div class="info-group">
-              <label for="book-pub-date">{{ t('bookDialog.publication') }}</label>
-              <div class="date-input-wrapper">
-                <i
-                  class="pi pi-calendar text-gray"
-                  aria-hidden="true"
-                ></i>
-                <Calendar
-                  inputId="book-pub-date"
-                  v-model="book.pubdate"
-                  dateFormat="dd/mm/yy"
-                  :placeholder="t('bookDialog.dateUnknown')"
-                  class="modern-calendar"
-                  :showIcon="false"
-                  showButtonBar
-                />
-              </div>
-            </div>
-          </div>
-
-          <div class="meta-grid">
-            <div class="info-group">
-              <label for="book-publisher">{{ t('bookDialog.publisher') }}</label>
-              <input
-                id="book-publisher"
-                v-model="book.publisher"
-                class="modern-input meta-input"
-                placeholder="-"
-              />
-            </div>
-            <div class="info-group">
-              <label for="book-isbn">{{ t('bookDialog.isbn') }}</label>
-              <input
-                id="book-isbn"
-                v-model="book.isbn"
-                class="modern-input meta-input"
-                placeholder="-"
-              />
-            </div>
           </div>
         </div>
+      </div>
 
-        <!-- Visualização: o livro primeiro, o resto a um clique -->
-        <div
-          v-else-if="!loading && !loadFailed"
-          class="details-content view"
-        >
-          <div
-            v-if="!isReadOnly"
-            class="read-state"
-          >
-            <div
-              class="status-picker"
-              role="group"
-              :aria-label="t('status.label')"
-            >
-              <button
-                v-for="option in STATUS_OPTIONS"
-                :key="option"
-                type="button"
-                class="status-option"
-                :class="[option, { active: currentStatus === option }]"
-                :aria-pressed="currentStatus === option"
-                :disabled="readSaving"
-                @click="changeStatus(option)"
-              >
-                <i
-                  :class="STATUS_ICONS[option]"
-                  aria-hidden="true"
-                ></i>
-                <span>{{ t(`status.${option}`) }}</span>
-              </button>
-            </div>
-            <p
-              v-if="statusCaption"
-              class="status-caption"
-            >
-              {{ statusCaption }}
-              <button
-                type="button"
-                class="link-btn"
-                :disabled="readSaving"
-                @click="changeStatus(currentStatus)"
-              >{{ t('status.clear') }}</button>
-            </p>
-          </div>
-          <div
-            v-else-if="currentStatus !== 'none'"
-            class="read-state"
-          >
-            <span class="read-pill">
-              <i
-                :class="STATUS_ICONS[currentStatus]"
-                aria-hidden="true"
-              ></i>
-              {{ statusCaption }}
-            </span>
-          </div>
-
-          <ul
-            v-if="metaItems.length"
-            class="meta-line"
-          >
-            <li
-              v-for="item in metaItems"
-              :key="item.key"
-              :title="item.title"
-            >{{ item.text }}</li>
-          </ul>
+        <div class="details-section">
+          <BookView
+            :book="book"
+            :is-read-only="isReadOnly"
+            :loading="loading"
+            :load-failed="loadFailed"
+            :read-saving="readSaving"
+            :rating-saving="ratingSaving"
+            @change-status="changeStatus"
+            @rate="quickRate"
+            @navigate="visible = false"
+          />
 
-          <p
-            v-if="showIsbnWarning"
-            id="book-isbn-warning"
-            class="isbn-warning"
-          >
-            <i
-              class="pi pi-exclamation-triangle"
-              aria-hidden="true"
-            ></i>
-            {{ t('bookDialog.isbnInvalid') }}
-          </p>
+          <BookCommunity
+            v-if="!isReadOnly && !loading && !loadFailed"
+            :book-id="bookId"
+          />
 
+          <!-- Ações do dono, longe do X de fechar e com nome escrito -->
           <div
-            v-if="tagList.length"
-            class="tags-list"
-            :aria-label="t('bookDialog.tags')"
-          >
-            <span
-              v-for="(tag, index) in tagList"
-              :key="`${tag}-${index}`"
-              class="tag-chip"
-              :style="{ '--tag-color': tagColor(tag) }"
-            >{{ tag }}</span>
-          </div>
-
-          <section
-            v-if="!isReadOnly && book.notes"
-            class="notes-section"
-            aria-labelledby="book-notes-title"
-          >
-            <h3 id="book-notes-title">
-              <i
-                class="pi pi-pencil"
-                aria-hidden="true"
-              ></i>
-              {{ t('notes.title') }}
-            </h3>
-            <p class="notes-text">{{ book.notes }}</p>
-          </section>
-
-          <section
-            v-if="showCommunity"
-            class="community-section"
+            v-if="!isReadOnly && !loading && !loadFailed"
+            class="dialog-footer"
           >
-            <p
-              v-if="communityLoading"
-              class="muted-line"
-            >{{ t('common.loading') }}</p>
-
-            <p
-              v-else-if="communityError"
-              class="muted-line"
-            >{{ t('community.load_error') }}</p>
-
-            <template v-else-if="community">
-              <p
-                v-if="community.readerCount === 0"
-                class="muted-line"
-              >
-                <i
-                  class="pi pi-users"
-                  aria-hidden="true"
-                ></i>
-                {{ t('community.no_readers') }}
-              </p>
-
-              <template v-else>
-                <button
-                  type="button"
-                  class="community-toggle"
-                  :aria-expanded="communityOpen"
-                  aria-controls="book-community-panel"
-                  @click="communityOpen = !communityOpen"
-                >
-                  <i
-                    class="pi pi-users"
-                    aria-hidden="true"
-                  ></i>
-                  <span class="toggle-text">
-                    {{ t('community.readers_count', { n: community.readerCount }, community.readerCount) }}
-                    <span
-                      v-if="community.averageRating"
-                      class="avg-rating"
-                    >
-                      <i
-                        class="pi pi-star-fill"
-                        aria-hidden="true"
-                      ></i>
-                      {{ formatAverage(community.averageRating) }}
-                    </span>
-                  </span>
-                  <i
-                    class="pi pi-chevron-down chevron"
-                    :class="{ open: communityOpen }"
-                    aria-hidden="true"
-                  ></i>
-                </button>
-
-                <div
-                  v-show="communityOpen"
-                  id="book-community-panel"
-                  class="community-panel"
-                >
-                  <ul class="reader-list">
-                    <li
-                      v-for="reader in community.readers"
-                      :key="reader.username"
-                    >
-                      <router-link
-                        :to="{ name: 'public-library', params: { username: reader.username } }"
-                        class="reader-link"
-                      >@{{ reader.username }}</router-link>
-                      <i
-                        v-if="reader.hasRead"
-                        class="pi pi-check-circle text-theme"
-                        v-tooltip.top="t('community.has_read')"
-                        :aria-label="t('community.has_read')"
-                      ></i>
-                      <StarRating
-                        v-if="reader.rating"
-                        :model-value="reader.rating"
-                        size="sm"
-                        readonly
-                      />
-                    </li>
-                  </ul>
-
-                  <div
-                    v-if="community.alsoHave.length"
-                    class="also-have"
-                  >
-                    <h3>{{ t('community.also_have') }}</h3>
-                    <ul>
-                      <li
-                        v-for="item in community.alsoHave.slice(0, ALSO_HAVE_SHOWN)"
-                        :key="`${item.owner}-${item.bookId}`"
-                      >
-                        <router-link
-                          :to="{ name: 'public-library', params: { username: item.owner }, query: { book: item.bookId } }"
-                          class="also-link"
-                        >
-                          <span class="also-title">{{ item.title }}</span>
-                          <span
-                            v-if="item.authors"
-                            class="also-authors"
-                          >{{ item.authors }}</span>
-                        </router-link>
-                        <span class="also-count">{{ t('community.readers_short', { n: item.readers }, item.readers)
-                          }}</span>
-                      </li>
-                    </ul>
-                  </div>
-                </div>
-              </template>
-
-              <p
-                v-if="!currentUser?.showInCommunity"
-                class="community-hint"
-              >
-                <i18n-t
-                  scope="global"
-                  keypath="community.join_hint"
-                  tag="span"
-                >
-                  <template #settings>
-                    <router-link :to="{ name: 'settings' }">{{ t('community.settings_link') }}</router-link>
-                  </template>
-                </i18n-t>
-              </p>
-            </template>
-          </section>
-        </div>
-
-        <!-- Ações do dono, longe do X de fechar e com nome escrito -->
-        <div
-          v-if="!isReadOnly && !loading && !loadFailed"
-          class="dialog-footer"
-          :class="{ editing: isEditing }"
-        >
-          <template v-if="!isEditing">
             <Button
               :label="t('bookDialog.deleteShort')"
               icon="pi pi-trash"
@@ -547,22 +103,7 @@
               class="p-button-outlined p-button-secondary p-button-sm footer-edit"
               @click="editMode"
             />
-          </template>
-          <template v-else>
-            <Button
-              :label="t('bookDialog.cancel')"
-              class="p-button-text p-button-secondary p-button-sm"
-              :disabled="isSaving"
-              @click="cancelEdit"
-            />
-            <Button
-              :label="t('bookDialog.saveShort')"
-              icon="pi pi-check"
-              class="btn-action-primary p-button-sm"
-              :loading="isSaving"
-              @click="confirmSave"
-            />
-          </template>
+          </div>
         </div>
       </div>
     </div>
@@ -570,26 +111,28 @@
 </template>
 
 <script setup>
-import { ref, watch, computed, onMounted, onBeforeUnmount } from 'vue'
+import { ref, watch, computed, onMounted } from 'vue'
 import { useI18n } from 'vue-i18n'
 import Dialog from 'primevue/dialog'
-import Calendar from 'primevue/calendar'
 import Button from 'primevue/button'
 import { useToast } from 'primevue/usetoast'
 import { useConfirm } from 'primevue/useconfirm'
 import api from '../services/api.js'
-import AuthorsInput from './AuthorsInput.vue'
-import StarRating from './StarRating.vue'
-import { tagColor, colorFor } from '../utils/tagColors.js'
-import { currentUser } from '../services/session.js'
+import { colorFor } from '../utils/tagColors.js'
 import { coverUrl, coverFallbackExhausted } from '../utils/covers.js'
 import GeneratedCover from './GeneratedCover.vue'
+import IconButton from './form/IconButton.vue'
+import BookView from './book/BookView.vue'
+import BookEditForm from './book/BookEditForm.vue'
+import BookCommunity from './book/BookCommunity.vue'
 import { fromApiDate, toApiDate } from '../utils/dates.js'
-import { statusOf, STATUS_OPTIONS, STATUS_ICONS } from '../utils/readingStatus.js'
-import { seriesText } from '../utils/series.js'
-import { validateImageFile, createPreviewHandle } from '../utils/files.js'
+import { statusOf } from '../utils/readingStatus.js'
 
-const { t, locale } = useI18n()
+/**
+ * Livro aberto: visualização (BookView + BookCommunity) ou edição
+ * (BookEditForm, o mesmo formulário do Novo livro).
+ */
+const { t } = useI18n()
 const props = defineProps({
   modelValue: Boolean,
   bookId: Number,
@@ -598,25 +141,17 @@ const props = defineProps({
   ownerUsername: { type: String, default: '' }
 })
 
-// Data de leitura não pode estar no futuro (o servidor também recusa).
-const today = new Date()
-
 const emit = defineEmits(['update:modelValue', 'updated', 'deleted'])
 const toast = useToast()
 const confirm = useConfirm()
 
-
 const visible = ref(props.modelValue)
 const loading = ref(true)
 const loadFailed = ref(false)
 const isEditing = ref(false)
-const isSaving = ref(false)
-const submitted = ref(false)
-const fileInput = ref(null)
-const selectedFile = ref(null)
-const previewUrl = ref(null)
 const coverVersion = ref(0)
-const preview = createPreviewHandle()
+const ratingSaving = ref(false)
+const readSaving = ref(false)
 
 function emptyBook() {
   // authors: texto para exibir; authorNames: a lista que é editada e salva.
@@ -624,78 +159,23 @@ function emptyBook() {
 }
 
 const book = ref(emptyBook())
-let originalBook = null
-
-const tagList = computed(() => {
-  if (!book.value.tags) return []
-  return book.value.tags.split(',').map(tag => tag.trim()).filter(Boolean)
-})
-
-const ALSO_HAVE_SHOWN = 3
-
-const ratingSaving = ref(false)
-const readSaving = ref(false)
-const communityOpen = ref(false)
-const community = ref(null)
-const communityLoading = ref(false)
-const communityError = ref(false)
-
-const showIsbnWarning = computed(() => !isEditing.value && !loading.value && !book.value.isbnValid)
-const showCommunity = computed(() => !props.isReadOnly && !isEditing.value && !loading.value && !loadFailed.value)
-
-function formatDate(value) {
-  const date = value instanceof Date ? value : new Date(value)
-  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(locale.value)
-}
 
-// Editora · ano · ISBN numa linha só; a data completa fica no title.
-const metaItems = computed(() => {
-  const items = []
-  if (book.value.publisher) items.push({ key: 'publisher', text: book.value.publisher })
-  if (book.value.pubdate) {
-    items.push({
-      key: 'year',
-      text: String(book.value.pubdate.getFullYear()),
-      title: t('bookDialog.publishedOn', { date: formatDate(book.value.pubdate) })
-    })
-  }
-  if (book.value.isbn) items.push({ key: 'isbn', text: `ISBN ${book.value.isbn}` })
-  return items
-})
+const displayCoverUrl = computed(() => coverUrl(props.bookId, coverVersion.value))
 
-const currentStatus = computed(() => statusOf(book.value))
-
-const seriesLabel = computed(() => seriesText(book.value, t, locale.value))
+// Sem imagem: capa desenhada e fundo na cor do livro, em vez do quadro cinza.
+const coverMissing = ref(false)
+watch(displayCoverUrl, () => { coverMissing.value = false })
 
-// Séries já usadas, para autocompletar ao editar.
-const seriesOptions = ref([])
-async function loadSeriesOptions() {
-  if (props.isReadOnly || seriesOptions.value.length) return
-  try {
-    seriesOptions.value = await api.getSeries()
-  } catch {
-    seriesOptions.value = []
-  }
+function onCoverError(event) {
+  if (coverFallbackExhausted(event)) coverMissing.value = true
 }
 
-const statusCaption = computed(() => {
-  const status = currentStatus.value
-  if (status === 'read') return t('bookDialog.readOn', { date: formatDate(book.value.read_date) })
-  if (status === 'reading') {
-    return book.value.started_at
-      ? t('status.readingSince', { date: formatDate(book.value.started_at) })
-      : t('status.reading')
-  }
-  if (status === 'want') return t('status.wantCaption')
-  return ''
-})
-
 /**
  * Quero ler / Lendo / Lido. Clicar no status que já está marcado tira o status
  * (o livro volta a só estar na estante). Datas vão no fuso da pessoa.
  */
 async function changeStatus(option) {
-  const next = currentStatus.value === option ? 'none' : option
+  const next = statusOf(book.value) === option ? 'none' : option
   readSaving.value = true
   try {
     const today = toApiDate(new Date())
@@ -714,24 +194,6 @@ async function changeStatus(option) {
   }
 }
 
-function formatAverage(value) {
-  return Number(value).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
-}
-
-async function loadCommunity() {
-  if (props.isReadOnly || !props.bookId) return
-  communityLoading.value = true
-  communityError.value = false
-  try {
-    community.value = await api.getBookCommunity(props.bookId)
-  } catch {
-    communityError.value = true
-    community.value = null
-  } finally {
-    communityLoading.value = false
-  }
-}
-
 // Nota direto da visualização, sem entrar no modo de edição.
 async function quickRate(value) {
   const previous = book.value.rating
@@ -749,51 +211,6 @@ async function quickRate(value) {
   }
 }
 
-const displayCoverUrl = computed(() => previewUrl.value || coverUrl(props.bookId, coverVersion.value))
-
-// Sem imagem: capa desenhada e fundo na cor do livro, em vez do quadro cinza.
-const coverMissing = ref(false)
-watch(displayCoverUrl, () => { coverMissing.value = false })
-
-function onCoverError(event) {
-  if (coverFallbackExhausted(event)) coverMissing.value = true
-}
-
-
-function triggerFileInput() {
-  if (isEditing.value) fileInput.value?.click()
-}
-
-function onFileSelected(event) {
-  const file = event.target.files[0]
-  event.target.value = ''
-  if (!file) return
-
-  const problem = validateImageFile(file)
-  if (problem) {
-    toast.add({ severity: 'warn', summary: t('bookDialog.attention'), detail: t(problem.key, problem.params || {}), life: 4000 })
-    return
-  }
-
-  selectedFile.value = file
-  previewUrl.value = preview.set(file)
-}
-
-function clearSelectedFile() {
-  selectedFile.value = null
-  previewUrl.value = null
-  preview.clear()
-}
-
-function cloneBook(source) {
-  return {
-    ...source,
-    authorNames: [...(source.authorNames || [])],
-    read_date: source.read_date ? new Date(source.read_date) : null,
-    pubdate: source.pubdate ? new Date(source.pubdate) : null
-  }
-}
-
 function deleteBook() {
   confirm.require({
     message: t('bookDialog.confirmDelete'),
@@ -818,94 +235,19 @@ function deleteBook() {
 
 function editMode() {
   if (loading.value || loadFailed.value) return
-  originalBook = cloneBook(book.value)
-  submitted.value = false
   isEditing.value = true
-  loadSeriesOptions()
-}
-
-function cancelEdit() {
-  if (originalBook) book.value = cloneBook(originalBook)
-  clearSelectedFile()
-  submitted.value = false
-  isEditing.value = false
 }
 
 function closeDialog() {
-  if (isEditing.value) cancelEdit()
+  isEditing.value = false
   visible.value = false
 }
 
-function validate() {
-  submitted.value = true
-
-  if (!book.value.title.trim()) {
-    toast.add({ severity: 'warn', summary: t('bookDialog.attention'), detail: t('bookDialog.validationTitle'), life: 3000 })
-    return false
-  }
-
-  if (book.value.authorNames.length === 0) {
-    toast.add({ severity: 'warn', summary: t('bookDialog.attention'), detail: t('bookDialog.validationAuthors'), life: 3000 })
-    return false
-  }
-
-  return true
-}
-
-function confirmSave() {
-  if (!validate()) return
-
-  confirm.require({
-    message: t('bookDialog.confirmSave'),
-    header: t('bookDialog.confirm'),
-    icon: 'pi pi-exclamation-circle',
-    acceptClass: 'p-button-rounded btn-action-primary',
-    rejectClass: 'p-button-text p-button-secondary',
-    acceptLabel: t('bookDialog.save'),
-    rejectLabel: t('bookDialog.cancel'),
-    accept: () => saveBookDetails()
-  })
-}
-
-async function saveBookDetails() {
-  isSaving.value = true
-  let coverChanged = false
-
-  try {
-    const response = await api.updateBook(props.bookId, {
-      title: book.value.title.trim(),
-      authors: book.value.authorNames,
-      publisher: book.value.publisher,
-      tags: tagList.value,
-      isbn: book.value.isbn,
-      rating: book.value.rating,
-      pubDate: toApiDate(book.value.pubdate),
-      readDate: toApiDate(book.value.read_date),
-      series: (book.value.series || '').trim(),
-      seriesIndex: String(book.value.series_index ?? '').trim() || null,
-      notes: book.value.notes || ''
-    })
-
-    if (selectedFile.value) {
-      const formData = new FormData()
-      formData.append('coverImage', selectedFile.value)
-      await api.updateCover(props.bookId, formData)
-      coverChanged = true
-      coverVersion.value = Date.now()
-    }
-
-    isEditing.value = false
-    submitted.value = false
-    clearSelectedFile()
-    applyResponse(response.book)
-
-    emit('updated', { book: { ...response.book, book_id: props.bookId }, coverChanged })
-    toast.add({ severity: 'success', summary: t('bookDialog.success'), detail: t('bookDialog.changesSaved'), life: 3000 })
-  } catch (error) {
-    toast.add({ severity: 'error', summary: t('bookDialog.error'), detail: error.message || t('bookDialog.updateFailed'), life: 4000 })
-  } finally {
-    isSaving.value = false
-  }
+function onSaved({ book: saved, coverChanged }) {
+  if (coverChanged) coverVersion.value = Date.now()
+  applyResponse(saved)
+  isEditing.value = false
+  emit('updated', { book: { ...saved, book_id: props.bookId }, coverChanged })
 }
 
 function applyResponse(data) {
@@ -934,7 +276,6 @@ async function loadBookData() {
 
   loading.value = true
   loadFailed.value = false
-  clearSelectedFile()
 
   try {
     const response = props.isReadOnly
@@ -942,8 +283,7 @@ async function loadBookData() {
       : await api.getBookById(props.bookId)
 
     applyResponse(response)
-    loadCommunity()
-  } catch (error) {
+  } catch {
     // Sem os dados reais a edição fica bloqueada: antes dava para salvar
     // "Erro ao carregar" por cima do título verdadeiro.
     loadFailed.value = true
@@ -960,43 +300,15 @@ watch(visible, (val) => emit('update:modelValue', val))
 onMounted(() => {
   if (visible.value) loadBookData()
 })
-
-onBeforeUnmount(() => preview.clear())
 </script>
 
-<style>
-.p-dialog.modern-book-dialog {
-  border: none !important;
-  border-radius: 16px !important;
-  overflow: hidden !important;
-  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5) !important;
-  background-color: var(--bg-panel) !important;
-}
-
-.modern-book-dialog .p-dialog-content {
-  padding: 0 !important;
-  background-color: var(--bg-panel);
-}
-
-.modern-book-dialog .p-dialog-header {
-  display: none !important;
-}
-
-.btn-action-primary {
-  background-color: var(--main-solid) !important;
-  border-color: var(--main-solid) !important;
-  color: var(--on-main) !important;
-}
-</style>
-
 <style scoped>
-.dialog-body {
-  display: flex;
-  flex-direction: row;
-  min-height: 440px;
+.dialog-shell {
   position: relative;
-  width: 100%;
-  background-color: var(--bg-panel);
+  display: flex;
+  flex-direction: column;
+  min-height: 0;
+  max-height: min(92vh, 860px);
 }
 
 .close-btn {
@@ -1004,22 +316,16 @@ onBeforeUnmount(() => preview.clear())
   top: 1rem;
   right: 1rem;
   z-index: 10;
-  background: rgba(0, 0, 0, 0.2);
-  border: none;
-  border-radius: 50%;
-  width: 32px;
-  height: 32px;
-  color: var(--text-primary);
-  cursor: pointer;
-  display: flex;
-  align-items: center;
-  justify-content: center;
-  transition: background 0.2s;
 }
 
-.close-btn:hover {
-  background: rgba(var(--main-color-rgb), 0.2);
-  color: var(--main-color);
+.dialog-body {
+  display: flex;
+  flex-direction: row;
+  min-height: 440px;
+  max-height: inherit;
+  position: relative;
+  width: 100%;
+  background-color: var(--bg-panel);
 }
 
 .cover-section {
@@ -1069,19 +375,6 @@ onBeforeUnmount(() => preview.clear())
   box-shadow: 0 10px 30px rgba(0, 0, 0, 0.8);
 }
 
-button.cover-wrapper {
-  border: none;
-  padding: 0;
-  background: none;
-  font: inherit;
-  color: inherit;
-  display: block;
-}
-
-.cover-wrapper.editable {
-  cursor: pointer;
-}
-
 .main-cover {
   width: 100%;
   height: 100%;
@@ -1089,37 +382,6 @@ button.cover-wrapper {
   transition: filter 0.3s ease;
 }
 
-.editable:hover .main-cover {
-  filter: brightness(0.5) blur(2px);
-}
-
-.edit-overlay {
-  position: absolute;
-  top: 0;
-  left: 0;
-  width: 100%;
-  height: 100%;
-  display: flex;
-  flex-direction: column;
-  justify-content: center;
-  align-items: center;
-  color: white;
-  opacity: 0;
-  transition: opacity 0.3s ease;
-  z-index: 5;
-  background-color: rgba(0, 0, 0, 0.3);
-}
-
-.editable:hover .edit-overlay {
-  opacity: 1;
-}
-
-.edit-overlay i {
-  font-size: var(--fs-2xl);
-  margin-bottom: 0.5rem;
-  color: var(--main-color);
-}
-
 .details-section {
   flex: 1.5;
   padding: 2.5rem;
@@ -1129,483 +391,7 @@ button.cover-wrapper {
   flex-direction: column;
   gap: 1.5rem;
   overflow-y: auto;
-  max-height: 85vh;
-}
-
-.details-header {
-  display: flex;
-  justify-content: space-between;
-  align-items: flex-start;
-  gap: 1rem;
-  /* Espaço para o X do canto não encostar no título. */
-  padding-right: 2rem;
-}
-
-.title-area {
-  flex: 1;
-  display: flex;
-  flex-direction: column;
-  gap: 0.5rem;
-}
-
-.book-title {
-  font-family: var(--font-display);
-  font-size: var(--fs-2xl);
-  font-weight: 700;
-  margin: 0;
-  line-height: 1.2;
-  color: var(--text-primary);
-}
-
-.book-author {
-  font-size: var(--fs-lg);
-  color: var(--text-secondary);
-  margin: 0;
-  font-weight: 400;
-}
-
-.modern-input {
-  background: transparent;
-  border: 1px solid transparent;
-  color: inherit;
-  font-family: inherit;
-  padding: 0.25rem 0.5rem;
-  border-radius: 6px;
-  width: 100%;
-  transition: all 0.2s;
-}
-
-.modern-input:not(.readonly):focus {
-  background-color: var(--bg-input);
-  border-color: var(--main-color);
-  outline: none;
-}
-
-.title-input {
-  font-family: var(--font-display);
-  font-size: var(--fs-2xl);
-  font-weight: 700;
-}
-
-/* Na edição, todos os campos de baixo com a mesma cara. */
-.details-content .modern-input {
-  background-color: var(--bg-input);
-  padding: 0.7rem 0.75rem;
-  border-radius: 8px;
-}
-
-.author-input {
-  font-size: var(--fs-lg);
-  color: var(--text-secondary);
-}
-
-.info-group label {
-  display: block;
-  font-size: var(--fs-sm);
-  color: var(--text-secondary);
-  margin-bottom: 0.4rem;
-  font-weight: 500;
-}
-
-.details-content {
-  display: flex;
-  flex-direction: column;
-  gap: 1.25rem;
-}
-
-.details-content.view {
-  gap: 1.1rem;
-}
-
-.rating-row {
-  margin-top: 0.35rem;
-}
-
-/* Lido / marcar como lido */
-.read-state {
-  display: flex;
-  align-items: center;
-  gap: 0.75rem;
-  flex-wrap: wrap;
-}
-
-.read-pill {
-  display: inline-flex;
-  align-items: center;
-  gap: 0.45rem;
-  padding: 0.4rem 0.85rem;
-  border-radius: 999px;
-  background: rgba(var(--main-color-rgb), 0.12);
-  color: var(--main-color);
-  font-weight: 600;
-  font-size: var(--fs-md);
-}
-
-.read-pill .pi {
-  font-size: var(--fs-sm);
-}
-
-.read-state:has(.status-picker) {
-  flex-direction: column;
-  align-items: flex-start;
-  gap: 0.5rem;
-}
-
-.status-picker {
-  display: inline-flex;
-  flex-wrap: wrap;
-  gap: 0.4rem;
-}
-
-.status-option {
-  display: inline-flex;
-  align-items: center;
-  gap: 0.4rem;
-  padding: 0.45rem 0.9rem;
-  border-radius: 999px;
-  border: 1px solid var(--border-color);
-  background: transparent;
-  color: var(--text-secondary);
-  font: inherit;
-  font-size: var(--fs-sm);
-  font-weight: 600;
-  cursor: pointer;
-  transition: background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease;
-}
-
-.status-option .pi {
-  font-size: var(--fs-sm);
-}
-
-.status-option:hover:not(:disabled) {
-  border-color: var(--main-color);
-  color: var(--text-primary);
-}
-
-.status-option.active {
-  background: var(--main-solid);
-  border-color: var(--main-solid);
-  color: var(--on-main);
-}
-
-.status-option:disabled {
-  opacity: 0.6;
-  cursor: progress;
-}
-
-.status-option:focus-visible {
-  outline: 2px solid var(--main-color);
-  outline-offset: 2px;
-}
-
-.status-caption {
-  margin: 0;
-  font-size: var(--fs-sm);
-  color: var(--text-secondary);
-  display: flex;
-  align-items: center;
-  gap: 0.5rem;
-  flex-wrap: wrap;
-}
-
-.link-btn {
-  background: none;
-  border: none;
-  padding: 0.25rem;
-  color: var(--text-secondary);
-  font: inherit;
-  font-size: var(--fs-sm);
-  cursor: pointer;
-  text-decoration: underline;
-  text-underline-offset: 3px;
-}
-
-.link-btn:hover {
-  color: var(--text-primary);
-}
-
-.link-btn:disabled {
-  opacity: 0.5;
-  cursor: default;
-}
-
-/* Editora · ano · ISBN */
-.series-line {
-  display: inline-flex;
-  align-items: center;
-  gap: 0.4rem;
-  margin-top: 0.35rem;
-  color: var(--main-color);
-  font-size: var(--fs-md);
-  font-weight: 600;
-  text-decoration: none;
-}
-
-.series-line .pi {
-  font-size: var(--fs-sm);
-}
-
-a.series-line:hover {
-  text-decoration: underline;
-}
-
-.series-grid {
-  display: grid;
-  grid-template-columns: minmax(0, 1fr) 6.5rem;
-  gap: 1rem;
-}
-
-.notes-input {
-  resize: vertical;
-  min-height: 5.5rem;
-  font: inherit;
-  line-height: 1.5;
-}
-
-.field-hint {
-  font-size: var(--fs-xs);
-  color: var(--text-secondary);
-}
-
-.notes-section {
-  border: 1px solid var(--border-color);
-  border-radius: 12px;
-  padding: 0.85rem 1rem;
-  background: rgba(var(--main-color-rgb), 0.05);
-}
-
-.notes-section h3 {
-  margin: 0 0 0.4rem;
-  font-size: var(--fs-sm);
-  font-weight: 700;
-  text-transform: uppercase;
-  letter-spacing: 0.4px;
-  color: var(--text-secondary);
-  display: flex;
-  align-items: center;
-  gap: 0.4rem;
-}
-
-.notes-text {
-  margin: 0;
-  white-space: pre-wrap;
-  overflow-wrap: anywhere;
-  color: var(--text-primary);
-  line-height: 1.55;
-  max-height: 12rem;
-  overflow-y: auto;
-}
-
-.meta-line {
-  list-style: none;
-  margin: 0;
-  padding: 0;
-  display: flex;
-  flex-wrap: wrap;
-  color: var(--text-secondary);
-  font-size: var(--fs-md);
-  line-height: 1.6;
-}
-
-.meta-line li+li::before {
-  content: '·';
-  margin: 0 0.5rem;
-  color: var(--text-muted);
-}
-
-.isbn-warning {
-  display: flex;
-  align-items: center;
-  gap: 0.4rem;
-  margin: -0.4rem 0 0;
-  color: #f59e0b;
-  font-size: var(--fs-sm);
-}
-
-.tags-list {
-  display: flex;
-  flex-wrap: wrap;
-  gap: 0.4rem;
-}
-
-.tag-chip {
-  font-size: var(--fs-sm);
-  font-weight: 500;
-  padding: 0.25rem 0.7rem;
-  border-radius: 999px;
-  color: var(--tag-color);
-  background: color-mix(in srgb, var(--tag-color) 12%, transparent);
-  border: 1px solid color-mix(in srgb, var(--tag-color) 35%, transparent);
-}
-
-/* Comunidade recolhida */
-.community-section {
-  border-top: 1px solid var(--border-color);
-  padding-top: 1rem;
-  display: flex;
-  flex-direction: column;
-  gap: 0.75rem;
-}
-
-.muted-line {
-  margin: 0;
-  display: flex;
-  align-items: center;
-  gap: 0.5rem;
-  color: var(--text-secondary);
-  font-size: var(--fs-md);
-}
-
-.community-toggle {
-  display: flex;
-  align-items: center;
-  gap: 0.6rem;
-  width: 100%;
-  background: none;
-  border: none;
-  padding: 0.35rem 0;
-  font: inherit;
-  color: var(--text-primary);
-  cursor: pointer;
-  text-align: left;
-}
-
-.community-toggle>.pi-users {
-  color: var(--text-secondary);
-}
-
-.toggle-text {
-  flex: 1;
-  font-size: var(--fs-md);
-}
-
-.community-toggle:hover .toggle-text {
-  color: var(--main-color);
-}
-
-.community-toggle:focus-visible {
-  outline: 2px solid var(--main-color);
-  outline-offset: 2px;
-  border-radius: 6px;
-}
-
-.avg-rating {
-  margin-left: 0.5rem;
-  color: var(--text-secondary);
-  white-space: nowrap;
-}
-
-.avg-rating .pi {
-  color: #f5b301;
-  font-size: var(--fs-sm);
-}
-
-.chevron {
-  color: var(--text-muted);
-  font-size: var(--fs-sm);
-  transition: transform 0.2s ease;
-}
-
-.chevron.open {
-  transform: rotate(180deg);
-}
-
-@media (prefers-reduced-motion: reduce) {
-  .chevron {
-    transition: none;
-  }
-}
-
-.community-panel {
-  display: flex;
-  flex-direction: column;
-  gap: 1rem;
-}
-
-.reader-list,
-.also-have ul {
-  list-style: none;
-  margin: 0;
-  padding: 0;
-}
-
-.reader-list {
-  display: flex;
-  flex-wrap: wrap;
-  gap: 0.4rem;
-}
-
-.reader-list li {
-  display: inline-flex;
-  align-items: center;
-  gap: 0.4rem;
-  background: var(--bg-input);
-  border-radius: 999px;
-  padding: 0.25rem 0.7rem;
-  font-size: var(--fs-sm);
-}
-
-.reader-link,
-.also-link,
-.community-hint a {
-  color: var(--main-color);
-  text-decoration: none;
-}
-
-.reader-link:hover,
-.also-link:hover .also-title,
-.community-hint a:hover {
-  text-decoration: underline;
-}
-
-.also-have h3 {
-  margin: 0 0 0.35rem;
-  font-size: var(--fs-sm);
-  color: var(--text-secondary);
-  font-weight: 500;
-}
-
-.also-have li {
-  display: flex;
-  justify-content: space-between;
-  align-items: baseline;
-  gap: 1rem;
-  padding: 0.45rem 0;
-  border-bottom: 1px solid var(--border-color);
-}
-
-.also-have li:last-child {
-  border-bottom: none;
-}
-
-.also-link {
-  display: flex;
-  flex-direction: column;
-  min-width: 0;
-}
-
-.also-title {
-  color: var(--text-primary);
-  overflow: hidden;
-  text-overflow: ellipsis;
-  white-space: nowrap;
-}
-
-.also-authors,
-.also-count {
-  font-size: var(--fs-sm);
-  color: var(--text-secondary);
-}
-
-.also-count {
-  flex-shrink: 0;
-}
-
-.community-hint {
-  margin: 0;
-  font-size: var(--fs-sm);
-  color: var(--text-secondary);
-  line-height: 1.45;
+  max-height: inherit;
 }
 
 .dialog-footer {
@@ -1618,78 +404,31 @@ a.series-line:hover {
   gap: 0.75rem;
 }
 
-.dialog-footer.editing {
-  justify-content: flex-end;
-}
-
 .footer-edit.p-button {
   border-radius: 8px;
 }
 
-.dates-grid,
-.meta-grid {
-  display: grid;
-  grid-template-columns: 1fr 1fr;
-  gap: 1.5rem;
-  margin-bottom: 0.5rem;
-}
-
-.date-input-wrapper {
-  display: flex;
-  align-items: center;
-  gap: 0.75rem;
-  background-color: var(--bg-input);
-  padding: 0.5rem 1rem;
-  border-radius: 8px;
-}
-
-.text-theme {
-  color: var(--main-color);
-  font-weight: bold;
-}
-
-.text-gray {
-  color: var(--text-muted);
-}
-
-:deep(.modern-calendar .p-inputtext) {
-  background: transparent;
-  border: none;
-  color: var(--text-primary);
-  padding: 0;
-  font-size: var(--fs-md);
-  width: 100%;
-}
-
-.meta-input {
-  background-color: var(--bg-input);
-  padding: 0.75rem;
-  border-radius: 8px;
-  color: var(--text-primary);
-}
-
-.meta-input.readonly {
-  background-color: transparent;
-  padding: 0;
-}
-
-.p-button.p-button-secondary.p-button-text {
-  color: var(--text-secondary) !important;
-}
-
-.p-button.p-button-secondary.p-button-text:hover {
-  color: var(--text-primary) !important;
-  background-color: var(--bg-hover) !important;
-}
-
 @media (max-width: 768px) {
-
   /* Celular/tablet em pé: capa compacta em cima e só os detalhes rolam,
      para o botão de fechar e o título ficarem sempre à vista. */
+  .dialog-shell {
+    max-height: calc(100dvh - 2rem);
+  }
+
+  .close-btn {
+    top: 0.75rem;
+    right: 0.75rem;
+  }
+
+  /* Por cima da capa */
+  .viewing .close-btn {
+    background: rgba(0, 0, 0, 0.4);
+    color: #ffffff;
+  }
+
   .dialog-body {
     flex-direction: column;
     min-height: 0;
-    max-height: calc(100dvh - 2rem);
   }
 
   .cover-section {
@@ -1707,10 +446,6 @@ a.series-line:hover {
     gap: 1.25rem;
   }
 
-  .book-title {
-    font-size: var(--fs-xl);
-  }
-
   /* Capa inteira e pequena, em vez de um recorte gigante. */
   .image-container {
     padding: 1rem;
@@ -1723,15 +458,5 @@ a.series-line:hover {
     height: 100%;
     max-width: none;
   }
-
-  .details-header {
-    padding-right: 0;
-  }
-
-  .dates-grid,
-  .meta-grid {
-    grid-template-columns: 1fr;
-    gap: 1rem;
-  }
 }
-</style>
\ No newline at end of file
+</style>
diff --git a/frontend/src/components/book/BookCommunity.vue b/frontend/src/components/book/BookCommunity.vue
new file mode 100644
index 0000000000000000000000000000000000000000..64574531b811cb0065fd27e80cf2dae100ee0044
--- /dev/null
+++ b/frontend/src/components/book/BookCommunity.vue
@@ -0,0 +1,349 @@
+<template>
+  <section class="community-section">
+    <p
+      v-if="communityLoading"
+      class="muted-line"
+    >{{ t('common.loading') }}</p>
+
+    <p
+      v-else-if="communityError"
+      class="muted-line"
+    >{{ t('community.load_error') }}</p>
+
+    <template v-else-if="community">
+      <p
+        v-if="community.readerCount === 0"
+        class="muted-line"
+      >
+        <i
+          class="pi pi-users"
+          aria-hidden="true"
+        ></i>
+        {{ t('community.no_readers') }}
+      </p>
+
+      <template v-else>
+        <button
+          type="button"
+          class="community-toggle"
+          :aria-expanded="communityOpen"
+          aria-controls="book-community-panel"
+          @click="communityOpen = !communityOpen"
+        >
+          <i
+            class="pi pi-users"
+            aria-hidden="true"
+          ></i>
+          <span class="toggle-text">
+            {{ t('community.readers_count', { n: community.readerCount }, community.readerCount) }}
+            <span
+              v-if="community.averageRating"
+              class="avg-rating"
+            >
+              <i
+                class="pi pi-star-fill"
+                aria-hidden="true"
+              ></i>
+              {{ formatAverage(community.averageRating) }}
+            </span>
+          </span>
+          <i
+            class="pi pi-chevron-down chevron"
+            :class="{ open: communityOpen }"
+            aria-hidden="true"
+          ></i>
+        </button>
+
+        <div
+          v-show="communityOpen"
+          id="book-community-panel"
+          class="community-panel"
+        >
+          <ul class="reader-list">
+            <li
+              v-for="reader in community.readers"
+              :key="reader.username"
+            >
+              <router-link
+                :to="{ name: 'public-library', params: { username: reader.username } }"
+                class="reader-link"
+              >@{{ reader.username }}</router-link>
+              <i
+                v-if="reader.hasRead"
+                class="pi pi-check-circle text-theme"
+                v-tooltip.top="t('community.has_read')"
+                :aria-label="t('community.has_read')"
+              ></i>
+              <StarRating
+                v-if="reader.rating"
+                :model-value="reader.rating"
+                size="sm"
+                readonly
+              />
+            </li>
+          </ul>
+
+          <div
+            v-if="community.alsoHave.length"
+            class="also-have"
+          >
+            <h3>{{ t('community.also_have') }}</h3>
+            <ul>
+              <li
+                v-for="item in community.alsoHave.slice(0, ALSO_HAVE_SHOWN)"
+                :key="`${item.owner}-${item.bookId}`"
+              >
+                <router-link
+                  :to="{ name: 'public-library', params: { username: item.owner }, query: { book: item.bookId } }"
+                  class="also-link"
+                >
+                  <span class="also-title">{{ item.title }}</span>
+                  <span
+                    v-if="item.authors"
+                    class="also-authors"
+                  >{{ item.authors }}</span>
+                </router-link>
+                <span class="also-count">{{ t('community.readers_short', { n: item.readers }, item.readers)
+                  }}</span>
+              </li>
+            </ul>
+          </div>
+        </div>
+      </template>
+
+      <p
+        v-if="!currentUser?.showInCommunity"
+        class="community-hint"
+      >
+        <i18n-t
+          scope="global"
+          keypath="community.join_hint"
+          tag="span"
+        >
+          <template #settings>
+            <router-link :to="{ name: 'settings' }">{{ t('community.settings_link') }}</router-link>
+          </template>
+        </i18n-t>
+      </p>
+    </template>
+  </section>
+</template>
+
+<script setup>
+import { ref, watch } from 'vue'
+import { useI18n } from 'vue-i18n'
+import api from '../../services/api.js'
+import StarRating from '../StarRating.vue'
+import { currentUser } from '../../services/session.js'
+
+/** Comunidade do livro: quem mais tem, média das notas e "quem tem também tem". */
+const props = defineProps({
+  bookId: { type: Number, required: true }
+})
+
+const { t } = useI18n()
+
+const ALSO_HAVE_SHOWN = 3
+
+const communityOpen = ref(false)
+const community = ref(null)
+const communityLoading = ref(false)
+const communityError = ref(false)
+
+function formatAverage(value) {
+  return Number(value).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
+}
+
+async function loadCommunity() {
+  if (!props.bookId) return
+  communityLoading.value = true
+  communityError.value = false
+  try {
+    community.value = await api.getBookCommunity(props.bookId)
+  } catch {
+    communityError.value = true
+    community.value = null
+  } finally {
+    communityLoading.value = false
+  }
+}
+
+watch(() => props.bookId, loadCommunity, { immediate: true })
+</script>
+
+<style scoped>
+/* Comunidade recolhida */
+.community-section {
+  border-top: 1px solid var(--border-color);
+  padding-top: 1rem;
+  display: flex;
+  flex-direction: column;
+  gap: 0.75rem;
+}
+
+.muted-line {
+  margin: 0;
+  display: flex;
+  align-items: center;
+  gap: 0.5rem;
+  color: var(--text-secondary);
+  font-size: var(--fs-md);
+}
+
+.community-toggle {
+  display: flex;
+  align-items: center;
+  gap: 0.6rem;
+  width: 100%;
+  background: none;
+  border: none;
+  padding: 0.35rem 0;
+  font: inherit;
+  color: var(--text-primary);
+  cursor: pointer;
+  text-align: left;
+}
+
+.community-toggle>.pi-users {
+  color: var(--text-secondary);
+}
+
+.toggle-text {
+  flex: 1;
+  font-size: var(--fs-md);
+}
+
+.community-toggle:hover .toggle-text {
+  color: var(--main-color);
+}
+
+.community-toggle:focus-visible {
+  outline: 2px solid var(--main-color);
+  outline-offset: 2px;
+  border-radius: 6px;
+}
+
+.avg-rating {
+  margin-left: 0.5rem;
+  color: var(--text-secondary);
+  white-space: nowrap;
+}
+
+.avg-rating .pi {
+  color: #f5b301;
+  font-size: var(--fs-sm);
+}
+
+.chevron {
+  color: var(--text-muted);
+  font-size: var(--fs-sm);
+  transition: transform 0.2s ease;
+}
+
+.chevron.open {
+  transform: rotate(180deg);
+}
+
+@media (prefers-reduced-motion: reduce) {
+  .chevron {
+    transition: none;
+  }
+}
+
+.community-panel {
+  display: flex;
+  flex-direction: column;
+  gap: 1rem;
+}
+
+.reader-list,
+.also-have ul {
+  list-style: none;
+  margin: 0;
+  padding: 0;
+}
+
+.reader-list {
+  display: flex;
+  flex-wrap: wrap;
+  gap: 0.4rem;
+}
+
+.reader-list li {
+  display: inline-flex;
+  align-items: center;
+  gap: 0.4rem;
+  background: var(--bg-input);
+  border-radius: 999px;
+  padding: 0.25rem 0.7rem;
+  font-size: var(--fs-sm);
+}
+
+.reader-link,
+.also-link,
+.community-hint a {
+  color: var(--main-color);
+  text-decoration: none;
+}
+
+.reader-link:hover,
+.also-link:hover .also-title,
+.community-hint a:hover {
+  text-decoration: underline;
+}
+
+.also-have h3 {
+  margin: 0 0 0.35rem;
+  font-size: var(--fs-sm);
+  color: var(--text-secondary);
+  font-weight: 500;
+}
+
+.also-have li {
+  display: flex;
+  justify-content: space-between;
+  align-items: baseline;
+  gap: 1rem;
+  padding: 0.45rem 0;
+  border-bottom: 1px solid var(--border-color);
+}
+
+.also-have li:last-child {
+  border-bottom: none;
+}
+
+.also-link {
+  display: flex;
+  flex-direction: column;
+  min-width: 0;
+}
+
+.also-title {
+  color: var(--text-primary);
+  overflow: hidden;
+  text-overflow: ellipsis;
+  white-space: nowrap;
+}
+
+.also-authors,
+.also-count {
+  font-size: var(--fs-sm);
+  color: var(--text-secondary);
+}
+
+.also-count {
+  flex-shrink: 0;
+}
+
+.community-hint {
+  margin: 0;
+  font-size: var(--fs-sm);
+  color: var(--text-secondary);
+  line-height: 1.45;
+}
+
+.text-theme {
+  color: var(--main-color);
+  font-weight: bold;
+}
+</style>
diff --git a/frontend/src/components/book/BookEditForm.vue b/frontend/src/components/book/BookEditForm.vue
new file mode 100644
index 0000000000000000000000000000000000000000..901c8f8ff01f27f0aa8c4045b0d35cd2e943c85d
--- /dev/null
+++ b/frontend/src/components/book/BookEditForm.vue
@@ -0,0 +1,805 @@
+<template>
+  <form
+    class="book-form"
+    novalidate
+    :aria-labelledby="`${idPrefix}-heading`"
+    @submit.prevent="submit"
+  >
+    <header class="form-header">
+      <h2 :id="`${idPrefix}-heading`">{{ isCreate ? t('bookForm.newTitle') : t('bookForm.editTitle') }}</h2>
+      <p v-if="isCreate">{{ t('bookForm.newSubtitle') }}</p>
+    </header>
+
+    <div class="form-scroll">
+      <aside class="cover-column">
+        <CoverDrop
+          :id="`${idPrefix}-cover`"
+          :image-url="coverPreview"
+          :caption="coverCaption"
+          :error="errors.cover"
+          @select="onCoverSelect"
+        />
+      </aside>
+
+      <div class="fields-column">
+        <div
+          class="isbn-row"
+          :class="{ single: !isCreate }"
+        >
+          <TextField
+            :id="`${idPrefix}-isbn`"
+            ref="isbnField"
+            v-model="form.isbn"
+            :label="t('bookForm.isbn')"
+            inputmode="numeric"
+            :error="errors.isbn"
+            :hint="isCreate ? lookupMessage : ''"
+            hint-live
+            :input-attrs="isCreate ? { onKeydown: onIsbnKeydown } : {}"
+          />
+          <Button
+            v-if="isCreate"
+            type="button"
+            :label="t('isbn.search')"
+            icon="pi pi-search"
+            class="p-button-outlined isbn-btn"
+            :loading="lookingUp"
+            :disabled="!form.isbn.trim()"
+            @click="lookupIsbn"
+          />
+        </div>
+
+        <TextField
+          :id="`${idPrefix}-title`"
+          v-model="form.title"
+          :label="t('bookForm.title')"
+          :error="errors.title"
+          required
+          large
+        />
+
+        <AuthorsInput
+          v-model="form.authorNames"
+          :input-id="`${idPrefix}-authors`"
+          :label="t('bookForm.authors')"
+          :error="errors.authors"
+          required
+        />
+
+        <fieldset class="form-group">
+          <legend>{{ t('bookForm.aboutSection') }}</legend>
+
+          <div class="grid-2">
+            <TextField
+              :id="`${idPrefix}-publisher`"
+              v-model="form.publisher"
+              :label="t('bookForm.publisher')"
+              :error="errors.publisher"
+            />
+            <DateField
+              :id="`${idPrefix}-pubdate`"
+              v-model="form.pubdate"
+              :label="t('bookForm.pubDate')"
+              :error="errors.pubDate"
+            />
+          </div>
+
+          <div class="grid-series">
+            <TextField
+              :id="`${idPrefix}-series`"
+              v-model="form.series"
+              :label="t('series.name')"
+              :list="`${idPrefix}-series-options`"
+              maxlength="200"
+              :error="errors.series"
+              :input-attrs="{ onFocus: loadSeriesOptions }"
+            />
+            <TextField
+              :id="`${idPrefix}-volume`"
+              v-model="form.series_index"
+              :label="t('series.volume')"
+              inputmode="decimal"
+              maxlength="7"
+              :error="errors.seriesIndex"
+            />
+          </div>
+          <datalist :id="`${idPrefix}-series-options`">
+            <option
+              v-for="item in seriesOptions"
+              :key="item.name"
+              :value="item.name"
+            ></option>
+          </datalist>
+
+          <TextField
+            :id="`${idPrefix}-tags`"
+            v-model="form.tags"
+            :label="t('bookForm.tags')"
+            :hint="t('bookForm.tagsHint')"
+            :error="errors.tags"
+          />
+        </fieldset>
+
+        <fieldset class="form-group">
+          <legend>{{ t('bookForm.readingSection') }}</legend>
+
+          <div>
+            <FieldLabel :id="`${idPrefix}-status-label`">{{ t('status.label') }}</FieldLabel>
+            <div
+              class="status-picker"
+              role="group"
+              :aria-labelledby="`${idPrefix}-status-label`"
+            >
+              <PillButton
+                v-for="option in STATUS_OPTIONS"
+                :key="option"
+                :icon="STATUS_ICONS[option]"
+                :label="t(`status.${option}`)"
+                :active="status === option"
+                @click="pickStatus(option)"
+              />
+            </div>
+            <p class="status-caption">{{ statusCaption }}</p>
+          </div>
+
+          <DateField
+            v-if="status === 'read' || status === 'reading'"
+            :id="`${idPrefix}-status-date`"
+            v-model="statusDate"
+            :label="status === 'read' ? t('bookForm.readOn') : t('bookForm.startedOn')"
+            :max-date="today"
+            :error="errors.statusDate"
+          />
+
+          <div>
+            <FieldLabel :id="`${idPrefix}-rating-label`">{{ t('rating.label') }}</FieldLabel>
+            <StarRating
+              v-model="form.rating"
+              size="lg"
+              :label="t('rating.label')"
+            />
+            <small
+              v-if="errors.rating"
+              class="inline-error"
+            >{{ errors.rating }}</small>
+          </div>
+
+          <TextField
+            :id="`${idPrefix}-notes`"
+            v-model="form.notes"
+            :label="t('notes.label')"
+            :hint="`${t('notes.privateHint')} · ${(form.notes || '').length}/5000`"
+            :error="errors.notes"
+            multiline
+            rows="3"
+            maxlength="5000"
+          />
+        </fieldset>
+      </div>
+    </div>
+
+    <footer class="form-footer">
+      <Button
+        type="button"
+        :label="t('common.cancel')"
+        class="p-button-text p-button-secondary"
+        :disabled="saving"
+        @click="emit('cancel')"
+      />
+      <Button
+        type="submit"
+        :label="isCreate ? t('bookForm.submitCreate') : t('bookForm.submitEdit')"
+        :icon="isCreate ? 'pi pi-plus' : 'pi pi-check'"
+        class="btn-action-primary"
+        :loading="saving"
+      />
+    </footer>
+  </form>
+</template>
+
+<script setup>
+import { computed, nextTick, reactive, ref, watch, onBeforeUnmount } from 'vue'
+import { useI18n } from 'vue-i18n'
+import Button from 'primevue/button'
+import { useToast } from 'primevue/usetoast'
+import { useConfirm } from 'primevue/useconfirm'
+import api from '../../services/api.js'
+import AuthorsInput from '../AuthorsInput.vue'
+import StarRating from '../StarRating.vue'
+import TextField from '../form/TextField.vue'
+import DateField from '../form/DateField.vue'
+import FieldLabel from '../form/FieldLabel.vue'
+import PillButton from '../form/PillButton.vue'
+import CoverDrop from '../form/CoverDrop.vue'
+import { toApiDate } from '../../utils/dates.js'
+import { statusOf, STATUS_OPTIONS, STATUS_ICONS } from '../../utils/readingStatus.js'
+import { validateImageFile, createPreviewHandle } from '../../utils/files.js'
+import { coverUrl } from '../../utils/covers.js'
+import { fieldErrorFromApi, FIELD_ORDER } from '../../utils/bookFormErrors.js'
+
+/**
+ * Formulário de livro, o mesmo no "Novo livro" e na edição.
+ *   mode="create": POST /library (+ status de leitura, se escolhido)
+ *   mode="edit":   PUT /library/:id (+ status e capa, se mudaram)
+ * Emite 'saved' com o resultado e 'cancel'.
+ */
+const props = defineProps({
+  mode: { type: String, default: 'create' },
+  bookId: { type: Number, default: null },
+  // Livro no formato do BookDialog (authorNames, read_date, pubdate…)
+  initial: { type: Object, default: null },
+  // Versão da capa atual (cache-buster), só na edição
+  coverVersion: { type: Number, default: 0 },
+  idPrefix: { type: String, default: 'book-form' },
+  // Pergunta antes de salvar (usado na edição)
+  confirmMessage: { type: String, default: '' }
+})
+
+const emit = defineEmits(['saved', 'cancel'])
+const { t } = useI18n()
+const toast = useToast()
+const confirm = useConfirm()
+
+const isCreate = computed(() => props.mode === 'create')
+// Data de leitura não pode estar no futuro (o servidor também recusa).
+const today = new Date()
+
+function blankForm() {
+  return { title: '', authorNames: [], publisher: '', tags: '', isbn: '', pubdate: null, rating: null, series: '', series_index: '', notes: '' }
+}
+
+const form = reactive(blankForm())
+const status = ref('none')
+const statusDate = ref(null)
+const initialStatus = ref('none')
+const initialStatusDate = ref(null)
+const errors = reactive({})
+const saving = ref(false)
+const isbnField = ref(null)
+
+function load() {
+  const source = props.initial || {}
+  Object.assign(form, blankForm(), {
+    title: source.title || '',
+    authorNames: [...(source.authorNames || [])],
+    publisher: source.publisher || '',
+    tags: source.tags || '',
+    isbn: source.isbn || '',
+    pubdate: source.pubdate ? new Date(source.pubdate) : null,
+    rating: source.rating ?? null,
+    series: source.series || '',
+    series_index: source.series_index ?? '',
+    notes: source.notes || ''
+  })
+  initialStatus.value = statusOf(source)
+  status.value = initialStatus.value
+  const date = initialStatus.value === 'read' ? source.read_date : initialStatus.value === 'reading' ? source.started_at : null
+  initialStatusDate.value = date ? new Date(date) : null
+  statusDate.value = initialStatusDate.value
+  clearErrors()
+  clearCover()
+  resetLookup()
+}
+
+function clearErrors() {
+  Object.keys(errors).forEach(key => { delete errors[key] })
+}
+
+// ---------------------------------------------------------------- status
+
+function pickStatus(option) {
+  status.value = status.value === option ? 'none' : option
+  if ((status.value === 'read' || status.value === 'reading') && !statusDate.value) {
+    const now = new Date()
+    statusDate.value = new Date(now.getFullYear(), now.getMonth(), now.getDate())
+  }
+  delete errors.statusDate
+}
+
+const statusCaption = computed(() => {
+  if (status.value === 'want') return t('status.wantCaption')
+  if (status.value === 'none') return t('bookForm.statusNone')
+  return t('bookForm.statusClear')
+})
+
+// ---------------------------------------------------------------- capa
+
+const selectedFile = ref(null)
+const preview = createPreviewHandle()
+const filePreviewUrl = ref('')
+
+function clearCover() {
+  selectedFile.value = null
+  filePreviewUrl.value = ''
+  preview.clear()
+}
+
+function onCoverSelect(file) {
+  const problem = validateImageFile(file)
+  if (problem) {
+    errors.cover = t(problem.key, problem.params || {})
+    return
+  }
+  delete errors.cover
+  selectedFile.value = file
+  filePreviewUrl.value = preview.set(file)
+  lookup.coverId = null
+}
+
+const coverPreview = computed(() => {
+  if (filePreviewUrl.value) return filePreviewUrl.value
+  if (lookup.coverId) return api.isbnCoverUrl(lookup.coverId)
+  if (!isCreate.value && props.bookId) return coverUrl(props.bookId, props.coverVersion)
+  return ''
+})
+
+const coverCaption = computed(() => {
+  if (selectedFile.value) return selectedFile.value.name
+  if (lookup.coverId) return t('bookForm.cover.fromIsbn')
+  return ''
+})
+
+onBeforeUnmount(() => preview.clear())
+
+// ---------------------------------------------------------------- séries
+
+const seriesOptions = ref([])
+async function loadSeriesOptions() {
+  if (seriesOptions.value.length) return
+  try {
+    seriesOptions.value = await api.getSeries()
+  } catch {
+    seriesOptions.value = []
+  }
+}
+
+// ---------------------------------------------------------------- ISBN
+
+// As chaves do Open Library só valem para o ISBN buscado; se a pessoa trocar
+// o ISBN depois, elas não são enviadas.
+const lookup = reactive({ isbn: null, olWorkKey: null, olEditionKey: null, coverId: null })
+const lookingUp = ref(false)
+const lookupState = ref('idle') // idle | found | missing | error
+
+function resetLookup() {
+  Object.assign(lookup, { isbn: null, olWorkKey: null, olEditionKey: null, coverId: null })
+  lookupState.value = 'idle'
+}
+
+const lookupMessage = computed(() => {
+  if (lookupState.value === 'found') return t('isbn.found')
+  if (lookupState.value === 'missing') return t('isbn.not_found')
+  if (lookupState.value === 'error') return t('isbn.error')
+  return t('isbn.hint')
+})
+
+watch(() => form.isbn, value => {
+  delete errors.isbn
+  if (lookup.isbn && value.trim() !== lookup.isbn) resetLookup()
+})
+
+function onIsbnKeydown(event) {
+  if (event.key === 'Enter') {
+    event.preventDefault()
+    lookupIsbn()
+  }
+}
+
+function parseApiDate(value) {
+  if (!value) return null
+  const [year, month, day] = value.split('-').map(Number)
+  return new Date(year, month - 1, day)
+}
+
+// Preenche só os campos vazios: o que a pessoa já digitou tem prioridade.
+async function lookupIsbn() {
+  const isbn = form.isbn.trim()
+  if (!isbn || lookingUp.value) return
+
+  lookingUp.value = true
+  delete errors.isbn
+  try {
+    const found = await api.lookupIsbn(isbn)
+    if (!form.title.trim() && found.title) form.title = found.title
+    if (form.authorNames.length === 0 && found.authors?.length) form.authorNames = [...found.authors]
+    if (!form.publisher.trim() && found.publisher) form.publisher = found.publisher
+    if (!form.pubdate && found.pubDate) form.pubdate = parseApiDate(found.pubDate)
+
+    Object.assign(lookup, {
+      isbn,
+      olWorkKey: found.olWorkKey,
+      olEditionKey: found.olEditionKey,
+      coverId: selectedFile.value ? null : found.coverId
+    })
+    lookupState.value = 'found'
+  } catch (error) {
+    resetLookup()
+    if (error.status === 404) lookupState.value = 'missing'
+    else if (error.status === 400) errors.isbn = t('isbn.invalid')
+    else lookupState.value = 'error'
+  } finally {
+    lookingUp.value = false
+  }
+}
+
+// ---------------------------------------------------------------- validação
+
+watch(() => form.title, () => { delete errors.title })
+watch(() => form.authorNames, () => { delete errors.authors })
+watch(() => form.series_index, () => { delete errors.seriesIndex })
+watch(() => form.pubdate, () => { delete errors.pubDate })
+watch(statusDate, () => { delete errors.statusDate })
+
+function validate() {
+  clearErrors()
+  if (!form.title.trim()) errors.title = t('bookForm.errors.titleRequired')
+  if (form.authorNames.length === 0) errors.authors = t('bookForm.errors.authorsRequired')
+  const volume = String(form.series_index ?? '').trim()
+  if (volume) {
+    const number = Number(volume.replace(',', '.'))
+    if (!Number.isFinite(number) || number < 0 || number > 9999) errors.seriesIndex = t('bookForm.errors.volume')
+  }
+  // Compara só o dia (texto YYYY-MM-DD), sem a hora
+  if (statusDate.value && toApiDate(statusDate.value) > toApiDate(new Date()) && (status.value === 'read' || status.value === 'reading')) {
+    errors.statusDate = t('bookForm.errors.futureDate')
+  }
+  return Object.keys(errors).length === 0
+}
+
+const FIELD_IDS = {
+  isbn: 'isbn',
+  title: 'title',
+  authors: 'authors',
+  publisher: 'publisher',
+  pubDate: 'pubdate',
+  series: 'series',
+  seriesIndex: 'volume',
+  tags: 'tags',
+  statusDate: 'status-date',
+  rating: 'rating-label',
+  notes: 'notes',
+  cover: 'cover'
+}
+
+async function focusFirstError() {
+  await nextTick()
+  const first = FIELD_ORDER.find(key => errors[key])
+  if (!first) return
+  const el = document.getElementById(`${props.idPrefix}-${FIELD_IDS[first]}`)
+  el?.focus({ preventScroll: true })
+  el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
+}
+
+// ---------------------------------------------------------------- salvar
+
+function readDateToSend() {
+  if (status.value === 'read') return toApiDate(statusDate.value || new Date())
+  // Releitura: "Lendo" num livro já lido mantém a data antiga
+  if (status.value === 'reading' && props.initial?.read_date) return toApiDate(props.initial.read_date)
+  return null
+}
+
+function statusChanged() {
+  if (status.value !== initialStatus.value) return true
+  return status.value !== 'none' && status.value !== 'want' &&
+    toApiDate(statusDate.value) !== toApiDate(initialStatusDate.value)
+}
+
+async function submit() {
+  if (saving.value) return
+  if (!validate()) {
+    focusFirstError()
+    return
+  }
+  if (props.confirmMessage && !(await askConfirm())) return
+
+  saving.value = true
+  try {
+    if (isCreate.value) await create()
+    else await update()
+  } catch (error) {
+    const fieldError = fieldErrorFromApi(error, t)
+    if (fieldError) {
+      errors[fieldError.field] = fieldError.message
+      focusFirstError()
+    } else {
+      toast.add({ severity: 'error', summary: t('common.error'), detail: error.message || t('book.toast_error'), life: 5000 })
+    }
+  } finally {
+    saving.value = false
+  }
+}
+
+function askConfirm() {
+  return new Promise(resolve => {
+    confirm.require({
+      message: props.confirmMessage,
+      header: t('bookDialog.confirm'),
+      icon: 'pi pi-exclamation-circle',
+      acceptClass: 'btn-action-primary',
+      rejectClass: 'p-button-text p-button-secondary',
+      acceptLabel: t('bookDialog.save'),
+      rejectLabel: t('bookDialog.cancel'),
+      accept: () => resolve(true),
+      reject: () => resolve(false),
+      onHide: () => resolve(false)
+    })
+  })
+}
+
+async function applyStatus(bookId) {
+  const date = status.value === 'reading' || status.value === 'read' ? toApiDate(statusDate.value) : undefined
+  return api.setReadingStatus(bookId, status.value, date || undefined)
+}
+
+async function create() {
+  const data = new FormData()
+  data.append('title', form.title.trim())
+  // Um campo "authors" por autor: nomes podem conter vírgula.
+  form.authorNames.forEach(name => data.append('authors', name))
+  data.append('publisher', form.publisher || '')
+  data.append('isbn', form.isbn || '')
+  data.append('tags', form.tags || '')
+  if (form.pubdate) data.append('pubDate', toApiDate(form.pubdate))
+  const readDate = readDateToSend()
+  if (readDate) data.append('readDate', readDate)
+  if (form.rating) data.append('rating', String(form.rating))
+  if (form.series?.trim()) data.append('series', form.series.trim())
+  if (String(form.series_index ?? '').trim()) data.append('seriesIndex', String(form.series_index).trim())
+  if (form.notes?.trim()) data.append('notes', form.notes)
+
+  if (lookup.isbn && lookup.isbn === form.isbn.trim()) {
+    if (lookup.olWorkKey) data.append('olWorkKey', lookup.olWorkKey)
+    if (lookup.olEditionKey) data.append('olEditionKey', lookup.olEditionKey)
+    if (!selectedFile.value && lookup.coverId) data.append('olCoverId', String(lookup.coverId))
+  }
+  if (selectedFile.value) data.append('coverImage', selectedFile.value)
+
+  const result = await api.createBook(data)
+
+  // "Quero ler" e "Lendo" vão por PATCH /library/:id/status (o POST só conhece a data de leitura)
+  let statusSaved = true
+  if (status.value === 'want' || status.value === 'reading') {
+    try {
+      await applyStatus(result.bookId)
+    } catch {
+      statusSaved = false
+    }
+  }
+
+  const expectedCover = selectedFile.value || data.has('olCoverId')
+  if (!statusSaved) {
+    toast.add({ severity: 'warn', summary: t('common.success'), detail: t('bookForm.statusNotSaved'), life: 6000 })
+  } else if (expectedCover && result?.coverSaved === false) {
+    toast.add({ severity: 'warn', summary: t('common.success'), detail: t('book.cover_not_saved'), life: 6000 })
+  } else {
+    toast.add({ severity: 'success', summary: t('common.success'), detail: t('book.toast_added'), life: 3000 })
+  }
+  emit('saved', result)
+}
+
+async function update() {
+  const response = await api.updateBook(props.bookId, {
+    title: form.title.trim(),
+    authors: form.authorNames,
+    publisher: form.publisher,
+    tags: form.tags.split(',').map(tag => tag.trim()).filter(Boolean),
+    isbn: form.isbn,
+    rating: form.rating,
+    pubDate: toApiDate(form.pubdate),
+    readDate: readDateToSend(),
+    series: (form.series || '').trim(),
+    seriesIndex: String(form.series_index ?? '').trim() || null,
+    notes: form.notes || ''
+  })
+  const book = { ...response.book }
+
+  if (statusChanged() && status.value !== 'read' || (status.value === 'read' && initialStatus.value !== 'read' && initialStatus.value !== 'none')) {
+    const result = await applyStatus(props.bookId)
+    book.read_date = result.readDate
+    book.started_at = result.startedAt
+    book.reading_status = result.status === 'want' || result.status === 'reading' ? result.status : null
+  }
+
+  let coverChanged = false
+  if (selectedFile.value) {
+    const data = new FormData()
+    data.append('coverImage', selectedFile.value)
+    await api.updateCover(props.bookId, data)
+    coverChanged = true
+  }
+
+  toast.add({ severity: 'success', summary: t('bookDialog.success'), detail: t('bookDialog.changesSaved'), life: 3000 })
+  emit('saved', { book, coverChanged })
+}
+
+// Carrega o livro depois de tudo declarado (load usa capa e busca por ISBN)
+watch(() => props.initial, load, { immediate: true })
+
+defineExpose({ focusIsbn: () => isbnField.value?.focus() })
+</script>
+
+<style scoped>
+.book-form {
+  display: flex;
+  flex-direction: column;
+  min-height: 0;
+  height: 100%;
+  max-height: inherit;
+}
+
+.form-scroll {
+  flex: 1;
+  min-height: 0;
+  overflow-y: auto;
+  display: grid;
+  grid-template-columns: 220px minmax(0, 1fr);
+  gap: 2rem;
+  padding: 1.5rem 2.25rem;
+}
+
+.cover-column {
+  position: sticky;
+  top: 0;
+  align-self: start;
+}
+
+.fields-column {
+  display: flex;
+  flex-direction: column;
+  gap: 1.1rem;
+  min-width: 0;
+}
+
+/* Título fora da área que rola, com espaço para o X do canto */
+.form-header {
+  flex-shrink: 0;
+  padding: 1.5rem 4rem 1rem 2.25rem;
+  border-bottom: 1px solid var(--border-color);
+}
+
+.form-header h2 {
+  font-family: var(--font-display);
+  font-size: var(--fs-2xl);
+  font-weight: 700;
+  margin: 0;
+  line-height: 1.15;
+  color: var(--text-primary);
+}
+
+.form-header p {
+  margin: 0.35rem 0 0;
+  color: var(--text-secondary);
+  font-size: var(--fs-md);
+}
+
+.isbn-row {
+  display: grid;
+  grid-template-columns: minmax(0, 1fr) auto;
+  gap: 0.5rem;
+  align-items: start;
+}
+
+.isbn-row.single {
+  grid-template-columns: minmax(0, 1fr);
+}
+
+.isbn-btn.p-button {
+  height: 3.25rem;
+  border-radius: 10px;
+}
+
+.form-group {
+  border: none;
+  margin: 0.5rem 0 0;
+  padding: 1.1rem 0 0;
+  border-top: 1px solid var(--border-color);
+  display: flex;
+  flex-direction: column;
+  gap: 1rem;
+  min-width: 0;
+}
+
+.form-group legend {
+  float: left;
+  width: 100%;
+  padding: 0;
+  margin-bottom: 0.1rem;
+  font-size: var(--fs-sm);
+  font-weight: 700;
+  color: var(--text-primary);
+}
+
+.grid-2 {
+  display: grid;
+  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
+  gap: 1rem;
+}
+
+.grid-series {
+  display: grid;
+  grid-template-columns: minmax(0, 1fr) 7rem;
+  gap: 1rem;
+}
+
+.status-picker {
+  display: flex;
+  flex-wrap: wrap;
+  gap: 0.4rem;
+}
+
+.status-caption {
+  margin: 0.45rem 0 0;
+  font-size: var(--fs-xs);
+  color: var(--text-muted);
+}
+
+.inline-error {
+  display: block;
+  margin-top: 0.3rem;
+  color: var(--red);
+  font-size: var(--fs-xs);
+}
+
+/* Rodapé fora da área que rola: Salvar sempre à vista */
+.form-footer {
+  flex-shrink: 0;
+  display: flex;
+  justify-content: flex-end;
+  gap: 0.75rem;
+  padding: 0.9rem 2.25rem;
+  border-top: 1px solid var(--border-color);
+  background: var(--bg-panel);
+}
+
+.form-footer :deep(.p-button-secondary.p-button-text) {
+  color: var(--text-secondary);
+}
+
+@media (max-width: 768px) {
+  .form-scroll {
+    grid-template-columns: minmax(0, 1fr);
+    gap: 1.25rem;
+    padding: 1.25rem 1.25rem 1rem;
+  }
+
+  /* Capa compacta no topo: o formulário começa logo abaixo */
+  .cover-column {
+    position: static;
+  }
+
+  .form-header {
+    padding: 1rem 3.75rem 0.85rem 1.25rem;
+  }
+
+  .form-header h2 {
+    font-size: var(--fs-xl);
+  }
+
+  .form-header p {
+    font-size: var(--fs-sm);
+  }
+
+  .form-footer {
+    padding: 0.75rem 1.25rem calc(0.75rem + env(safe-area-inset-bottom));
+  }
+
+  .form-footer :deep(.p-button) {
+    white-space: nowrap;
+  }
+
+  .form-footer :deep(.btn-action-primary) {
+    flex: 1;
+  }
+
+  .form-footer :deep(.btn-action-primary .p-button-icon) {
+    display: none;
+  }
+}
+
+@media (max-width: 480px) {
+  .grid-2 {
+    grid-template-columns: minmax(0, 1fr);
+  }
+}
+</style>
diff --git a/frontend/src/components/book/BookView.vue b/frontend/src/components/book/BookView.vue
new file mode 100644
index 0000000000000000000000000000000000000000..427d0df24924f8abdc42f9bcbdbade6143a00ffb
--- /dev/null
+++ b/frontend/src/components/book/BookView.vue
@@ -0,0 +1,481 @@
+<template>
+  <div class="book-view">
+    <div class="details-header">
+      <div class="title-area">
+        <h1 class="book-title">{{ loading ? t('bookDialog.loading') : (book.title || t('bookDialog.noTitle')) }}
+        </h1>
+        <h2 class="book-author">{{ book.authors || (loading ? '' : t('bookDialog.unknownAuthor')) }}</h2>
+        <template v-if="book.series && !loading">
+          <router-link
+            v-if="!isReadOnly"
+            :to="{ name: 'library', query: { series: book.series, sort: 'series', order: 'asc' } }"
+            class="series-line"
+            :title="t('series.seeAll', { series: book.series })"
+            @click="emit('navigate')"
+          >
+            <i
+              class="pi pi-clone"
+              aria-hidden="true"
+            ></i>
+            {{ seriesLabel }}
+          </router-link>
+          <span
+            v-else
+            class="series-line"
+          >
+            <i
+              class="pi pi-clone"
+              aria-hidden="true"
+            ></i>
+            {{ seriesLabel }}
+          </span>
+        </template>
+        <template v-if="!loading && !loadFailed">
+          <StarRating
+            v-if="!isReadOnly"
+            :model-value="book.rating"
+            class="rating-row"
+            :disabled="ratingSaving"
+            :label="t('rating.label')"
+            @update:model-value="value => emit('rate', value)"
+          />
+          <StarRating
+            v-else-if="book.rating"
+            :model-value="book.rating"
+            class="rating-row"
+            readonly
+          />
+        </template>
+      </div>
+    </div>
+
+    <div
+      v-if="!loading && !loadFailed"
+      class="details-content"
+    >
+      <div
+        v-if="!isReadOnly"
+        class="read-state"
+      >
+        <div
+          class="status-picker"
+          role="group"
+          :aria-label="t('status.label')"
+        >
+          <PillButton
+            v-for="option in STATUS_OPTIONS"
+            :key="option"
+            :icon="STATUS_ICONS[option]"
+            :label="t(`status.${option}`)"
+            :active="currentStatus === option"
+            :disabled="readSaving"
+            @click="emit('change-status', option)"
+          />
+        </div>
+        <p
+          v-if="statusCaption"
+          class="status-caption"
+        >
+          {{ statusCaption }}
+          <button
+            type="button"
+            class="link-btn"
+            :disabled="readSaving"
+            @click="emit('change-status', currentStatus)"
+          >{{ t('status.clear') }}</button>
+        </p>
+      </div>
+      <div
+        v-else-if="currentStatus !== 'none'"
+        class="read-state"
+      >
+        <span class="read-pill">
+          <i
+            :class="STATUS_ICONS[currentStatus]"
+            aria-hidden="true"
+          ></i>
+          {{ statusCaption }}
+        </span>
+      </div>
+
+      <ul
+        v-if="metaItems.length"
+        class="meta-line"
+      >
+        <li
+          v-for="item in metaItems"
+          :key="item.key"
+          :title="item.title"
+        >{{ item.text }}</li>
+      </ul>
+
+      <p
+        v-if="showIsbnWarning"
+        id="book-isbn-warning"
+        class="isbn-warning"
+      >
+        <i
+          class="pi pi-exclamation-triangle"
+          aria-hidden="true"
+        ></i>
+        {{ t('bookDialog.isbnInvalid') }}
+      </p>
+
+      <div
+        v-if="tagList.length"
+        class="tags-list"
+        :aria-label="t('bookDialog.tags')"
+      >
+        <span
+          v-for="(tag, index) in tagList"
+          :key="`${tag}-${index}`"
+          class="tag-chip"
+          :style="{ '--tag-color': tagColor(tag) }"
+        >{{ tag }}</span>
+      </div>
+
+      <section
+        v-if="!isReadOnly && book.notes"
+        class="notes-section"
+        aria-labelledby="book-notes-title"
+      >
+        <h3 id="book-notes-title">
+          <i
+            class="pi pi-pencil"
+            aria-hidden="true"
+          ></i>
+          {{ t('notes.title') }}
+        </h3>
+        <p class="notes-text">{{ book.notes }}</p>
+      </section>
+    </div>
+  </div>
+</template>
+
+<script setup>
+import { computed } from 'vue'
+import { useI18n } from 'vue-i18n'
+import StarRating from '../StarRating.vue'
+import PillButton from '../form/PillButton.vue'
+import { tagColor } from '../../utils/tagColors.js'
+import { statusOf, STATUS_OPTIONS, STATUS_ICONS } from '../../utils/readingStatus.js'
+import { seriesText } from '../../utils/series.js'
+
+/**
+ * O livro aberto, em modo leitura: título, status, editora/ano/ISBN, tags e
+ * anotação. Quem salva status e nota é o BookDialog (eventos change-status e rate).
+ */
+const props = defineProps({
+  book: { type: Object, required: true },
+  isReadOnly: { type: Boolean, default: false },
+  loading: { type: Boolean, default: false },
+  loadFailed: { type: Boolean, default: false },
+  readSaving: { type: Boolean, default: false },
+  ratingSaving: { type: Boolean, default: false }
+})
+
+const emit = defineEmits(['change-status', 'rate', 'navigate'])
+const { t, locale } = useI18n()
+
+const tagList = computed(() => {
+  if (!props.book.tags) return []
+  return props.book.tags.split(',').map(tag => tag.trim()).filter(Boolean)
+})
+
+const showIsbnWarning = computed(() => !props.loading && !props.book.isbnValid)
+
+function formatDate(value) {
+  const date = value instanceof Date ? value : new Date(value)
+  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(locale.value)
+}
+
+// Editora · ano · ISBN numa linha só; a data completa fica no title.
+const metaItems = computed(() => {
+  const items = []
+  if (props.book.publisher) items.push({ key: 'publisher', text: props.book.publisher })
+  if (props.book.pubdate) {
+    items.push({
+      key: 'year',
+      text: String(props.book.pubdate.getFullYear()),
+      title: t('bookDialog.publishedOn', { date: formatDate(props.book.pubdate) })
+    })
+  }
+  if (props.book.isbn) items.push({ key: 'isbn', text: `ISBN ${props.book.isbn}` })
+  return items
+})
+
+const currentStatus = computed(() => statusOf(props.book))
+
+const seriesLabel = computed(() => seriesText(props.book, t, locale.value))
+
+const statusCaption = computed(() => {
+  const status = currentStatus.value
+  if (status === 'read') return t('bookDialog.readOn', { date: formatDate(props.book.read_date) })
+  if (status === 'reading') {
+    return props.book.started_at
+      ? t('status.readingSince', { date: formatDate(props.book.started_at) })
+      : t('status.reading')
+  }
+  if (status === 'want') return t('status.wantCaption')
+  return ''
+})
+</script>
+
+<style scoped>
+.book-view {
+  display: flex;
+  flex-direction: column;
+  gap: 1.5rem;
+}
+
+.details-header {
+  display: flex;
+  justify-content: space-between;
+  align-items: flex-start;
+  gap: 1rem;
+  /* Espaço para o X do canto não encostar no título. */
+  padding-right: 2rem;
+}
+
+.title-area {
+  flex: 1;
+  display: flex;
+  flex-direction: column;
+  gap: 0.5rem;
+}
+
+.book-title {
+  font-family: var(--font-display);
+  font-size: var(--fs-2xl);
+  font-weight: 700;
+  margin: 0;
+  line-height: 1.2;
+  color: var(--text-primary);
+}
+
+.book-author {
+  font-size: var(--fs-lg);
+  color: var(--text-secondary);
+  margin: 0;
+  font-weight: 400;
+}
+
+.rating-row {
+  margin-top: 0.35rem;
+}
+
+/* Lido / marcar como lido */
+.read-state {
+  display: flex;
+  align-items: center;
+  gap: 0.75rem;
+  flex-wrap: wrap;
+}
+
+.read-pill {
+  display: inline-flex;
+  align-items: center;
+  gap: 0.45rem;
+  padding: 0.4rem 0.85rem;
+  border-radius: 999px;
+  background: rgba(var(--main-color-rgb), 0.12);
+  color: var(--main-color);
+  font-weight: 600;
+  font-size: var(--fs-md);
+}
+
+.read-pill .pi {
+  font-size: var(--fs-sm);
+}
+
+.read-state:has(.status-picker) {
+  flex-direction: column;
+  align-items: flex-start;
+  gap: 0.5rem;
+}
+
+.status-picker {
+  display: inline-flex;
+  flex-wrap: wrap;
+  gap: 0.4rem;
+}
+
+.status-caption {
+  margin: 0;
+  font-size: var(--fs-sm);
+  color: var(--text-secondary);
+  display: flex;
+  align-items: center;
+  gap: 0.5rem;
+  flex-wrap: wrap;
+}
+
+.link-btn {
+  background: none;
+  border: none;
+  padding: 0.25rem;
+  color: var(--text-secondary);
+  font: inherit;
+  font-size: var(--fs-sm);
+  cursor: pointer;
+  text-decoration: underline;
+  text-underline-offset: 3px;
+}
+
+.link-btn:hover {
+  color: var(--text-primary);
+}
+
+.link-btn:disabled {
+  opacity: 0.5;
+  cursor: default;
+}
+
+/* Editora · ano · ISBN */
+.series-line {
+  display: inline-flex;
+  align-items: center;
+  gap: 0.4rem;
+  margin-top: 0.35rem;
+  color: var(--main-color);
+  font-size: var(--fs-md);
+  font-weight: 600;
+  text-decoration: none;
+}
+
+.series-line .pi {
+  font-size: var(--fs-sm);
+}
+
+a.series-line:hover {
+  text-decoration: underline;
+}
+
+.series-grid {
+  display: grid;
+  grid-template-columns: minmax(0, 1fr) 6.5rem;
+  gap: 1rem;
+}
+
+.notes-input {
+  resize: vertical;
+  min-height: 5.5rem;
+  font: inherit;
+  line-height: 1.5;
+}
+
+.field-hint {
+  font-size: var(--fs-xs);
+  color: var(--text-secondary);
+}
+
+.notes-section {
+  border: 1px solid var(--border-color);
+  border-radius: 12px;
+  padding: 0.85rem 1rem;
+  background: rgba(var(--main-color-rgb), 0.05);
+}
+
+.notes-section h3 {
+  margin: 0 0 0.4rem;
+  font-size: var(--fs-sm);
+  font-weight: 700;
+  text-transform: uppercase;
+  letter-spacing: 0.4px;
+  color: var(--text-secondary);
+  display: flex;
+  align-items: center;
+  gap: 0.4rem;
+}
+
+.notes-text {
+  margin: 0;
+  white-space: pre-wrap;
+  overflow-wrap: anywhere;
+  color: var(--text-primary);
+  line-height: 1.55;
+  max-height: 12rem;
+  overflow-y: auto;
+}
+
+.meta-line {
+  list-style: none;
+  margin: 0;
+  padding: 0;
+  display: flex;
+  flex-wrap: wrap;
+  color: var(--text-secondary);
+  font-size: var(--fs-md);
+  line-height: 1.6;
+}
+
+.meta-line li+li::before {
+  content: '·';
+  margin: 0 0.5rem;
+  color: var(--text-muted);
+}
+
+.isbn-warning {
+  display: flex;
+  align-items: center;
+  gap: 0.4rem;
+  margin: -0.4rem 0 0;
+  color: #f59e0b;
+  font-size: var(--fs-sm);
+}
+
+.tags-list {
+  display: flex;
+  flex-wrap: wrap;
+  gap: 0.4rem;
+}
+
+.tag-chip {
+  font-size: var(--fs-sm);
+  font-weight: 500;
+  padding: 0.25rem 0.7rem;
+  border-radius: 999px;
+  color: var(--tag-color);
+  background: color-mix(in srgb, var(--tag-color) 12%, transparent);
+  border: 1px solid color-mix(in srgb, var(--tag-color) 35%, transparent);
+}
+
+.details-content {
+  display: flex;
+  flex-direction: column;
+  gap: 1.1rem;
+}
+
+.title-area {
+  flex: 1;
+  display: flex;
+  flex-direction: column;
+  gap: 0.5rem;
+}
+
+.book-title {
+  font-family: var(--font-display);
+  font-size: var(--fs-2xl);
+  font-weight: 700;
+  margin: 0;
+  line-height: 1.2;
+  color: var(--text-primary);
+}
+
+.book-author {
+  font-size: var(--fs-lg);
+  color: var(--text-secondary);
+  margin: 0;
+  font-weight: 400;
+}
+
+@media (max-width: 768px) {
+  .book-title {
+    font-size: var(--fs-xl);
+  }
+
+  .details-header {
+    padding-right: 0;
+  }
+}
+</style>
diff --git a/frontend/src/components/form/CoverDrop.vue b/frontend/src/components/form/CoverDrop.vue
new file mode 100644
index 0000000000000000000000000000000000000000..5eca971e82419c5f1dd78e88fb61d9ca7333eaf2
--- /dev/null
+++ b/frontend/src/components/form/CoverDrop.vue
@@ -0,0 +1,281 @@
+<template>
+  <div
+    class="cover-drop"
+    :class="{ invalid: Boolean(error) }"
+  >
+    <button
+      :id="id"
+      type="button"
+      class="drop-zone"
+      :class="{ dragging, filled: showImage }"
+      :aria-label="showImage ? t('bookForm.cover.change') : t('bookForm.cover.choose')"
+      :aria-describedby="error ? `${id}-error` : `${id}-hint`"
+      @click="fileInput?.click()"
+      @dragenter.prevent="dragging = true"
+      @dragover.prevent="dragging = true"
+      @dragleave.prevent="onDragLeave"
+      @drop.prevent="onDrop"
+    >
+      <img
+        v-if="showImage"
+        :src="imageUrl"
+        alt=""
+        class="cover-image"
+        @error="broken = true"
+      />
+      <span
+        v-if="showImage"
+        class="change-overlay"
+        aria-hidden="true"
+      >
+        <i class="pi pi-image"></i>
+        {{ t('bookForm.cover.change') }}
+      </span>
+      <span
+        v-else
+        class="empty-state"
+        aria-hidden="true"
+      >
+        <i class="pi pi-image"></i>
+        <span class="empty-title">{{ dragging ? t('bookForm.cover.dropNow') : t('bookForm.cover.drop') }}</span>
+      </span>
+    </button>
+    <small
+      v-if="error"
+      :id="`${id}-error`"
+      class="field-error"
+    >
+      <i
+        class="pi pi-exclamation-circle"
+        aria-hidden="true"
+      ></i>
+      {{ error }}
+    </small>
+    <small
+      v-else
+      :id="`${id}-hint`"
+      class="field-hint"
+      :data-title="showImage ? t('bookForm.cover.change') : t('bookForm.cover.drop')"
+    >{{ caption || t('bookForm.cover.hint', { mb: MAX_UPLOAD_MB }) }}</small>
+    <input
+      ref="fileInput"
+      type="file"
+      accept="image/*"
+      class="hidden-input"
+      tabindex="-1"
+      aria-hidden="true"
+      @change="onPick"
+    />
+  </div>
+</template>
+
+<script setup>
+import { computed, ref, watch } from 'vue'
+import { useI18n } from 'vue-i18n'
+import { MAX_UPLOAD_MB } from '../../config/site.js'
+
+/**
+ * Área da capa no tamanho de uma capa (2:3): clique ou arraste uma imagem.
+ * Mostra a capa atual, a escolhida ou a que a busca por ISBN achou.
+ */
+const props = defineProps({
+  id: { type: String, required: true },
+  imageUrl: { type: String, default: '' },
+  caption: { type: String, default: '' },
+  error: { type: String, default: '' }
+})
+
+const emit = defineEmits(['select'])
+const { t } = useI18n()
+
+const fileInput = ref(null)
+const dragging = ref(false)
+const broken = ref(false)
+
+watch(() => props.imageUrl, () => { broken.value = false })
+
+const showImage = computed(() => Boolean(props.imageUrl) && !broken.value)
+
+function onDragLeave(event) {
+  if (!event.currentTarget.contains(event.relatedTarget)) dragging.value = false
+}
+
+function onDrop(event) {
+  dragging.value = false
+  const file = event.dataTransfer?.files?.[0]
+  if (file) emit('select', file)
+}
+
+function onPick(event) {
+  const file = event.target.files?.[0]
+  event.target.value = ''
+  if (file) emit('select', file)
+}
+</script>
+
+<style scoped>
+.cover-drop {
+  display: flex;
+  flex-direction: column;
+  gap: 0.4rem;
+  width: 100%;
+}
+
+.drop-zone {
+  position: relative;
+  width: 100%;
+  aspect-ratio: 2 / 3;
+  padding: 0;
+  border: 2px dashed var(--border-hover);
+  border-radius: 12px;
+  background: var(--bg-input);
+  color: var(--text-secondary);
+  font: inherit;
+  cursor: pointer;
+  overflow: hidden;
+  display: flex;
+  align-items: center;
+  justify-content: center;
+  transition: border-color 0.15s ease, background-color 0.15s ease;
+}
+
+.drop-zone:hover,
+.drop-zone.dragging {
+  border-color: var(--main-color);
+  background: rgba(var(--main-color-rgb), 0.08);
+  color: var(--text-primary);
+}
+
+.drop-zone.filled {
+  border-style: solid;
+  border-color: transparent;
+}
+
+.invalid .drop-zone {
+  border-color: var(--red);
+}
+
+.drop-zone:focus-visible {
+  outline: 2px solid var(--main-color);
+  outline-offset: 3px;
+}
+
+.cover-image {
+  position: absolute;
+  inset: 0;
+  width: 100%;
+  height: 100%;
+  object-fit: cover;
+}
+
+.change-overlay {
+  position: absolute;
+  inset: auto 0 0 0;
+  display: flex;
+  align-items: center;
+  justify-content: center;
+  gap: 0.4rem;
+  padding: 0.6rem;
+  background: linear-gradient(transparent, rgba(0, 0, 0, 0.75));
+  color: #ffffff;
+  font-size: var(--fs-sm);
+  font-weight: 600;
+  opacity: 0;
+  transition: opacity 0.15s ease;
+}
+
+.drop-zone:hover .change-overlay,
+.drop-zone:focus-visible .change-overlay {
+  opacity: 1;
+}
+
+@media (hover: none) {
+  .change-overlay {
+    opacity: 1;
+  }
+}
+
+.empty-state {
+  display: flex;
+  flex-direction: column;
+  align-items: center;
+  gap: 0.6rem;
+  padding: 1rem;
+  text-align: center;
+}
+
+.empty-state .pi {
+  font-size: var(--fs-2xl);
+  color: var(--text-muted);
+}
+
+.drop-zone:hover .empty-state .pi,
+.drop-zone.dragging .empty-state .pi {
+  color: var(--main-color);
+}
+
+.empty-title {
+  font-size: var(--fs-sm);
+  font-weight: 600;
+  line-height: 1.35;
+}
+
+.field-hint {
+  color: var(--text-muted);
+  font-size: var(--fs-xs);
+  text-align: center;
+}
+
+.field-error {
+  display: flex;
+  align-items: center;
+  justify-content: center;
+  gap: 0.35rem;
+  color: var(--red);
+  font-size: var(--fs-xs);
+  font-weight: 500;
+}
+
+.hidden-input {
+  display: none;
+}
+
+/* Celular: miniatura ao lado do texto, para o formulário começar logo */
+@media (max-width: 768px) {
+  .cover-drop {
+    flex-direction: row;
+    align-items: center;
+    gap: 0.9rem;
+  }
+
+  .drop-zone {
+    width: 76px;
+    flex-shrink: 0;
+    border-radius: 8px;
+  }
+
+  .empty-title,
+  .change-overlay {
+    display: none;
+  }
+
+  .empty-state .pi {
+    font-size: var(--fs-xl);
+  }
+
+  .field-hint,
+  .field-error {
+    text-align: left;
+    justify-content: flex-start;
+    font-size: var(--fs-sm);
+  }
+
+  .field-hint::before {
+    content: attr(data-title);
+    display: block;
+    color: var(--text-primary);
+    font-weight: 600;
+    margin-bottom: 0.15rem;
+  }
+}
+</style>
diff --git a/frontend/src/components/form/DateField.vue b/frontend/src/components/form/DateField.vue
new file mode 100644
index 0000000000000000000000000000000000000000..b8f1dca4f4b398f6898f67b4cc876faffc5297b9
--- /dev/null
+++ b/frontend/src/components/form/DateField.vue
@@ -0,0 +1,215 @@
+<template>
+  <div
+    class="date-field"
+    :class="{ invalid: Boolean(error), floated: focused || Boolean(modelValue) }"
+  >
+    <div class="field-box">
+      <input
+        v-if="native"
+        :id="id"
+        type="date"
+        class="field-control native"
+        :value="toApiDate(modelValue) || ''"
+        :max="maxDate ? toApiDate(maxDate) : undefined"
+        :aria-invalid="error ? 'true' : undefined"
+        :aria-describedby="describedBy"
+        @input="onNativeInput"
+        @focus="focused = true"
+        @blur="focused = false"
+      />
+      <Calendar
+        v-else
+        :inputId="id"
+        :modelValue="modelValue"
+        :maxDate="maxDate || undefined"
+        dateFormat="dd/mm/yy"
+        class="field-calendar"
+        :showIcon="false"
+        showButtonBar
+        :aria-invalid="error ? 'true' : undefined"
+        :aria-describedby="describedBy"
+        @update:modelValue="value => emit('update:modelValue', value || null)"
+        @focus="focused = true"
+        @blur="focused = false"
+      />
+      <label
+        :for="id"
+        class="field-label"
+      >{{ label }}</label>
+      <i
+        class="pi pi-calendar field-icon"
+        aria-hidden="true"
+      ></i>
+    </div>
+    <small
+      v-if="error"
+      :id="`${id}-error`"
+      class="field-error"
+    >
+      <i
+        class="pi pi-exclamation-circle"
+        aria-hidden="true"
+      ></i>
+      {{ error }}
+    </small>
+  </div>
+</template>
+
+<script setup>
+import { computed, ref, onMounted, onBeforeUnmount } from 'vue'
+import Calendar from 'primevue/calendar'
+import { toApiDate } from '../../utils/dates.js'
+
+/**
+ * Data com rótulo flutuante. Até 640px usa o seletor nativo do celular
+ * (<input type="date">), mais fácil de usar com o polegar que o calendário
+ * flutuante do PrimeVue.
+ */
+const props = defineProps({
+  modelValue: { type: Date, default: null },
+  id: { type: String, required: true },
+  label: { type: String, required: true },
+  error: { type: String, default: '' },
+  maxDate: { type: Date, default: null }
+})
+
+const emit = defineEmits(['update:modelValue'])
+const focused = ref(false)
+
+const query = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(max-width: 640px)') : null
+const native = ref(Boolean(query?.matches))
+const onChange = event => { native.value = event.matches }
+onMounted(() => query?.addEventListener?.('change', onChange))
+onBeforeUnmount(() => query?.removeEventListener?.('change', onChange))
+
+const describedBy = computed(() => (props.error ? `${props.id}-error` : undefined))
+
+function onNativeInput(event) {
+  const value = event.target.value
+  if (!value) return emit('update:modelValue', null)
+  const [year, month, day] = value.split('-').map(Number)
+  emit('update:modelValue', new Date(year, month - 1, day))
+}
+</script>
+
+<style scoped>
+.date-field {
+  display: flex;
+  flex-direction: column;
+  gap: 0.3rem;
+  min-width: 0;
+}
+
+.field-box {
+  position: relative;
+  background-color: var(--bg-input);
+  border: 1px solid transparent;
+  border-radius: 10px;
+  transition: border-color 0.15s ease, box-shadow 0.15s ease;
+}
+
+.field-box:focus-within {
+  border-color: var(--main-color);
+  box-shadow: 0 0 0 3px rgba(var(--main-color-rgb), 0.18);
+}
+
+.invalid .field-box {
+  border-color: var(--red);
+}
+
+.field-control,
+.field-calendar :deep(.p-inputtext) {
+  width: 100%;
+  min-height: 3.25rem;
+  background: transparent;
+  border: none;
+  outline: none;
+  box-shadow: none;
+  color: var(--text-primary);
+  font: inherit;
+  font-size: var(--fs-md);
+  padding: 1.45rem 2.5rem 0.5rem 0.9rem;
+  border-radius: 10px;
+}
+
+.field-calendar {
+  display: block;
+  width: 100%;
+}
+
+.field-calendar :deep(.p-inputtext:enabled:focus) {
+  box-shadow: none;
+  border: none;
+}
+
+/* Vazio e sem foco, o texto do seletor nativo (dd/mm/aaaa) fica escondido atrás do rótulo */
+.date-field:not(.floated) .native {
+  color: transparent;
+}
+
+.native::-webkit-calendar-picker-indicator {
+  opacity: 0;
+  position: absolute;
+  inset: 0;
+  width: auto;
+  height: auto;
+  cursor: pointer;
+}
+
+.field-label {
+  position: absolute;
+  left: 0.9rem;
+  right: 2.5rem;
+  top: 1rem;
+  color: var(--text-secondary);
+  font-size: var(--fs-md);
+  line-height: 1.2;
+  pointer-events: none;
+  transform-origin: left top;
+  white-space: nowrap;
+  overflow: hidden;
+  text-overflow: ellipsis;
+  transition: transform 0.15s ease, color 0.15s ease;
+}
+
+.floated .field-label {
+  transform: translateY(-0.6rem) scale(0.8);
+  font-weight: 600;
+}
+
+.field-box:focus-within .field-label {
+  color: var(--main-color);
+}
+
+.invalid .field-label {
+  color: var(--red);
+}
+
+.field-icon {
+  position: absolute;
+  right: 0.9rem;
+  top: 50%;
+  transform: translateY(-50%);
+  color: var(--text-muted);
+  pointer-events: none;
+}
+
+.field-error {
+  display: flex;
+  align-items: center;
+  gap: 0.35rem;
+  color: var(--red);
+  font-size: var(--fs-xs);
+  font-weight: 500;
+}
+
+.field-error .pi {
+  font-size: var(--fs-xs);
+}
+
+@media (prefers-reduced-motion: reduce) {
+  .field-label {
+    transition: none;
+  }
+}
+</style>
diff --git a/frontend/src/components/form/FieldLabel.vue b/frontend/src/components/form/FieldLabel.vue
new file mode 100644
index 0000000000000000000000000000000000000000..22556971d5976cf1301cebad3314e3b971a23710
--- /dev/null
+++ b/frontend/src/components/form/FieldLabel.vue
@@ -0,0 +1,31 @@
+<template>
+  <component
+    :is="htmlFor ? 'label' : 'span'"
+    :for="htmlFor || undefined"
+    :id="id || undefined"
+    class="field-label-static"
+  >
+    <slot />
+  </component>
+</template>
+
+<script setup>
+/**
+ * Rótulo pequeno acima de grupos que não são caixa de texto (status, nota,
+ * capa). Mesmo tamanho e peso do rótulo flutuante quando sobe.
+ */
+defineProps({
+  htmlFor: { type: String, default: '' },
+  id: { type: String, default: '' }
+})
+</script>
+
+<style scoped>
+.field-label-static {
+  display: block;
+  color: var(--text-secondary);
+  font-size: var(--fs-xs);
+  font-weight: 600;
+  margin-bottom: 0.45rem;
+}
+</style>
diff --git a/frontend/src/components/form/IconButton.vue b/frontend/src/components/form/IconButton.vue
new file mode 100644
index 0000000000000000000000000000000000000000..c9f84eeca4721575eb8b258421ffbadc5ab5bf57
--- /dev/null
+++ b/frontend/src/components/form/IconButton.vue
@@ -0,0 +1,82 @@
+<template>
+  <button
+    :type="type"
+    class="icon-button"
+    :class="[`tone-${tone}`, { active }]"
+    :aria-label="label"
+    :title="title ? label : undefined"
+  >
+    <i
+      :class="icon"
+      aria-hidden="true"
+    ></i>
+  </button>
+</template>
+
+<script setup>
+/**
+ * Botão redondo só de ícone, sempre com rótulo para leitor de tela.
+ * 34px no mouse, 44px em tela de toque (mesmo desenho, área maior).
+ */
+defineProps({
+  icon: { type: String, required: true },
+  label: { type: String, required: true },
+  type: { type: String, default: 'button' },
+  tone: { type: String, default: 'plain' }, // plain | overlay
+  active: { type: Boolean, default: false },
+  title: { type: Boolean, default: false }
+})
+</script>
+
+<style scoped>
+.icon-button {
+  display: inline-flex;
+  align-items: center;
+  justify-content: center;
+  flex-shrink: 0;
+  width: 34px;
+  height: 34px;
+  padding: 0;
+  border: none;
+  border-radius: 50%;
+  background: transparent;
+  color: var(--text-secondary);
+  cursor: pointer;
+  transition: background-color 0.15s ease, color 0.15s ease;
+}
+
+.icon-button .pi {
+  font-size: var(--fs-md);
+}
+
+.icon-button:hover {
+  background: var(--bg-hover);
+  color: var(--text-primary);
+}
+
+.icon-button.tone-overlay {
+  background: rgba(0, 0, 0, 0.35);
+  color: #ffffff;
+}
+
+.icon-button.tone-overlay:hover {
+  background: rgba(0, 0, 0, 0.55);
+}
+
+.icon-button.active {
+  background: var(--main-solid);
+  color: var(--on-main);
+}
+
+.icon-button:focus-visible {
+  outline: 2px solid var(--main-color);
+  outline-offset: 2px;
+}
+
+@media (pointer: coarse) {
+  .icon-button {
+    width: 44px;
+    height: 44px;
+  }
+}
+</style>
diff --git a/frontend/src/components/form/PillButton.vue b/frontend/src/components/form/PillButton.vue
new file mode 100644
index 0000000000000000000000000000000000000000..d2cea4330cb1922d2af1ce6b2262d79f48986a0c
--- /dev/null
+++ b/frontend/src/components/form/PillButton.vue
@@ -0,0 +1,95 @@
+<template>
+  <button
+    type="button"
+    class="pill-button"
+    :class="{ active, 'icon-only': !$slots.default && !label }"
+    :aria-pressed="pressable ? active : undefined"
+    :disabled="disabled"
+  >
+    <i
+      v-if="icon"
+      :class="icon"
+      aria-hidden="true"
+    ></i>
+    <span v-if="label">{{ label }}</span>
+    <slot />
+  </button>
+</template>
+
+<script setup>
+/**
+ * Botão redondo de alternar (status de leitura, filtros, grade/lista).
+ * Ativo = fundo na cor de destaque com texto branco.
+ */
+defineProps({
+  active: { type: Boolean, default: false },
+  icon: { type: String, default: '' },
+  label: { type: String, default: '' },
+  disabled: { type: Boolean, default: false },
+  pressable: { type: Boolean, default: true }
+})
+</script>
+
+<style scoped>
+.pill-button {
+  display: inline-flex;
+  align-items: center;
+  justify-content: center;
+  gap: 0.4rem;
+  min-height: 2.25rem;
+  padding: 0.4rem 0.9rem;
+  border-radius: 999px;
+  border: 1px solid var(--border-color);
+  background: transparent;
+  color: var(--text-secondary);
+  font: inherit;
+  font-size: var(--fs-sm);
+  font-weight: 600;
+  cursor: pointer;
+  transition: background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease;
+}
+
+.pill-button.icon-only {
+  width: 2.25rem;
+  padding: 0;
+}
+
+.pill-button .pi {
+  font-size: var(--fs-sm);
+}
+
+.pill-button:hover:not(:disabled) {
+  border-color: var(--main-color);
+  color: var(--text-primary);
+}
+
+.pill-button.active {
+  background: var(--main-solid);
+  border-color: var(--main-solid);
+  color: var(--on-main);
+}
+
+.pill-button.active:hover:not(:disabled) {
+  color: var(--on-main);
+}
+
+.pill-button:disabled {
+  opacity: 0.6;
+  cursor: progress;
+}
+
+.pill-button:focus-visible {
+  outline: 2px solid var(--main-color);
+  outline-offset: 2px;
+}
+
+@media (pointer: coarse) {
+  .pill-button {
+    min-height: 2.75rem;
+  }
+
+  .pill-button.icon-only {
+    width: 2.75rem;
+  }
+}
+</style>
diff --git a/frontend/src/components/form/TextField.vue b/frontend/src/components/form/TextField.vue
new file mode 100644
index 0000000000000000000000000000000000000000..d2fafdce5f4cb6a05180b23c1a977074cd7cdc50
--- /dev/null
+++ b/frontend/src/components/form/TextField.vue
@@ -0,0 +1,236 @@
+<template>
+  <div
+    class="text-field"
+    :class="{ invalid: Boolean(error), multiline, 'has-suffix': $slots.suffix, large }"
+  >
+    <div class="field-box">
+      <textarea
+        v-if="multiline"
+        :id="id"
+        ref="control"
+        class="field-control"
+        :value="modelValue ?? ''"
+        :rows="rows"
+        :maxlength="maxlength"
+        placeholder=" "
+        :required="required"
+        :aria-invalid="error ? 'true' : undefined"
+        :aria-describedby="describedBy"
+        @input="emit('update:modelValue', $event.target.value)"
+      ></textarea>
+      <input
+        v-else
+        :id="id"
+        ref="control"
+        class="field-control"
+        :value="modelValue ?? ''"
+        :type="type"
+        :inputmode="inputmode"
+        :maxlength="maxlength"
+        :list="list"
+        :autocomplete="autocomplete"
+        placeholder=" "
+        :required="required"
+        :aria-invalid="error ? 'true' : undefined"
+        :aria-describedby="describedBy"
+        v-bind="inputAttrs"
+        @input="emit('update:modelValue', $event.target.value)"
+      />
+      <label
+        :for="id"
+        class="field-label"
+      >{{ label }}<span
+          v-if="required"
+          class="required-mark"
+          aria-hidden="true"
+        > *</span></label>
+      <slot name="suffix" />
+    </div>
+    <small
+      v-if="error"
+      :id="`${id}-error`"
+      class="field-error"
+    >
+      <i
+        class="pi pi-exclamation-circle"
+        aria-hidden="true"
+      ></i>
+      {{ error }}
+    </small>
+    <small
+      v-if="hint"
+      :id="`${id}-hint`"
+      class="field-hint"
+      :aria-live="hintLive ? 'polite' : undefined"
+    >{{ hint }}</small>
+  </div>
+</template>
+
+<script setup>
+import { computed, ref } from 'vue'
+
+/**
+ * Campo de texto com rótulo flutuante: o rótulo fica dentro da caixa e sobe
+ * (sem sumir) quando a pessoa digita. Erro e dica ficam embaixo, ligados ao
+ * campo por aria-describedby.
+ */
+const props = defineProps({
+  modelValue: { type: [String, Number], default: '' },
+  id: { type: String, required: true },
+  label: { type: String, required: true },
+  hint: { type: String, default: '' },
+  hintLive: { type: Boolean, default: false },
+  error: { type: String, default: '' },
+  type: { type: String, default: 'text' },
+  inputmode: { type: String, default: undefined },
+  maxlength: { type: [String, Number], default: undefined },
+  list: { type: String, default: undefined },
+  autocomplete: { type: String, default: 'off' },
+  required: { type: Boolean, default: false },
+  multiline: { type: Boolean, default: false },
+  rows: { type: [String, Number], default: 3 },
+  large: { type: Boolean, default: false },
+  inputAttrs: { type: Object, default: () => ({}) }
+})
+
+const emit = defineEmits(['update:modelValue'])
+const control = ref(null)
+
+const describedBy = computed(() => {
+  const ids = []
+  if (props.error) ids.push(`${props.id}-error`)
+  if (props.hint) ids.push(`${props.id}-hint`)
+  return ids.join(' ') || undefined
+})
+
+defineExpose({ focus: () => control.value?.focus() })
+</script>
+
+<style scoped>
+.text-field {
+  display: flex;
+  flex-direction: column;
+  gap: 0.3rem;
+  min-width: 0;
+}
+
+.field-box {
+  position: relative;
+  display: flex;
+  align-items: center;
+  background-color: var(--bg-input);
+  border: 1px solid transparent;
+  border-radius: 10px;
+  transition: border-color 0.15s ease, box-shadow 0.15s ease;
+}
+
+.field-box:focus-within {
+  border-color: var(--main-color);
+  box-shadow: 0 0 0 3px rgba(var(--main-color-rgb), 0.18);
+}
+
+.invalid .field-box {
+  border-color: var(--red);
+}
+
+.invalid .field-box:focus-within {
+  box-shadow: 0 0 0 3px rgba(var(--red-rgb), 0.18);
+}
+
+.field-control {
+  flex: 1;
+  min-width: 0;
+  width: 100%;
+  background: transparent;
+  border: none;
+  outline: none;
+  color: var(--text-primary);
+  font: inherit;
+  font-size: var(--fs-md);
+  padding: 1.45rem 0.9rem 0.5rem;
+  border-radius: 10px;
+}
+
+.multiline .field-control {
+  resize: vertical;
+  min-height: 6rem;
+  line-height: 1.5;
+}
+
+.large .field-control {
+  font-size: var(--fs-lg);
+  font-weight: 600;
+}
+
+/* O placeholder é um espaço: serve só para o :placeholder-shown saber se o campo está vazio */
+.field-control::placeholder {
+  color: transparent;
+}
+
+.field-label {
+  position: absolute;
+  left: 0.9rem;
+  right: 0.9rem;
+  top: 1rem;
+  color: var(--text-secondary);
+  font-size: var(--fs-md);
+  line-height: 1.2;
+  pointer-events: none;
+  transform-origin: left top;
+  white-space: nowrap;
+  overflow: hidden;
+  text-overflow: ellipsis;
+  transition: transform 0.15s ease, color 0.15s ease;
+}
+
+.large .field-label {
+  top: 1.05rem;
+}
+
+.has-suffix .field-label {
+  right: 3rem;
+}
+
+.field-control:focus + .field-label,
+.field-control:not(:placeholder-shown) + .field-label {
+  transform: translateY(-0.6rem) scale(0.8);
+  font-weight: 600;
+}
+
+.field-control:focus + .field-label {
+  color: var(--main-color);
+}
+
+.invalid .field-label,
+.invalid .field-control:focus + .field-label {
+  color: var(--red);
+}
+
+.required-mark {
+  color: var(--text-muted);
+}
+
+.field-error {
+  display: flex;
+  align-items: center;
+  gap: 0.35rem;
+  color: var(--red);
+  font-size: var(--fs-xs);
+  font-weight: 500;
+}
+
+.field-error .pi {
+  font-size: var(--fs-xs);
+}
+
+.field-hint {
+  color: var(--text-muted);
+  font-size: var(--fs-xs);
+}
+
+@media (prefers-reduced-motion: reduce) {
+  .field-label {
+    transition: none;
+  }
+}
+</style>
diff --git a/frontend/src/locales/en.json b/frontend/src/locales/en.json
index a9cea157e37b9c9af7d8bee067e1419fe61e6acd..ba806499bd322d3a0075c31d0a82fd2c27b42bbe 100644
--- a/frontend/src/locales/en.json
+++ b/frontend/src/locales/en.json
@@ -102,6 +102,45 @@
     "quick_read_short": "Mark as read",
     "quick_unread_short": "Mark as unread"
   },
+  "bookForm": {
+    "newTitle": "New book",
+    "editTitle": "Edit book",
+    "newSubtitle": "Look it up by ISBN or fill it in by hand.",
+    "isbn": "ISBN",
+    "title": "Title",
+    "authors": "Authors",
+    "aboutSection": "About the book",
+    "readingSection": "Your reading",
+    "publisher": "Publisher",
+    "pubDate": "Publication date",
+    "tags": "Categories",
+    "tagsHint": "Separate with commas. E.g.: Fiction, Classics",
+    "statusNone": "No status: the book just sits on your shelf.",
+    "statusClear": "Tap the status again to clear it.",
+    "readOn": "Read on",
+    "startedOn": "Started reading on",
+    "submitCreate": "Add book",
+    "submitEdit": "Save",
+    "statusNotSaved": "The book was saved, but its reading status wasn't. Set it again from the book.",
+    "cover": {
+      "choose": "Choose a cover image",
+      "change": "Change cover",
+      "drop": "Drag an image here or click",
+      "dropNow": "Drop the image here",
+      "hint": "Image up to {mb} MB",
+      "fromIsbn": "Cover found by ISBN"
+    },
+    "errors": {
+      "titleRequired": "Enter the title.",
+      "authorsRequired": "Enter at least one author.",
+      "isbnDuplicate": "You already have a book with this ISBN.",
+      "invalidDate": "Invalid date.",
+      "futureDate": "The date can't be in the future.",
+      "volume": "Use a number from 0 to 9999 (e.g. 2 or 1.5).",
+      "rating": "Ratings go from 1 to 5.",
+      "coverInvalid": "This file isn't a valid image."
+    }
+  },
   "library": {
     "search_ph": "Search by title, author or ISBN...",
     "filters_adv": "Advanced Filters",
diff --git a/frontend/src/locales/pt.json b/frontend/src/locales/pt.json
index 156e9a4bfb84c828aaa2647f60706b66870260ed..ca77eb632829a6bf37446a39a13191b599f7d468 100644
--- a/frontend/src/locales/pt.json
+++ b/frontend/src/locales/pt.json
@@ -102,6 +102,45 @@
     "quick_read_short": "Marcar como lido",
     "quick_unread_short": "Desmarcar como lido"
   },
+  "bookForm": {
+    "newTitle": "Novo livro",
+    "editTitle": "Editar livro",
+    "newSubtitle": "Busque pelo ISBN ou preencha à mão.",
+    "isbn": "ISBN",
+    "title": "Título",
+    "authors": "Autores",
+    "aboutSection": "Sobre o livro",
+    "readingSection": "Sua leitura",
+    "publisher": "Editora",
+    "pubDate": "Data de publicação",
+    "tags": "Categorias",
+    "tagsHint": "Separe por vírgula. Ex.: Ficção, Clássicos",
+    "statusNone": "Sem status: o livro fica só na estante.",
+    "statusClear": "Toque de novo no status para tirar.",
+    "readOn": "Lido em",
+    "startedOn": "Começou a ler em",
+    "submitCreate": "Adicionar livro",
+    "submitEdit": "Salvar",
+    "statusNotSaved": "O livro foi salvo, mas o status de leitura não. Marque de novo pelo livro.",
+    "cover": {
+      "choose": "Escolher imagem de capa",
+      "change": "Trocar capa",
+      "drop": "Arraste uma imagem ou clique",
+      "dropNow": "Solte a imagem aqui",
+      "hint": "Imagem de até {mb} MB",
+      "fromIsbn": "Capa encontrada pelo ISBN"
+    },
+    "errors": {
+      "titleRequired": "Informe o título.",
+      "authorsRequired": "Informe pelo menos um autor.",
+      "isbnDuplicate": "Você já tem um livro com este ISBN.",
+      "invalidDate": "Data inválida.",
+      "futureDate": "A data não pode estar no futuro.",
+      "volume": "Use um número de 0 a 9999 (ex.: 2 ou 1,5).",
+      "rating": "A nota vai de 1 a 5.",
+      "coverInvalid": "Este arquivo não é uma imagem válida."
+    }
+  },
   "library": {
     "search_ph": "Pesquisar por título, autor ou ISBN...",
     "filters_adv": "Filtros Avançados",
diff --git a/frontend/src/utils/bookFormErrors.js b/frontend/src/utils/bookFormErrors.js
new file mode 100644
index 0000000000000000000000000000000000000000..931f8f77d5037bcb5f397758156865ae731f3947
--- /dev/null
+++ b/frontend/src/utils/bookFormErrors.js
@@ -0,0 +1,33 @@
+/**
+ * Erros do servidor no formulário de livro → campo e mensagem traduzida.
+ * O backend responde { error: 'texto' } com o status HTTP; aqui o texto é
+ * reconhecido para mostrar o erro embaixo do campo certo (e não num toast
+ * que some em poucos segundos). O que não for reconhecido volta null e vira
+ * toast, como antes.
+ */
+
+/** Ordem dos campos na tela: o primeiro com erro recebe o foco. */
+export const FIELD_ORDER = ['cover', 'isbn', 'title', 'authors', 'publisher', 'pubDate', 'series', 'seriesIndex', 'tags', 'statusDate', 'rating', 'notes']
+
+const RULES = [
+  { field: 'isbn', test: (msg, status) => status === 409 || /isbn/i.test(msg), key: status => (status === 409 ? 'bookForm.errors.isbnDuplicate' : 'isbn.invalid') },
+  { field: 'title', test: msg => /^title\b/i.test(msg), key: () => 'bookForm.errors.titleRequired' },
+  { field: 'authors', test: msg => /^authors\b|autor/i.test(msg), key: null },
+  { field: 'tags', test: msg => /\btags?\b/i.test(msg), key: null },
+  { field: 'pubDate', test: msg => /pubDate/.test(msg), key: () => 'bookForm.errors.invalidDate' },
+  { field: 'statusDate', test: msg => /leitura não pode estar no futuro|readDate/i.test(msg), key: () => 'bookForm.errors.futureDate' },
+  { field: 'seriesIndex', test: msg => /volume/i.test(msg), key: () => 'bookForm.errors.volume' },
+  { field: 'series', test: msg => /série|series/i.test(msg), key: null },
+  { field: 'notes', test: msg => /anotação|notes/i.test(msg), key: null },
+  { field: 'rating', test: msg => /nota|rating/i.test(msg), key: () => 'bookForm.errors.rating' },
+  { field: 'cover', test: msg => /imagem|image|arquivo/i.test(msg), key: () => 'bookForm.errors.coverInvalid' }
+]
+
+export function fieldErrorFromApi(error, t) {
+  const status = error?.status
+  if (status !== 400 && status !== 409) return null
+  const message = String(error?.message || '')
+  const rule = RULES.find(item => item.test(message, status))
+  if (!rule) return null
+  return { field: rule.field, message: rule.key ? t(rule.key(status)) : message }
+}
__LIBRISHELF_PATCH__

echo "→ Aplicando o patch…"
if git apply --check "$PATCH_FILE" 2>/dev/null; then
  git apply "$PATCH_FILE"
  echo "✓ Patch aplicado."
elif git apply --3way "$PATCH_FILE"; then
  # --3way deixa as mudanças no índice; tira de lá para você revisar e commitar
  git reset -q -- "${FILES[@]}"
  echo "✓ Patch aplicado com 3-way (algum arquivo estava reformatado)."
else
  CONFLICTS=$(git diff --name-only --diff-filter=U)
  git reset -q -- "${FILES[@]}" 2>/dev/null || true
  echo
  if [ -n "$CONFLICTS" ]; then
    echo "✗ O patch entrou, mas com conflito (marcadores <<<<<<< / >>>>>>>) em:"
    echo "$CONFLICTS" | sed 's/^/    /'
    echo "  Resolva esses trechos e rode de novo só a parte de verificação:"
    echo "    (cd backend && npm run test:unit) && (cd frontend && npm install && npm run build)"
  else
    echo "✗ O patch não entrou (nada foi alterado)."
  fi
  echo "  Para desfazer tudo deste pacote:"
  echo "    git checkout HEAD -- $(git ls-files -- "${FILES[@]}" | tr '\n' ' ')"
  NEW=$(for f in "${FILES[@]}"; do git ls-files --error-unmatch -- "$f" >/dev/null 2>&1 || printf '%s ' "$f"; done)
  [ -n "$NEW" ] && echo "    rm -f $NEW"
  exit 1
fi

# Guarda as versões exatas deste pacote no banco de objetos do git: se o
# editor reformatar os arquivos antes do commit, o --3way do próximo pacote
# ainda encontra a base certa.
git hash-object -w -- "${FILES[@]}" 2>/dev/null >/dev/null || true

[ -d frontend/node_modules ] || (cd frontend && npm ci --no-audit --no-fund)
[ -d backend/node_modules ] || (cd backend && npm ci --no-audit --no-fund)

echo "→ Testes unitários do backend…"
(cd backend && npm run test:unit --silent)

echo "→ Build do frontend…"
(cd frontend && npm run build)

echo
echo "✓ Tudo certo. Mensagem de commit sugerida:"
echo "────────────────────────────────────────────"
cat <<'__MSG__'
feat: formulário de livro único (Novo livro e edição)

- BookEditForm compartilhado entre Novo livro e edição; BookDialog
  dividido em BookView, BookEditForm e BookCommunity
- componentes de base em components/form: TextField (rótulo flutuante),
  DateField (seletor nativo até 640px), FieldLabel, PillButton,
  IconButton e CoverDrop
- campos agrupados em "Sobre o livro" e "Sua leitura"; status
  Quero ler / Lendo / Lido também na criação, com data só em Lendo e Lido
- capa em área 2:3 com arrastar e soltar; a capa achada pelo ISBN
  aparece ali
- título e rodapé fixos: Cancelar/Salvar sempre à vista
- erros embaixo do campo (aria-invalid e aria-describedby), inclusive
  os do servidor (ISBN repetido, data no futuro, volume), com foco no
  primeiro campo com erro
- 31 !important a menos
__MSG__
echo "────────────────────────────────────────────"