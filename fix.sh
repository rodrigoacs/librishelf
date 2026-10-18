#!/usr/bin/env bash
# =============================================================================
#  Librishelf — pacote 1 do backlog: biblioteca básica
#
#  1. Busca também pelo nome de qualquer autor do livro (além de título e ISBN)
#  2. Filtros, busca, ordem e modo de exibição ficam na URL (recarregar,
#     voltar e compartilhar o link mantêm a mesma visão)
#  3. Marcar/desmarcar como lido direto no card e na linha, sem abrir o livro
#  4. Modo lista compacta (grade ⇄ lista no cabeçalho, lembrado no navegador)
#
#  Base: dac964c + cores v2. Só código; sem migration.
#
#  Uso:   bash librishelf-pacote1-biblioteca.sh [caminho/do/repo]
#
#  NÃO commita, NÃO faz push e NÃO mexe no banco.
# =============================================================================
set -euo pipefail

if [ -t 1 ]; then B=$'\e[1m'; G=$'\e[32m'; Y=$'\e[33m'; R=$'\e[31m'; C=$'\e[36m'; N=$'\e[0m'; else B=''; G=''; Y=''; R=''; C=''; N=''; fi
step() { printf '\n%s==> %s%s\n' "$B$C" "$*" "$N"; }
ok()   { printf '%s  ✔ %s%s\n' "$G" "$*" "$N"; }
warn() { printf '%s  ! %s%s\n' "$Y" "$*" "$N"; }
fail() { printf '%s  ✘ %s%s\n' "$R" "$*" "$N" >&2; exit 1; }

cd "${1:-$PWD}" || fail "Pasta não encontrada."
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || fail "Não é um repositório git: $PWD"
cd "$(git rev-parse --show-toplevel)"
[ -f frontend/src/components/GeneratedCover.vue ] || fail "Faltam as cores v2: rode o librishelf-cores-v2.sh e commite antes deste pacote."

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT
PATCH="$TMP_DIR/pacote.patch"

cat > "$PATCH" <<'LIBRI_PATCH_EOF'
diff --git a/backend/src/repositories/libraryRepository.js b/backend/src/repositories/libraryRepository.js
index a131cc7..cf008ea 100644
--- a/backend/src/repositories/libraryRepository.js
+++ b/backend/src/repositories/libraryRepository.js
@@ -51,9 +51,19 @@ async function getAllBooksByUser(userId, filters = {}) {
     paramIndex++
   }
 
+  // Busca por título, ISBN ou nome de qualquer autor do livro. % e _ digitados
+  // valem como texto, não como curinga do ILIKE.
   if (search) {
-    query += ` AND (b.title ILIKE $${paramIndex} OR b.isbn ILIKE $${paramIndex})`
-    params.push(`%${search}%`)
+    query += ` AND (
+      b.title ILIKE $${paramIndex}
+      OR b.isbn ILIKE $${paramIndex}
+      OR EXISTS (
+        SELECT 1 FROM librishelf.books_authors_link bal_s
+        JOIN librishelf.authors a_s ON bal_s.author_id = a_s.id
+        WHERE bal_s.book_id = b.id AND a_s.name ILIKE $${paramIndex}
+      )
+    )`
+    params.push(`%${String(search).replace(/[\\%_]/g, '\\$&')}%`)
     paramIndex++
   }
 
