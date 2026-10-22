#!/usr/bin/env bash
# Librishelf — pacote 6: sem PrimeVue (2 de 3)
#
# Rode na raiz do repositório Librishelf, na branch fix/audit-2026-08, com
# o pacote anterior já commitado:   bash pacote-6-sem-primevue-2.sh
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
  frontend/src/components/BatchBar.vue
  frontend/src/components/BookDialog.vue
  frontend/src/components/EntityListView.vue
  frontend/src/components/LibraryHeader.vue
  frontend/src/components/form/DateField.vue
  frontend/src/components/ui/AppDialog.vue
  frontend/src/components/ui/PopupMenu.vue
  frontend/src/views/Settings.vue
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
index 0c0ef343e9bc17105a4ae32270a3a07691ae1d89..b5c1456614dbc69f0822856cff9067c4b5bc380c 100644
--- a/frontend/src/components/AddBookDialog.vue
+++ b/frontend/src/components/AddBookDialog.vue
@@ -1,11 +1,9 @@
 <template>
-  <Dialog
+  <AppDialog
     v-model:visible="visible"
-    :modal="true"
-    :dismissableMask="false"
-    class="book-form-dialog"
-    :style="{ width: '960px', maxWidth: 'calc(100vw - 2rem)' }"
-    :showHeader="false"
+    size="xl"
+    :dismissable="false"
+    dialog-class="book-form-dialog"
     :aria-label="t('book.dialog_label')"
   >
     <div class="dialog-shell">
@@ -24,12 +22,12 @@
         @cancel="visible = false"
       />
     </div>
-  </Dialog>
+  </AppDialog>
 </template>
 
 <script setup>
 import { ref, watch } from 'vue'
-import Dialog from 'primevue/dialog'
+import AppDialog from './ui/AppDialog.vue'
 import { useI18n } from 'vue-i18n'
 import BookEditForm from './book/BookEditForm.vue'
 import IconButton from './form/IconButton.vue'
@@ -60,26 +58,13 @@ function onSaved(result) {
 </script>
 
 <style>
-/* Moldura dos diálogos de livro (Novo livro e o livro aberto) */
-.p-dialog.book-form-dialog {
-  border: 1px solid var(--border-color);
-  border-radius: 16px;
-  overflow: hidden;
-  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
-  background-color: var(--bg-panel);
+/* Diálogos de livro (Novo livro e o livro aberto): mais altos que o padrão */
+.book-form-dialog .app-dialog-panel {
   max-height: min(92vh, 860px);
 }
 
-.book-form-dialog .p-dialog-content {
-  padding: 0;
-  background-color: var(--bg-panel);
-  overflow: hidden;
-  display: flex;
-  flex-direction: column;
-}
-
 @media (max-width: 768px) {
-  .p-dialog.book-form-dialog {
+  .book-form-dialog .app-dialog-panel {
     max-height: calc(100dvh - 2rem);
   }
 }
diff --git a/frontend/src/components/BatchBar.vue b/frontend/src/components/BatchBar.vue
index d2c66cded7f795c2a8bdd44b58cf08effd4678da..b7ef59491eb7febc4e4ca1e2a37d89f62baf0229 100644
--- a/frontend/src/components/BatchBar.vue
+++ b/frontend/src/components/BatchBar.vue
@@ -26,11 +26,10 @@
         aria-controls="batch-status-menu"
         @click="event => statusMenu.toggle(event)"
       />
-      <Menu
+      <PopupMenu
         id="batch-status-menu"
         ref="statusMenu"
-        :model="statusItems"
-        popup
+        :items="statusItems"
       />
 
       <AppButton
@@ -60,12 +59,10 @@
       />
     </div>
 
-    <Dialog
+    <AppDialog
       v-model:visible="tagDialog"
-      modal
+      size="sm"
       :header="t('batch.categoryTitle', { n: count }, count)"
-      :style="{ width: 'min(26rem, 92vw)' }"
-      :draggable="false"
     >
       <form
         class="tag-form"
@@ -107,7 +104,7 @@
           />
         </div>
       </form>
-    </Dialog>
+    </AppDialog>
   </div>
 </template>
 
@@ -117,8 +114,8 @@ import { useI18n } from 'vue-i18n'
 import { useConfirm } from '../services/confirm.js'
 import { useToast } from '../services/toast.js'
 import AppButton from './ui/AppButton.vue'
-import Menu from 'primevue/menu'
-import Dialog from 'primevue/dialog'
+import PopupMenu from './ui/PopupMenu.vue'
+import AppDialog from './ui/AppDialog.vue'
 import api from '../services/api.js'
 import { toApiDate } from '../utils/dates.js'
 
diff --git a/frontend/src/components/BookDialog.vue b/frontend/src/components/BookDialog.vue
index bcd6b386d2cfddd9b76acd2cd6c1cb77d4076111..9b785ccfb86bb2e2114f5033231dae9096a7d06d 100644
--- a/frontend/src/components/BookDialog.vue
+++ b/frontend/src/components/BookDialog.vue
@@ -1,11 +1,9 @@
 <template>
-  <Dialog
+  <AppDialog
     v-model:visible="visible"
-    :modal="true"
-    :dismissableMask="!isEditing"
-    class="book-form-dialog"
-    :style="{ width: isEditing ? '960px' : '900px', maxWidth: 'calc(100vw - 2rem)' }"
-    :showHeader="false"
+    :size="isEditing ? 'xl' : 'lg'"
+    :dismissable="!isEditing"
+    dialog-class="book-form-dialog"
     :aria-label="book.title || t('bookDialog.dialog_label')"
     @hide="closeDialog"
   >
@@ -107,13 +105,13 @@
         </div>
       </div>
     </div>
-  </Dialog>
+  </AppDialog>
 </template>
 
 <script setup>
 import { ref, watch, computed, onMounted, onBeforeUnmount } from 'vue'
 import { useI18n } from 'vue-i18n'
-import Dialog from 'primevue/dialog'
+import AppDialog from './ui/AppDialog.vue'
 import AppButton from './ui/AppButton.vue'
 import { useToast } from '../services/toast.js'
 import { useConfirm } from '../services/confirm.js'
diff --git a/frontend/src/components/EntityListView.vue b/frontend/src/components/EntityListView.vue
index c77e44e9f4cc0a871837aaa1028b56dc4640d20b..404f85a66f8822f2d8e5e16bb1c43c52e57ce777 100644
--- a/frontend/src/components/EntityListView.vue
+++ b/frontend/src/components/EntityListView.vue
@@ -209,12 +209,10 @@
       />
     </div>
 
-    <Dialog
+    <AppDialog
       v-model:visible="nameDialog.visible"
-      modal
+      size="sm"
       :header="nameDialog.mode === 'merge' ? t('entities.mergeTitle', { n: nameDialog.from.length }) : t('entities.renameTitle')"
-      :style="{ width: 'min(28rem, 92vw)' }"
-      :draggable="false"
     >
       <form
         class="name-form"
@@ -274,7 +272,7 @@
           />
         </div>
       </form>
-    </Dialog>
+    </AppDialog>
   </div>
 </template>
 
@@ -284,7 +282,7 @@ import { ref, reactive, computed, onMounted } from 'vue'
 import { useI18n } from 'vue-i18n'
 import { useToast } from '../services/toast.js'
 import AppButton from './ui/AppButton.vue'
-import Dialog from 'primevue/dialog'
+import AppDialog from './ui/AppDialog.vue'
 import api from '../services/api.js'
 
 /**
diff --git a/frontend/src/components/LibraryHeader.vue b/frontend/src/components/LibraryHeader.vue
index 4b6a05f63a4b83972c47da9e223b51085dcb5fd2..e63e7ac1e9f8ebeda629f2f44a357cec31ec5ab0 100644
--- a/frontend/src/components/LibraryHeader.vue
+++ b/frontend/src/components/LibraryHeader.vue
@@ -192,135 +192,149 @@
       />
     </div>
 
-    <Sidebar
+    <AppDialog
       v-model:visible="visibleFilters"
-      position="right"
-      class="custom-sidebar"
-      :modal="true"
+      drawer
+      dialog-class="filters-drawer"
       :aria-label="t('library.filters_adv')"
     >
-      <div class="sidebar-header">
-        <h3>{{ t('library.filters_adv') }}</h3>
-        <p>{{ t('library.refine_view') }}</p>
-      </div>
-
-      <div class="sidebar-content">
-        <div class="filter-group">
-          <label id="filter-read-status">{{ t('library.read_status') }}</label>
-          <Dropdown
-            :modelValue="filters.readState"
-            :options="readStateOptions"
-            optionLabel="label"
-            optionValue="value"
-            aria-labelledby="filter-read-status"
-            class="w-full custom-dropdown"
-            panelClass="custom-panel"
-            @update:modelValue="value => emitFilter('readState', value)"
+      <div class="drawer-body">
+        <div class="sidebar-header">
+          <div>
+            <h3>{{ t('library.filters_adv') }}</h3>
+            <p>{{ t('library.refine_view') }}</p>
+          </div>
+          <IconButton
+            icon="pi pi-times"
+            :label="t('common.close')"
+            @click="visibleFilters = false"
           />
         </div>
 
-        <div class="filter-group">
-          <label for="filter-read-year">{{ t('library.read_year') }}</label>
-          <Dropdown
-            inputId="filter-read-year"
-            :modelValue="hasReadYear ? filters.readYear : 'all'"
-            :options="yearOptions"
-            optionLabel="label"
-            optionValue="value"
-            :placeholder="t('library.select_year')"
-            class="w-full custom-dropdown"
-            panelClass="custom-panel"
-            @update:modelValue="setReadYear"
-          />
-        </div>
+        <div class="sidebar-content">
+          <div class="filter-group">
+            <label id="filter-read-status">{{ t('library.read_status') }}</label>
+            <Dropdown
+              appendTo="self"
+              :modelValue="filters.readState"
+              :options="readStateOptions"
+              optionLabel="label"
+              optionValue="value"
+              aria-labelledby="filter-read-status"
+              class="w-full custom-dropdown"
+              panelClass="custom-panel"
+              @update:modelValue="value => emitFilter('readState', value)"
+            />
+          </div>
 
-        <div class="filter-group">
-          <label for="filter-sort">{{ t('library.sort_by') }}</label>
-          <div class="sort-row">
+          <div class="filter-group">
+            <label for="filter-read-year">{{ t('library.read_year') }}</label>
             <Dropdown
-              inputId="filter-sort"
-              :modelValue="filters.sortField"
-              :options="sortOptions"
+              appendTo="self"
+              inputId="filter-read-year"
+              :modelValue="hasReadYear ? filters.readYear : 'all'"
+              :options="yearOptions"
               optionLabel="label"
               optionValue="value"
-              class="custom-dropdown"
+              :placeholder="t('library.select_year')"
+              class="w-full custom-dropdown"
               panelClass="custom-panel"
-              @update:modelValue="value => emitFilter('sortField', value)"
+              @update:modelValue="setReadYear"
             />
-            <AppButton
-              @click="emitFilter('sortOrder', filters.sortOrder === 'asc' ? 'desc' : 'asc')"
-              :icon="filters.sortOrder === 'asc' ? 'pi pi-sort-amount-down' : 'pi pi-sort-amount-up-alt'"
-              :aria-label="filters.sortOrder === 'asc' ? t('library.sort_asc') : t('library.sort_desc')"
-              v-tooltip.bottom="filters.sortOrder === 'asc' ? t('library.sort_asc') : t('library.sort_desc')"
-              class="btn-outlined btn-secondary sort-btn"
+          </div>
+
+          <div class="filter-group">
+            <label for="filter-sort">{{ t('library.sort_by') }}</label>
+            <div class="sort-row">
+              <Dropdown
+                appendTo="self"
+                inputId="filter-sort"
+                :modelValue="filters.sortField"
+                :options="sortOptions"
+                optionLabel="label"
+                optionValue="value"
+                class="custom-dropdown"
+                panelClass="custom-panel"
+                @update:modelValue="value => emitFilter('sortField', value)"
+              />
+              <AppButton
+                @click="emitFilter('sortOrder', filters.sortOrder === 'asc' ? 'desc' : 'asc')"
+                :icon="filters.sortOrder === 'asc' ? 'pi pi-sort-amount-down' : 'pi pi-sort-amount-up-alt'"
+                :aria-label="filters.sortOrder === 'asc' ? t('library.sort_asc') : t('library.sort_desc')"
+                v-tooltip.bottom="filters.sortOrder === 'asc' ? t('library.sort_asc') : t('library.sort_desc')"
+                class="btn-outlined btn-secondary sort-btn"
+              />
+            </div>
+          </div>
+
+          <div class="filter-group">
+            <label for="filter-tags">{{ t('library.tags') }}</label>
+            <MultiSelect
+              appendTo="self"
+              inputId="filter-tags"
+              :modelValue="filters.tags"
+              :options="tagsList"
+              optionLabel="name"
+              optionValue="name"
+              :placeholder="t('library.select_tags')"
+              :maxSelectedLabels="2"
+              :selectedItemsLabel="`{0} ${t('library.selected_tags')}`"
+              filter
+              class="w-full custom-multiselect"
+              panelClass="custom-panel"
+              @update:modelValue="value => emitFilter('tags', value)"
             />
           </div>
-        </div>
 
-        <div class="filter-group">
-          <label for="filter-tags">{{ t('library.tags') }}</label>
-          <MultiSelect
-            inputId="filter-tags"
-            :modelValue="filters.tags"
-            :options="tagsList"
-            optionLabel="name"
-            optionValue="name"
-            :placeholder="t('library.select_tags')"
-            :maxSelectedLabels="2"
-            :selectedItemsLabel="`{0} ${t('library.selected_tags')}`"
-            filter
-            class="w-full custom-multiselect"
-            panelClass="custom-panel"
-            @update:modelValue="value => emitFilter('tags', value)"
-          />
-        </div>
+          <div class="filter-group">
+            <label for="filter-authors">{{ t('library.authors') }}</label>
+            <MultiSelect
+              appendTo="self"
+              inputId="filter-authors"
+              :modelValue="filters.author"
+              :options="authorsList"
+              optionLabel="name"
+              optionValue="name"
+              :placeholder="t('library.select_authors')"
+              :maxSelectedLabels="2"
+              :selectedItemsLabel="`{0} ${t('library.selected_authors')}`"
+              filter
+              class="w-full custom-multiselect"
+              panelClass="custom-panel"
+              @update:modelValue="value => emitFilter('author', value)"
+            />
+          </div>
 
-        <div class="filter-group">
-          <label for="filter-authors">{{ t('library.authors') }}</label>
-          <MultiSelect
-            inputId="filter-authors"
-            :modelValue="filters.author"
-            :options="authorsList"
-            optionLabel="name"
-            optionValue="name"
-            :placeholder="t('library.select_authors')"
-            :maxSelectedLabels="2"
-            :selectedItemsLabel="`{0} ${t('library.selected_authors')}`"
-            filter
-            class="w-full custom-multiselect"
-            panelClass="custom-panel"
-            @update:modelValue="value => emitFilter('author', value)"
-          />
+          <div class="filter-group">
+            <label for="filter-publishers">{{ t('library.publishers') }}</label>
+            <MultiSelect
+              appendTo="self"
+              inputId="filter-publishers"
+              :modelValue="filters.publisher"
+              :options="publishersList"
+              optionLabel="name"
+              optionValue="name"
+              :placeholder="t('library.select_publishers')"
+              :maxSelectedLabels="2"
+              :selectedItemsLabel="`{0} ${t('library.selected_publishers')}`"
+              filter
+              class="w-full custom-multiselect"
+              panelClass="custom-panel"
+              @update:modelValue="value => emitFilter('publisher', value)"
+            />
+          </div>
         </div>
 
-        <div class="filter-group">
-          <label for="filter-publishers">{{ t('library.publishers') }}</label>
-          <MultiSelect
-            inputId="filter-publishers"
-            :modelValue="filters.publisher"
-            :options="publishersList"
-            optionLabel="name"
-            optionValue="name"
-            :placeholder="t('library.select_publishers')"
-            :maxSelectedLabels="2"
-            :selectedItemsLabel="`{0} ${t('library.selected_publishers')}`"
-            filter
-            class="w-full custom-multiselect"
-            panelClass="custom-panel"
-            @update:modelValue="value => emitFilter('publisher', value)"
+        <div class="sidebar-footer">
+          <AppButton
+            :label="t('library.clear_all')"
+            icon="pi pi-filter-slash"
+            class="btn-outlined btn-danger w-full"
+            @click="emit('reset')"
           />
         </div>
       </div>
-
-      <div class="sidebar-footer">
-        <AppButton
-          :label="t('library.clear_all')"
-          icon="pi pi-filter-slash"
-          class="btn-outlined btn-danger w-full"
-          @click="emit('reset')"
-        />
-      </div>
-    </Sidebar>
+    </AppDialog>
 
     <AddBookDialog
       v-model:visible="addBookDialogVisible"
@@ -333,7 +347,8 @@
 import { tagColor } from '../utils/tagColors.js'
 import { ref, computed, watch, onMounted } from 'vue'
 import AppButton from './ui/AppButton.vue'
-import Sidebar from 'primevue/sidebar'
+import AppDialog from './ui/AppDialog.vue'
+import IconButton from './form/IconButton.vue'
 import MultiSelect from 'primevue/multiselect'
 import Dropdown from 'primevue/dropdown'
 import AppChip from './ui/AppChip.vue'
@@ -781,6 +796,10 @@ defineExpose({ reloadOptions: loadOptions })
 }
 
 .sidebar-header {
+  display: flex;
+  align-items: flex-start;
+  justify-content: space-between;
+  gap: 1rem;
   margin-bottom: 2rem;
 }
 
@@ -935,31 +954,17 @@ defineExpose({ reloadOptions: loadOptions })
 </style>
 
 <style>
-.custom-sidebar.p-sidebar {
-  background-color: var(--bg-panel) !important;
-  border-left: 1px solid var(--border-color);
-  width: 24rem !important;
-}
-
-@media (max-width: 768px) {
-  .custom-sidebar.p-sidebar {
-    width: 90vw !important;
-  }
-}
-
-.custom-sidebar .p-sidebar-header {
-  display: none !important;
-}
-
-.custom-sidebar .p-sidebar-content {
-  padding: 2rem !important;
-  height: 100%;
+/* Gaveta de filtros (AppDialog drawer) */
+.filters-drawer .drawer-body {
   display: flex;
   flex-direction: column;
+  height: 100%;
+  padding: 1.5rem 1.5rem 1.75rem 2rem;
+  overflow-y: auto;
 }
 
-.custom-sidebar .p-dropdown,
-.custom-sidebar .p-multiselect {
+.filters-drawer .p-dropdown,
+.filters-drawer .p-multiselect {
   background-color: var(--bg-input);
   border: 1px solid var(--border-color);
   border-radius: 8px;
@@ -969,23 +974,23 @@ defineExpose({ reloadOptions: loadOptions })
   align-items: center;
 }
 
-.custom-sidebar .p-multiselect-label-container {
+.filters-drawer .p-multiselect-label-container {
   display: flex;
   align-items: center;
   padding-top: 0;
   padding-bottom: 0;
 }
 
-.custom-sidebar .p-dropdown:not(.p-disabled):hover,
-.custom-sidebar .p-multiselect:not(.p-disabled):hover,
-.custom-sidebar .p-dropdown.p-focus,
-.custom-sidebar .p-multiselect.p-focus {
+.filters-drawer .p-dropdown:not(.p-disabled):hover,
+.filters-drawer .p-multiselect:not(.p-disabled):hover,
+.filters-drawer .p-dropdown.p-focus,
+.filters-drawer .p-multiselect.p-focus {
   border-color: var(--main-color) !important;
   box-shadow: 0 0 0 1px rgba(var(--main-color-rgb), 0.2) !important;
 }
 
-.custom-sidebar .p-dropdown-label,
-.custom-sidebar .p-multiselect-label {
+.filters-drawer .p-dropdown-label,
+.filters-drawer .p-multiselect-label {
   color: var(--text-primary);
 }
 
diff --git a/frontend/src/components/form/DateField.vue b/frontend/src/components/form/DateField.vue
index b8f1dca4f4b398f6898f67b4cc876faffc5297b9..672d3609ac45ce1cf87144242a1c80548736c912 100644
--- a/frontend/src/components/form/DateField.vue
+++ b/frontend/src/components/form/DateField.vue
@@ -24,6 +24,7 @@
         :maxDate="maxDate || undefined"
         dateFormat="dd/mm/yy"
         class="field-calendar"
+        appendTo="self"
         :showIcon="false"
         showButtonBar
         :aria-invalid="error ? 'true' : undefined"
diff --git a/frontend/src/components/ui/AppDialog.vue b/frontend/src/components/ui/AppDialog.vue
index 08a0fd5be8b69a1241c74f4977175895bb45cbfb..1552cf2cdcbbc6c76e94bdf448ce1ba45282e7f0 100644
--- a/frontend/src/components/ui/AppDialog.vue
+++ b/frontend/src/components/ui/AppDialog.vue
@@ -3,9 +3,9 @@
     v-if="rendered"
     ref="dialogEl"
     class="app-dialog"
-    :class="[dialogClass, `size-${size}`]"
+    :class="[dialogClass, `size-${size}`, { 'is-drawer': drawer }]"
     :aria-label="ariaLabel || undefined"
-    :aria-labelledby="ariaLabelledby || undefined"
+    :aria-labelledby="ariaLabelledby || (header ? headerId : undefined)"
     @cancel.prevent="onCancel"
     @mousedown.self="pressedBackdrop = true"
     @click.self="onBackdropClick"
@@ -16,13 +16,38 @@
       :style="panelStyle"
       @mousedown="pressedBackdrop = false"
     >
-      <slot />
+      <header
+        v-if="header"
+        class="app-dialog-header"
+      >
+        <h2 :id="headerId">{{ header }}</h2>
+        <button
+          v-if="closable"
+          type="button"
+          class="app-dialog-close"
+          :aria-label="t('common.close')"
+          @click="emit('update:visible', false)"
+        >
+          <i
+            class="pi pi-times"
+            aria-hidden="true"
+          ></i>
+        </button>
+      </header>
+      <div
+        v-if="header"
+        class="app-dialog-content"
+      >
+        <slot />
+      </div>
+      <slot v-else />
     </div>
   </dialog>
 </template>
 
 <script setup>
 import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
+import { useI18n } from 'vue-i18n'
 
 /**
  * Janela modal com o <dialog> nativo, no lugar do Dialog do PrimeVue.
@@ -41,10 +66,17 @@ const props = defineProps({
   closeOnEscape: { type: Boolean, default: true },
   dialogClass: { type: [String, Array, Object], default: '' },
   size: { type: String, default: 'md' }, // sm | md | lg | xl
+  // Gaveta presa na lateral direita, na altura toda (filtros)
+  drawer: { type: Boolean, default: false },
+  // Com título: cabeçalho com o título e o X; sem: o conteúdo desenha tudo
+  header: { type: String, default: '' },
+  closable: { type: Boolean, default: true },
   panelStyle: { type: [String, Object], default: undefined }
 })
 
 const emit = defineEmits(['update:visible', 'hide', 'show'])
+const { t } = useI18n()
+const headerId = `app-dialog-title-${Math.random().toString(36).slice(2, 9)}`
 
 const dialogEl = ref(null)
 const rendered = ref(props.visible)
@@ -81,12 +113,12 @@ function onNativeClose() {
 }
 
 function onCancel() {
-  if (props.closeOnEscape) emit('update:visible', false)
+  if (props.closeOnEscape && props.closable) emit('update:visible', false)
 }
 
 function onBackdropClick() {
   // Só fecha se o clique começou e terminou fora (arrastar seleção de texto não fecha)
-  if (props.dismissable && pressedBackdrop.value) emit('update:visible', false)
+  if (props.dismissable && props.closable && pressedBackdrop.value) emit('update:visible', false)
   pressedBackdrop.value = false
 }
 
@@ -95,6 +127,9 @@ watch(() => props.visible, value => (value ? open() : close()), { immediate: tru
 onBeforeUnmount(() => {
   close()
   lockScroll(false)
+  // Desmontado antes do evento "close": devolve o foco aqui mesmo
+  if (returnFocus && document.contains(returnFocus)) returnFocus.focus({ preventScroll: true })
+  returnFocus = null
 })
 
 defineExpose({ close: () => emit('update:visible', false) })
@@ -160,6 +195,80 @@ html.dialog-open {
   max-width: 100%;
 }
 
+.app-dialog-header {
+  display: flex;
+  align-items: center;
+  justify-content: space-between;
+  gap: 1rem;
+  padding: 1.1rem 1.25rem 0.5rem 1.5rem;
+}
+
+.app-dialog-header h2 {
+  margin: 0;
+  font-size: var(--fs-lg);
+  font-weight: 700;
+}
+
+.app-dialog-close {
+  display: inline-flex;
+  align-items: center;
+  justify-content: center;
+  flex-shrink: 0;
+  width: 34px;
+  height: 34px;
+  border: none;
+  border-radius: 50%;
+  background: transparent;
+  color: var(--text-secondary);
+  cursor: pointer;
+}
+
+.app-dialog-close:hover {
+  background: var(--bg-hover);
+  color: var(--text-primary);
+}
+
+.app-dialog-close:focus-visible {
+  outline: 2px solid var(--main-color);
+}
+
+.app-dialog-content {
+  padding: 0.5rem 1.5rem 1.5rem;
+  overflow-y: auto;
+}
+
+/* Gaveta lateral */
+.app-dialog.is-drawer {
+  margin: 0 0 0 auto;
+  height: 100dvh;
+  max-height: 100dvh;
+  max-width: 100vw;
+}
+
+.app-dialog.is-drawer .app-dialog-panel {
+  width: 420px;
+  height: 100%;
+  max-height: 100dvh;
+  border-radius: 0;
+  border-width: 0 0 0 1px;
+}
+
+.app-dialog.is-drawer[open] {
+  animation: app-drawer-in 0.22s ease-out;
+}
+
+@keyframes app-drawer-in {
+  from {
+    transform: translateX(100%);
+  }
+}
+
+@media (max-width: 768px) {
+  .app-dialog.is-drawer .app-dialog-panel {
+    width: 90vw;
+  }
+}
+
 @keyframes app-dialog-in {
   from {
     opacity: 0;
@@ -175,6 +284,7 @@ html.dialog-open {
 
 @media (prefers-reduced-motion: reduce) {
   .app-dialog[open],
+  .app-dialog.is-drawer[open],
   .app-dialog[open]::backdrop {
     animation: none;
   }
diff --git a/frontend/src/components/ui/PopupMenu.vue b/frontend/src/components/ui/PopupMenu.vue
new file mode 100644
index 0000000000000000000000000000000000000000..256a2cb555fde733932271d7582c6df42b30e709
--- /dev/null
+++ b/frontend/src/components/ui/PopupMenu.vue
@@ -0,0 +1,174 @@
+<template>
+  <div
+    :id="id"
+    ref="menuEl"
+    class="popup-menu"
+    role="menu"
+    popover="auto"
+    @toggle="onToggle"
+    @keydown="onKeydown"
+  >
+    <template
+      v-for="(item, index) in items"
+      :key="index"
+    >
+      <hr
+        v-if="item.separator"
+        class="popup-separator"
+        role="separator"
+      />
+      <button
+        v-else
+        type="button"
+        role="menuitem"
+        class="popup-item"
+        tabindex="-1"
+        :disabled="item.disabled"
+        @click="choose(item)"
+      >
+        <i
+          v-if="item.icon"
+          :class="item.icon"
+          aria-hidden="true"
+        ></i>
+        <span>{{ item.label }}</span>
+      </button>
+    </template>
+  </div>
+</template>
+
+<script setup>
+import { ref } from 'vue'
+
+/**
+ * Menu suspenso (no lugar do Menu "popup" do PrimeVue). Usa a Popover API:
+ * fica por cima de tudo, fecha clicando fora ou com Esc. Setas do teclado
+ * andam entre os itens.
+ *
+ *   <PopupMenu ref="menu" id="x" :items="[{ label, icon, command }, { separator: true }]" />
+ *   menu.value.toggle(event)
+ */
+defineProps({
+  id: { type: String, required: true },
+  items: { type: Array, default: () => [] }
+})
+
+const menuEl = ref(null)
+let anchor = null
+
+function itemsEls() {
+  return [...(menuEl.value?.querySelectorAll('.popup-item:not(:disabled)') || [])]
+}
+
+function place() {
+  const el = menuEl.value
+  if (!el || !anchor) return
+  const rect = anchor.getBoundingClientRect()
+  const menuRect = el.getBoundingClientRect()
+  const below = rect.bottom + 6
+  // Sem espaço embaixo (barra de ações presa no rodapé): abre para cima
+  const top = below + menuRect.height > window.innerHeight - 8 ? rect.top - menuRect.height - 6 : below
+  const left = Math.max(8, Math.min(rect.left, window.innerWidth - menuRect.width - 8))
+  el.style.top = `${Math.max(8, top)}px`
+  el.style.left = `${left}px`
+}
+
+function toggle(event) {
+  const el = menuEl.value
+  if (!el) return
+  if (el.matches(':popover-open')) {
+    el.hidePopover()
+    return
+  }
+  anchor = event?.currentTarget || event?.target || null
+  el.showPopover()
+  place()
+  anchor?.setAttribute('aria-expanded', 'true')
+  itemsEls()[0]?.focus()
+}
+
+function onToggle(event) {
+  if (event.newState === 'closed') {
+    anchor?.setAttribute('aria-expanded', 'false')
+    if (menuEl.value?.contains(document.activeElement) || document.activeElement === document.body) anchor?.focus()
+  }
+}
+
+function choose(item) {
+  menuEl.value?.hidePopover()
+  item.command?.()
+}
+
+function onKeydown(event) {
+  const list = itemsEls()
+  const index = list.indexOf(document.activeElement)
+  if (event.key === 'ArrowDown') list[(index + 1) % list.length]?.focus()
+  else if (event.key === 'ArrowUp') list[(index - 1 + list.length) % list.length]?.focus()
+  else if (event.key === 'Home') list[0]?.focus()
+  else if (event.key === 'End') list[list.length - 1]?.focus()
+  else if (event.key === 'Tab') menuEl.value?.hidePopover()
+  else return
+  if (event.key !== 'Tab') event.preventDefault()
+}
+
+defineExpose({ toggle })
+</script>
+
+<style>
+.popup-menu {
+  position: fixed;
+  inset: auto;
+  margin: 0;
+  min-width: 12rem;
+  padding: 0.35rem;
+  border: 1px solid var(--border-color);
+  border-radius: 12px;
+  background: var(--bg-panel);
+  color: var(--text-primary);
+  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.3);
+}
+
+.popup-item {
+  display: flex;
+  align-items: center;
+  gap: 0.6rem;
+  width: 100%;
+  padding: 0.6rem 0.85rem;
+  border: none;
+  border-radius: 8px;
+  background: transparent;
+  color: inherit;
+  font: inherit;
+  font-size: var(--fs-sm);
+  text-align: left;
+  cursor: pointer;
+}
+
+.popup-item .pi {
+  color: var(--text-secondary);
+  font-size: var(--fs-sm);
+}
+
+.popup-item:hover,
+.popup-item:focus-visible {
+  background: var(--bg-hover);
+  outline: none;
+}
+
+.popup-item:disabled {
+  opacity: 0.5;
+  cursor: not-allowed;
+}
+
+.popup-separator {
+  margin: 0.3rem 0.4rem;
+  border: none;
+  border-top: 1px solid var(--border-color);
+}
+
+@media (pointer: coarse) {
+  .popup-item {
+    min-height: 2.75rem;
+  }
+}
+</style>
diff --git a/frontend/src/views/Settings.vue b/frontend/src/views/Settings.vue
index d74e15218e0588c0c799c2f866d9be9bef81c7a9..52c2a0b35853612bdb00343113243281d128e8c3 100644
--- a/frontend/src/views/Settings.vue
+++ b/frontend/src/views/Settings.vue
@@ -334,12 +334,10 @@
       </div>
     </div>
 
-    <Dialog
+    <AppDialog
       v-model:visible="deleteDialogVisible"
-      modal
+      size="sm"
       :header="t('settings.delete.confirmTitle')"
-      :style="{ width: '460px', maxWidth: '95vw' }"
-      :dismissableMask="!deleting"
       :closable="!deleting"
     >
       <form
@@ -374,14 +372,12 @@
           />
         </div>
       </form>
-    </Dialog>
+    </AppDialog>
 
-    <Dialog
+    <AppDialog
       v-model:visible="accountDialog.visible"
-      modal
+      size="sm"
       :header="accountDialog.field === 'email' ? t('settings.account.emailTitle') : t('settings.account.usernameTitle')"
-      :style="{ width: 'min(28rem, 92vw)' }"
-      :draggable="false"
     >
       <form
         class="stack"
@@ -416,7 +412,7 @@
           :disabled="!accountDialog.value.trim() || !accountDialog.password"
         />
       </form>
-    </Dialog>
+    </AppDialog>
   </div>
 </template>
 
@@ -427,7 +423,7 @@ import { useRouter } from 'vue-router'
 import { useI18n } from 'vue-i18n'
 import { useToast } from '../services/toast.js'
 import AppButton from '../components/ui/AppButton.vue'
-import Dialog from 'primevue/dialog'
+import AppDialog from '../components/ui/AppDialog.vue'
 import AppSwitch from '../components/ui/AppSwitch.vue'
 import api from '../services/api.js'
 import { currentUser, updateUser, setUser, clearSession } from '../services/session.js'
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
refactor: diálogos, gaveta e menu sem PrimeVue (2/3)

- AppDialog (<dialog> nativo) em todos os diálogos: Novo livro, livro
  aberto, ações em lote, renomear/mesclar, excluir conta e trocar
  usuário/e-mail; com título opcional, X e modo gaveta
- gaveta de filtros com AppDialog drawer, agora com botão de fechar
- PopupMenu (Popover API) no menu de status das ações em lote, com
  setas do teclado
- os Dropdown/MultiSelect/Calendar que sobram abrem dentro do diálogo
  (appendTo="self") até o pacote 7 trocá-los
__MSG__
echo "────────────────────────────────────────────"