diff --git a/backend/src/tests/integration/library-search.test.js b/backend/src/tests/integration/library-search.test.js
new file mode 100644
index 0000000..12cea6d
--- /dev/null
+++ b/backend/src/tests/integration/library-search.test.js
@@ -0,0 +1,62 @@
+import request from 'supertest'
+import app from '../../app.js'
+import { tokenFrom } from '../helpers/authToken.js'
+import { clearDatabase, closeDatabase } from '../../utils/db.js'
+
+let auth
+
+async function addBook(fields) {
+  const res = await request(app).post('/library').set(auth).field(fields)
+  expect(res.statusCode).toBe(201)
+  return res.body.bookId
+}
+
+async function search(text) {
+  const res = await request(app).get('/library').set(auth).query({ search: text, sort: 'title', order: 'asc' })
+  expect(res.statusCode).toBe(200)
+  return res.body.result.map(book => book.title)
+}
+
+beforeAll(async () => {
+  await clearDatabase()
+  await request(app).post('/auth/register').send({ username: 'busca', password: 'senha12345', email: 'busca@example.com' })
+  auth = { Authorization: `Bearer ${tokenFrom(await request(app).post('/auth/login').send({ username: 'busca', password: 'senha12345' }))}` }
+
+  await addBook({ title: 'Fundação', authors: 'Isaac Asimov', isbn: '9788576570653' })
+  await addBook({ title: 'Eu, Robô', authors: 'Isaac Asimov' })
+  await addBook({ title: 'Duna', authors: 'Frank Herbert' })
+  await addBook({ title: 'Bons Presságios', authors: 'Neil Gaiman, Terry Pratchett' })
+  await addBook({ title: '100% Ficção', authors: 'Autora Qualquer' })
+})
+
+afterAll(async () => {
+  await closeDatabase()
+})
+
+describe('Busca da biblioteca', () => {
+  it('encontra pelo título e pelo ISBN, como antes', async () => {
+    expect(await search('duna')).toEqual(['Duna'])
+    expect(await search('8576570')).toEqual(['Fundação'])
+  })
+
+  it('encontra pelo nome do autor, sem diferenciar maiúsculas', async () => {
+    expect(await search('asimov')).toEqual(['Eu, Robô', 'Fundação'])
+    expect(await search('HERBERT')).toEqual(['Duna'])
+  })
+
+  it('encontra pelo segundo autor do livro', async () => {
+    expect(await search('Pratchett')).toEqual(['Bons Presságios'])
+  })
+
+  it('% e _ digitados são texto, não curinga', async () => {
+    expect(await search('100%')).toEqual(['100% Ficção'])
+    expect(await search('%')).toEqual(['100% Ficção'])
+    expect(await search('_')).toEqual([])
+  })
+
+  it('combina com os outros filtros', async () => {
+    await request(app).patch(`/library/${(await request(app).get('/library').set(auth).query({ search: 'Fundação' })).body.result[0].book_id}/read`).set(auth)
+    const res = await request(app).get('/library').set(auth).query({ search: 'asimov', readState: 'true' })
+    expect(res.body.result.map(book => book.title)).toEqual(['Fundação'])
+  })
+})
diff --git a/frontend/src/components/BookItem.vue b/frontend/src/components/BookItem.vue
index 23a20e7..8f30efd 100644
--- a/frontend/src/components/BookItem.vue
+++ b/frontend/src/components/BookItem.vue
@@ -46,6 +46,23 @@
       </span>
     </button>
 
+    <button
+      v-if="quickActions && !readOnly"
+      type="button"
+      class="quick-read"
+      :class="{ 'is-read': isRead, busy: saving }"
+      :aria-pressed="isRead"
+      :aria-label="isRead ? t('book.quick_unread', { title: book.title }) : t('book.quick_read', { title: book.title })"
+      v-tooltip.top="isRead ? t('book.quick_unread_short') : t('book.quick_read_short')"
+      :disabled="saving"
+      @click="toggleRead"
+    >
+      <i
+        :class="saving ? 'pi pi-spin pi-spinner' : 'pi pi-check'"
+        aria-hidden="true"
+      ></i>
+    </button>
+
     <BookDialog
       v-if="displayDialog"
       :bookId="bookId"
@@ -63,6 +80,7 @@
 import { ref, computed, watch } from 'vue'
 import { useI18n } from 'vue-i18n'
 import BookDialog from './BookDialog.vue'
+import { useReadToggle } from '../composables/useReadToggle.js'
 import { coverUrl, coverFallbackExhausted } from '../utils/covers.js'
 import GeneratedCover from './GeneratedCover.vue'
 
@@ -72,7 +90,9 @@ const props = defineProps({
   book: { type: Object, required: true },
   coverVersion: { type: Number, default: 0 },
   readOnly: { type: Boolean, default: false },
-  ownerUsername: { type: String, default: '' }
+  ownerUsername: { type: String, default: '' },
+  /** Botão de marcar como lido sobre a capa (só na biblioteca do dono). */
+  quickActions: { type: Boolean, default: false }
 })
 
 const emit = defineEmits(['updated', 'deleted'])
@@ -80,6 +100,7 @@ const displayDialog = ref(false)
 
 const bookId = computed(() => props.book.book_id ?? props.book.id)
 const isRead = computed(() => Boolean(props.book.read_date))
+const { saving, toggleRead } = useReadToggle(() => props.book, payload => emit('updated', payload))
 const bookCoverUrl = computed(() => coverUrl(bookId.value, props.coverVersion))
 
 // Sem imagem (ou falhou): capa desenhada com título e autor, colorida pelo título.
@@ -101,6 +122,69 @@ const ariaLabel = computed(() => {
 .book-card-wrapper {
   display: flex;
   min-width: 0;
+  position: relative;
+}
+
+/* Marcar como lido sem abrir o livro: canto superior esquerdo da capa
+   (a fita de "lido" fica no direito). No mouse aparece ao passar por cima;
+   no toque fica sempre visível. */
+.quick-read {
+  position: absolute;
+  top: 8px;
+  left: 8px;
+  z-index: 4;
+  width: 34px;
+  height: 34px;
+  border-radius: 50%;
+  border: 1px solid rgba(255, 255, 255, 0.35);
+  background: rgba(0, 0, 0, 0.55);
+  color: #ffffff;
+  display: flex;
+  align-items: center;
+  justify-content: center;
+  cursor: pointer;
+  transition: opacity 0.15s ease, background-color 0.15s ease, transform 0.15s ease;
+}
+
+.quick-read .pi {
+  font-size: 0.85rem;
+  font-weight: 700;
+}
+
+.quick-read.is-read {
+  background: var(--main-color);
+  border-color: transparent;
+  color: var(--text-inverse);
+}
+
+.quick-read:active {
+  transform: scale(0.92);
+}
+
+.quick-read:focus-visible {
+  outline: 2px solid var(--main-color);
+  outline-offset: 2px;
+  opacity: 1;
+}
+
+@media (hover: hover) {
+  .quick-read {
+    opacity: 0;
+  }
+
+  .book-card-wrapper:hover .quick-read,
+  .quick-read.busy {
+    opacity: 1;
+  }
+
+  .quick-read:hover {
+    background: rgba(0, 0, 0, 0.75);
+  }
+
+  .quick-read.is-read:hover {
+    background: var(--main-color);
+    filter: brightness(1.1);
+  }
 }
 
 button.book-card {
diff --git a/frontend/src/components/BookRow.vue b/frontend/src/components/BookRow.vue
new file mode 100644
index 0000000..ff1c0eb
--- /dev/null
+++ b/frontend/src/components/BookRow.vue
@@ -0,0 +1,315 @@
+<template>
+  <li class="book-row">
+    <button
+      type="button"
+      class="row-main"
+      :aria-label="ariaLabel"
+      @click="displayDialog = true"
+    >
+      <span class="thumb">
+        <img
+          v-if="!coverMissing"
+          :key="bookCoverUrl"
+          :src="bookCoverUrl"
+          alt=""
+          loading="lazy"
+          decoding="async"
+          @error="onCoverError"
+        />
+        <GeneratedCover
+          v-else
+          :title="book.title"
+        />
+      </span>
+
+      <span class="main-text">
+        <span class="title">{{ book.title }}</span>
+        <span class="authors">{{ book.authors }}</span>
+      </span>
+
+      <span class="col publisher">{{ book.publisher_name || '—' }}</span>
+      <span class="col year">{{ pubYear || '—' }}</span>
+
+      <span
+        class="col rating"
+        :aria-label="book.rating ? t('library.row_rating', { n: book.rating }) : undefined"
+      >
+        <template v-if="book.rating">
+          <i
+            v-for="n in 5"
+            :key="n"
+            :class="n <= book.rating ? 'pi pi-star-fill' : 'pi pi-star'"
+            aria-hidden="true"
+          ></i>
+        </template>
+        <span
+          v-else
+          class="muted"
+        >—</span>
+      </span>
+
+      <span
+        class="col read"
+        :class="{ 'is-read': isRead }"
+      >{{ isRead ? readDateLabel : t('library.unread') }}</span>
+    </button>
+
+    <button
+      type="button"
+      class="row-read"
+      :class="{ 'is-read': isRead }"
+      :aria-pressed="isRead"
+      :aria-label="isRead ? t('book.quick_unread', { title: book.title }) : t('book.quick_read', { title: book.title })"
+      v-tooltip.left="isRead ? t('book.quick_unread_short') : t('book.quick_read_short')"
+      :disabled="saving"
+      @click="toggleRead"
+    >
+      <i
+        :class="saving ? 'pi pi-spin pi-spinner' : 'pi pi-check'"
+        aria-hidden="true"
+      ></i>
+    </button>
+
+    <BookDialog
+      v-if="displayDialog"
+      :bookId="bookId"
+      :modelValue="displayDialog"
+      @update:modelValue="displayDialog = $event"
+      @updated="payload => emit('updated', payload)"
+      @deleted="id => emit('deleted', id)"
+    />
+  </li>
+</template>
+
+<script setup>
+import { ref, computed, watch } from 'vue'
+import { useI18n } from 'vue-i18n'
+import BookDialog from './BookDialog.vue'
+import GeneratedCover from './GeneratedCover.vue'
+import { coverUrl, coverFallbackExhausted } from '../utils/covers.js'
+import { fromApiDate } from '../utils/dates.js'
+import { useReadToggle } from '../composables/useReadToggle.js'
+
+/** Linha da biblioteca no modo lista: mais livros por tela, com os dados principais. */
+const props = defineProps({
+  book: { type: Object, required: true },
+  coverVersion: { type: Number, default: 0 }
+})
+
+const emit = defineEmits(['updated', 'deleted'])
+const { t, locale } = useI18n()
+const displayDialog = ref(false)
+
+const bookId = computed(() => props.book.book_id ?? props.book.id)
+const isRead = computed(() => Boolean(props.book.read_date))
+const bookCoverUrl = computed(() => coverUrl(bookId.value, props.coverVersion))
+const { saving, toggleRead } = useReadToggle(() => props.book, payload => emit('updated', payload))
+
+const coverMissing = ref(false)
+watch(bookCoverUrl, () => { coverMissing.value = false })
+function onCoverError(event) {
+  if (coverFallbackExhausted(event)) coverMissing.value = true
+}
+
+const pubYear = computed(() => {
+  const date = fromApiDate(props.book.publication_date)
+  return date ? date.getFullYear() : null
+})
+
+const readDateLabel = computed(() => {
+  const date = fromApiDate(props.book.read_date)
+  if (!date) return t('library.read')
+  return date.toLocaleDateString(locale.value === 'en' ? 'en-US' : 'pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
+})
+
+const ariaLabel = computed(() => {
+  const parts = [props.book.title, props.book.authors].filter(Boolean)
+  parts.push(isRead.value ? t('library.read') : t('library.unread'))
+  return parts.join(' — ')
+})
+</script>
+
+<style scoped>
+.book-row {
+  display: grid;
+  grid-template-columns: minmax(0, 1fr) auto;
+  align-items: center;
+  gap: 0.5rem;
+  background: var(--bg-panel);
+  border: 1px solid var(--border-color);
+  border-radius: 12px;
+  padding-right: 0.75rem;
+  transition: border-color 0.15s ease, background-color 0.15s ease;
+}
+
+.book-row:hover {
+  border-color: rgba(var(--main-color-rgb), 0.45);
+}
+
+.row-main {
+  display: grid;
+  grid-template-columns: 40px minmax(0, 2.6fr) minmax(0, 1.3fr) 3.5rem 6rem 6rem;
+  align-items: center;
+  gap: 1rem;
+  padding: 0.55rem 0 0.55rem 0.65rem;
+  border: none;
+  background: none;
+  font: inherit;
+  color: inherit;
+  text-align: left;
+  cursor: pointer;
+  min-width: 0;
+  border-radius: 12px 0 0 12px;
+}
+
+.row-main:focus-visible {
+  outline: 2px solid var(--main-color);
+  outline-offset: -2px;
+}
+
+.thumb {
+  display: block;
+  width: 40px;
+  aspect-ratio: 2 / 3;
+  border-radius: 4px;
+  overflow: hidden;
+  background: var(--bg-hover);
+  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
+  container-type: inline-size;
+}
+
+.thumb img {
+  width: 100%;
+  height: 100%;
+  object-fit: cover;
+  display: block;
+}
+
+/* A capa desenhada não cabe texto em 40px: fica só a cor. */
+.thumb :deep(.frame) {
+  visibility: hidden;
+}
+
+.main-text {
+  display: flex;
+  flex-direction: column;
+  gap: 0.15rem;
+  min-width: 0;
+}
+
+.title {
+  font-weight: 600;
+  color: var(--text-primary);
+  white-space: nowrap;
+  overflow: hidden;
+  text-overflow: ellipsis;
+}
+
+.authors,
+.col {
+  font-size: 0.85rem;
+  color: var(--text-secondary);
+  white-space: nowrap;
+  overflow: hidden;
+  text-overflow: ellipsis;
+}
+
+.year {
+  font-variant-numeric: tabular-nums;
+}
+
+.rating {
+  display: flex;
+  gap: 2px;
+  color: var(--yellow);
+  font-size: 0.75rem;
+}
+
+.rating .muted {
+  color: var(--text-secondary);
+  font-size: 0.85rem;
+}
+
+.read.is-read {
+  color: var(--text-primary);
+}
+
+.row-read {
+  width: 34px;
+  height: 34px;
+  border-radius: 50%;
+  border: 1px solid var(--border-color);
+  background: transparent;
+  color: var(--text-secondary);
+  display: flex;
+  align-items: center;
+  justify-content: center;
+  cursor: pointer;
+  transition: background-color 0.15s ease, color 0.15s ease, transform 0.15s ease;
+}
+
+.row-read .pi {
+  font-size: 0.85rem;
+  font-weight: 700;
+}
+
+.row-read:hover {
+  border-color: var(--main-color);
+  color: var(--main-color);
+}
+
+.row-read.is-read {
+  background: var(--main-color);
+  border-color: transparent;
+  color: var(--text-inverse);
+}
+
+.row-read:active {
+  transform: scale(0.92);
+}
+
+.row-read:focus-visible {
+  outline: 2px solid var(--main-color);
+  outline-offset: 2px;
+}
+
+@media (max-width: 1100px) {
+  .row-main {
+    grid-template-columns: 40px minmax(0, 2.4fr) minmax(0, 1.2fr) 6rem 6rem;
+  }
+
+  .year {
+    display: none;
+  }
+}
+
+@media (max-width: 760px) {
+  .row-main {
+    grid-template-columns: 40px minmax(0, 1fr) 5.75rem;
+    gap: 0.75rem;
+  }
+
+  .publisher,
+  .rating {
+    display: none;
+  }
+
+  .read {
+    text-align: right;
+  }
+}
+
+@media (max-width: 420px) {
+  .row-main {
+    grid-template-columns: 36px minmax(0, 1fr);
+  }
+
+  .thumb {
+    width: 36px;
+  }
+
+  .read {
+    display: none;
+  }
+}
+</style>
diff --git a/frontend/src/components/LibraryHeader.vue b/frontend/src/components/LibraryHeader.vue
index d2d2887..8de1fc9 100644
--- a/frontend/src/components/LibraryHeader.vue
+++ b/frontend/src/components/LibraryHeader.vue
@@ -48,6 +48,29 @@
       </div>
 
       <div class="actions">
+        <div
+          class="view-toggle"
+          role="group"
+          :aria-label="t('library.view_label')"
+        >
+          <button
+            v-for="mode in viewModes"
+            :key="mode.value"
+            type="button"
+            class="view-btn"
+            :class="{ active: view === mode.value }"
+            :aria-pressed="view === mode.value"
+            :aria-label="mode.label"
+            v-tooltip.bottom="mode.label"
+            @click="emit('view-change', mode.value)"
+          >
+            <i
+              :class="mode.icon"
+              aria-hidden="true"
+            ></i>
+          </button>
+        </div>
+
         <Button
           icon="pi pi-filter"
           class="p-button-rounded p-button-text action-btn"
@@ -283,10 +306,16 @@ const { t } = useI18n()
 // aparecem aqui como chips.
 const props = defineProps({
   booksQuantity: Number,
-  filters: { type: Object, required: true }
+  filters: { type: Object, required: true },
+  view: { type: String, default: 'grid' }
 })
 
-const emit = defineEmits(['filter-change', 'reset', 'book-created'])
+const emit = defineEmits(['filter-change', 'reset', 'book-created', 'view-change'])
+
+const viewModes = computed(() => [
+  { value: 'grid', icon: 'pi pi-th-large', label: t('library.view_grid') },
+  { value: 'list', icon: 'pi pi-list', label: t('library.view_list') }
+])
 
 const visibleFilters = ref(false)
 const addBookDialogVisible = ref(false)
@@ -414,6 +443,43 @@ defineExpose({ reloadOptions: loadOptions })
   border-radius: 20px;
 }
 
+.view-toggle {
+  display: inline-flex;
+  padding: 3px;
+  gap: 2px;
+  border-radius: 999px;
+  border: 1px solid var(--border-color);
+  background: var(--bg-app);
+}
+
+.view-btn {
+  width: 34px;
+  height: 34px;
+  border: none;
+  border-radius: 999px;
+  background: transparent;
+  color: var(--text-secondary);
+  display: flex;
+  align-items: center;
+  justify-content: center;
+  cursor: pointer;
+  transition: background-color 0.15s ease, color 0.15s ease;
+}
+
+.view-btn:hover {
+  color: var(--text-primary);
+}
+
+.view-btn.active {
+  background: var(--main-color);
+  color: var(--text-inverse);
+}
+
+.view-btn:focus-visible {
+  outline: 2px solid var(--main-color);
+  outline-offset: 2px;
+}
+
 .search-area {
   flex: 1;
   max-width: 600px;
diff --git a/frontend/src/composables/useReadToggle.js b/frontend/src/composables/useReadToggle.js
new file mode 100644
index 0000000..cebea05
--- /dev/null
+++ b/frontend/src/composables/useReadToggle.js
@@ -0,0 +1,44 @@
+import { ref } from 'vue'
+import { useI18n } from 'vue-i18n'
+import { useToast } from 'primevue/usetoast'
+import api from '../services/api.js'
+import { toApiDate } from '../utils/dates.js'
+
+/**
+ * Marcar/desmarcar como lido direto no card ou na linha da lista, sem abrir
+ * o livro. Marca com a data de hoje (no fuso da pessoa); a data pode ser
+ * ajustada depois no próprio livro.
+ *
+ * @param getBook  função que devolve o livro atual (props.book)
+ * @param onUpdated recebe { book: { book_id, read_date }, coverChanged: false }
+ */
+export function useReadToggle(getBook, onUpdated) {
+  const { t } = useI18n()
+  const toast = useToast()
+  const saving = ref(false)
+
+  async function toggleRead() {
+    if (saving.value) return
+    const book = getBook()
+    const bookId = book.book_id ?? book.id
+    const wasRead = Boolean(book.read_date)
+
+    saving.value = true
+    try {
+      if (wasRead) {
+        await api.markAsUnread(bookId)
+        onUpdated({ book: { book_id: bookId, read_date: null }, coverChanged: false })
+      } else {
+        const today = toApiDate(new Date())
+        await api.markAsRead(bookId, today)
+        onUpdated({ book: { book_id: bookId, read_date: today }, coverChanged: false })
+      }
+    } catch (error) {
+      toast.add({ severity: 'error', summary: t('bookDialog.error'), detail: error.message || t('bookDialog.updateFailed'), life: 4000 })
+    } finally {
+      saving.value = false
+    }
+  }
+
+  return { saving, toggleRead }
+}
diff --git a/frontend/src/locales/en.json b/frontend/src/locales/en.json
index 79b1768..91c1849 100644
--- a/frontend/src/locales/en.json
+++ b/frontend/src/locales/en.json
@@ -87,10 +87,14 @@
     "select_cover": "Select cover image",
     "read_ribbon": "Read",
     "dialog_label": "Add book",
-    "authors_hint": "Type an author and press Enter to add the next one."
+    "authors_hint": "Type an author and press Enter to add the next one.",
+    "quick_read": "Mark \"{title}\" as read today",
+    "quick_unread": "Mark \"{title}\" as unread",
+    "quick_read_short": "Mark as read",
+    "quick_unread_short": "Mark as unread"
   },
   "library": {
-    "search_ph": "Search by title, ISBN...",
+    "search_ph": "Search by title, author or ISBN...",
     "filters_adv": "Advanced Filters",
     "filtering_by": "Filtering by:",
     "clear_all": "Clear all",
@@ -129,7 +133,12 @@
     "read_year_chip": "Read in {year}",
     "search_label": "Search books",
     "load_error": "Could not load your books.",
-    "invalid_isbn_chip": "Invalid ISBN"
+    "invalid_isbn_chip": "Invalid ISBN",
+    "results": "Your books",
+    "view_label": "View mode",
+    "view_grid": "Grid",
+    "view_list": "List",
+    "row_rating": "Rated {n} out of 5"
   },
   "bookDialog": {
     "bookCover": "Book Cover",
@@ -540,4 +549,4 @@
     "resend": "Resend link",
     "sent": "Link sent"
   }
-}
\ No newline at end of file
+}
diff --git a/frontend/src/locales/pt.json b/frontend/src/locales/pt.json
index ce3a897..0439472 100644
--- a/frontend/src/locales/pt.json
+++ b/frontend/src/locales/pt.json
@@ -87,10 +87,14 @@
     "select_cover": "Selecionar imagem de capa",
     "read_ribbon": "Lido",
     "dialog_label": "Adicionar livro",
-    "authors_hint": "Digite um autor e tecle Enter para adicionar o próximo."
+    "authors_hint": "Digite um autor e tecle Enter para adicionar o próximo.",
+    "quick_read": "Marcar \"{title}\" como lido hoje",
+    "quick_unread": "Desmarcar \"{title}\" como lido",
+    "quick_read_short": "Marcar como lido",
+    "quick_unread_short": "Desmarcar como lido"
   },
   "library": {
-    "search_ph": "Pesquisar por título, ISBN...",
+    "search_ph": "Pesquisar por título, autor ou ISBN...",
     "filters_adv": "Filtros Avançados",
     "filtering_by": "Filtrando por:",
     "clear_all": "Limpar tudo",
@@ -129,7 +133,12 @@
     "read_year_chip": "Lidos em {year}",
     "search_label": "Pesquisar livros",
     "load_error": "Não foi possível carregar seus livros.",
-    "invalid_isbn_chip": "ISBN inválido"
+    "invalid_isbn_chip": "ISBN inválido",
+    "results": "Seus livros",
+    "view_label": "Modo de exibição",
+    "view_grid": "Grade",
+    "view_list": "Lista",
+    "row_rating": "Nota {n} de 5"
   },
   "bookDialog": {
     "bookCover": "Capa do Livro",
@@ -540,4 +549,4 @@
     "resend": "Reenviar link",
     "sent": "Link enviado"
   }
-}
\ No newline at end of file
+}
diff --git a/frontend/src/utils/libraryQuery.js b/frontend/src/utils/libraryQuery.js
new file mode 100644
index 0000000..0b75bb2
--- /dev/null
+++ b/frontend/src/utils/libraryQuery.js
@@ -0,0 +1,71 @@
+/**
+ * Filtros da biblioteca ⇄ query string da URL.
+ *
+ * Assim a URL de /books guarda a busca, os filtros, a ordem e o modo de
+ * exibição: dá para recarregar, voltar, salvar nos favoritos ou mandar o link.
+ * Valores padrão não aparecem na URL, para ela ficar curta.
+ *
+ *   /books?q=asimov&status=read&year=2025&tags=Fantasia&sort=title&order=asc&view=list
+ */
+
+const SORT_FIELDS = ['recent', 'title', 'authors', 'readDate', 'pubDate', 'rating']
+const READ_STATES = ['read', 'unread']
+export const VIEW_MODES = ['grid', 'list']
+
+function asList(value) {
+  if (value === undefined || value === null || value === '') return []
+  return (Array.isArray(value) ? value : [value]).map(String).filter(Boolean)
+}
+
+function asSingle(value) {
+  return Array.isArray(value) ? value[0] : value
+}
+
+/** Query da URL → filtros do useLibrary (só o que veio; o resto fica no padrão). */
+export function queryToFilters(query = {}) {
+  const status = asSingle(query.status)
+  const year = asSingle(query.year)
+  const sort = asSingle(query.sort)
+  const order = asSingle(query.order)
+
+  return {
+    search: String(asSingle(query.q) ?? ''),
+    readState: READ_STATES.includes(status) ? status : 'all',
+    readYear: /^\d{4}$/.test(year ?? '') ? year : 'all',
+    author: asList(query.author),
+    publisher: asList(query.publisher),
+    tags: asList(query.tags),
+    isbnStatus: asSingle(query.isbn) === 'invalid' ? 'invalid' : 'all',
+    sortField: SORT_FIELDS.includes(sort) ? sort : 'recent',
+    sortOrder: order === 'asc' ? 'asc' : 'desc'
+  }
+}
+
+export function queryToView(query = {}) {
+  const view = asSingle(query.view)
+  return VIEW_MODES.includes(view) ? view : null
+}
+
+/** Filtros + modo de exibição → query da URL, sem os valores padrão. */
+export function filtersToQuery(filters, view = 'grid') {
+  const query = {}
+  if (filters.search?.trim()) query.q = filters.search.trim()
+  if (READ_STATES.includes(filters.readState)) query.status = filters.readState
+  if (filters.readYear && filters.readYear !== 'all') query.year = String(filters.readYear)
+  if (filters.author?.length) query.author = [...filters.author]
+  if (filters.publisher?.length) query.publisher = [...filters.publisher]
+  if (filters.tags?.length) query.tags = [...filters.tags]
+  if (filters.isbnStatus === 'invalid') query.isbn = 'invalid'
+  if (filters.sortField && filters.sortField !== 'recent') query.sort = filters.sortField
+  if (filters.sortOrder === 'asc') query.order = 'asc'
+  if (view === 'list') query.view = 'list'
+  return query
+}
+
+/** Compara duas queries ignorando a ordem das chaves. */
+export function sameQuery(a = {}, b = {}) {
+  const normalize = query => JSON.stringify(
+    Object.keys(query).sort().map(key => [key, asList(query[key])])
+  )
+  return normalize(a) === normalize(b)
+}
diff --git a/frontend/src/views/Library.vue b/frontend/src/views/Library.vue
index b1ea55f..8ab8595 100644
--- a/frontend/src/views/Library.vue
+++ b/frontend/src/views/Library.vue
@@ -9,7 +9,9 @@
         ref="header"
         :books-quantity="totalRecords"
         :filters="filters"
+        :view="viewMode"
         @filter-change="handleFilterChange"
+        @view-change="setViewMode"
         @reset="clearFilters"
         @book-created="refreshData"
       />
@@ -70,6 +72,7 @@
         class="books-grid-wrapper"
       >
         <TransitionGroup
+          v-if="viewMode === 'grid'"
           name="book-list"
           tag="div"
           class="books-grid"
@@ -79,11 +82,27 @@
             :key="item.book_id || item.id"
             :book="item"
             :cover-version="coverVersions[item.book_id || item.id]"
+            quick-actions
             @updated="onBookUpdated"
             @deleted="onBookDeleted"
           />
         </TransitionGroup>
 
+        <ul
+          v-else
+          class="books-list"
+          :aria-label="t('library.results')"
+        >
+          <BookRow
+            v-for="item in books"
+            :key="item.book_id || item.id"
+            :book="item"
+            :cover-version="coverVersions[item.book_id || item.id]"
+            @updated="onBookUpdated"
+            @deleted="onBookDeleted"
+          />
+        </ul>
+
         <div
           v-if="books.length < totalRecords"
           ref="sentinel"
@@ -123,17 +142,20 @@
 </template>
 
 <script setup>
-import { onMounted, onUnmounted, ref, watchEffect } from 'vue'
-import { useRoute } from 'vue-router'
+import { onMounted, onUnmounted, ref, watch, watchEffect } from 'vue'
+import { useRoute, useRouter } from 'vue-router'
 import { useI18n } from 'vue-i18n'
 import LibraryHeader from '../components/LibraryHeader.vue'
 import BookItem from '../components/BookItem.vue'
+import BookRow from '../components/BookRow.vue'
+import { queryToFilters, queryToView, filtersToQuery, sameQuery, VIEW_MODES } from '../utils/libraryQuery.js'
 import Skeleton from 'primevue/skeleton'
 import Button from 'primevue/button'
 import { useLibrary } from '../composables/useLibrary.js'
 
 const { t } = useI18n()
 const route = useRoute()
+const router = useRouter()
 const {
   books,
   totalRecords,
@@ -208,20 +230,46 @@ watchEffect(() => {
   }
 })
 
-function queryList(value) {
-  if (!value) return []
-  return (Array.isArray(value) ? value : [value]).filter(Boolean)
+// Grade ou lista: vem da URL (?view=list); sem ela, a última escolha neste navegador.
+const VIEW_STORAGE_KEY = 'library-view'
+
+function storedView() {
+  try {
+    const value = localStorage.getItem(VIEW_STORAGE_KEY)
+    return VIEW_MODES.includes(value) ? value : 'grid'
+  } catch {
+    return 'grid'
+  }
 }
 
+const viewMode = ref(queryToView(route.query) || storedView())
+
+function setViewMode(mode) {
+  if (!VIEW_MODES.includes(mode)) return
+  viewMode.value = mode
+  try { localStorage.setItem(VIEW_STORAGE_KEY, mode) } catch { /* modo privado */ }
+}
+
+// Filtros ⇄ URL. A URL é atualizada com replace (não enche o histórico a cada
+// tecla) e, se ela mudar por fora (link de Autores, voltar do navegador),
+// os filtros acompanham.
+watch([filters, viewMode], () => {
+  const next = filtersToQuery(filters.value, viewMode.value)
+  if (!sameQuery(route.query, next)) router.replace({ query: next })
+}, { deep: true })
+
+watch(() => route.query, (query) => {
+  if (route.name !== 'library') return
+  if (sameQuery(query, filtersToQuery(filters.value, viewMode.value))) return
+  const view = queryToView(query)
+  if (view) viewMode.value = view
+  setFilters(queryToFilters(query))
+})
+
 onMounted(() => {
-  // Filtros vindos de Autores/Editoras/Tags (?author=X) entram no estado
-  // compartilhado, então aparecem como chips no cabeçalho e podem ser removidos.
-  setFilters({
-    author: queryList(route.query.author),
-    publisher: queryList(route.query.publisher),
-    tags: queryList(route.query.tags),
-    isbnStatus: route.query.isbn === 'invalid' ? 'invalid' : 'all'
-  })
+  // Filtros da URL (inclusive os que vêm de Autores/Editoras/Categorias) entram
+  // no estado compartilhado: aparecem como chips e podem ser removidos.
+  setFilters(queryToFilters(route.query))
 })
 
 onUnmounted(() => {
@@ -261,6 +309,15 @@ onUnmounted(() => {
   width: 100%;
 }
 
+.books-list {
+  list-style: none;
+  margin: 0;
+  padding: 0;
+  display: flex;
+  flex-direction: column;
+  gap: 0.5rem;
+}
+
 .book-skeleton {
   display: flex;
   flex-direction: column;
LIBRI_PATCH_EOF

step "1/3 Aplicando"
if git apply --reverse --check --whitespace=nowarn "$PATCH" 2>/dev/null; then
  ok "Já estava aplicado."
elif git apply --check --whitespace=nowarn "$PATCH" 2>/dev/null; then
  git apply --whitespace=nowarn "$PATCH"
  ok "Aplicado ($(grep -c '^diff --git' "$PATCH") arquivos)."
else
  # Algum arquivo mudou (ex.: formatação do editor): mescla como num merge do git.
  if ! git diff --quiet; then
    fail "Há mudanças não commitadas. Faça commit ou 'git stash' e rode de novo."
  fi
  if git apply --3way --whitespace=nowarn "$PATCH"; then
    ok "Aplicado mesclando com as mudanças que você já tinha."
  else
    warn "Ficaram conflitos marcados com <<<<<<< nos arquivos listados acima."
    fail "Resolva os conflitos (ou 'git checkout -- .' para desfazer) e rode de novo."
  fi
fi

step "2/3 Testes unitários do backend"
[ -d backend/node_modules ] || (cd backend && npm ci --no-audit --no-fund --loglevel=error >/dev/null)
if (cd backend && npm run --silent test:unit -- --silent 2>&1 | grep -E '^(Tests|Test Suites):' | sed 's/^/  /'; exit "${PIPESTATUS[0]}"); then ok "Passando"; else fail "Falharam (rode 'npm run test:unit' no backend para ver)."; fi

step "3/3 Build do frontend"
[ -d frontend/node_modules ] || (cd frontend && npm ci --no-audit --no-fund --loglevel=error >/dev/null)
if (cd frontend && npx --no-install vite build >"$TMP_DIR/build.log" 2>&1); then ok "OK"; else tail -20 "$TMP_DIR/build.log" >&2; fail "Build falhou."; fi

step "Pronto — nada foi commitado"
git status --short | sed 's/^/  /'

cat <<'MSG'

Próximos passos
---------------
1. Rode a suíte completa no backend:  npm test
   (há um teste novo: src/tests/integration/library-search.test.js)
2. Teste no navegador (npm run server:local + npm run dev):
   - busque pelo sobrenome de um autor;
   - passe o mouse num card e clique no ✓ do canto;
   - troque para lista no botão ao lado do filtro, filtre "Lido"
     e recarregue a página: tudo continua igual.
3. Commite e rode o pacote 2.

Sugestão de commit
------------------
feat(biblioteca): busca por autor, filtros na URL, lido no card e modo lista

- busca encontra título, ISBN ou qualquer autor do livro (% e _ são texto)
- busca, filtros, ordem e grade/lista ficam na URL (recarregar e voltar mantêm)
- botão de marcar/desmarcar como lido no card e na linha
- modo lista compacta com capa, autores, editora, ano, nota e data de leitura
MSG