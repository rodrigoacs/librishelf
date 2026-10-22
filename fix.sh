#!/usr/bin/env bash
# Librishelf — pacote 7: sem PrimeVue (3 de 3)
#
# Rode na raiz do repositório Librishelf, na branch fix/audit-2026-08, com
# o pacote anterior já commitado:   bash pacote-7-sem-primevue-3.sh
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
  README.md
  frontend/package-lock.json
  frontend/package.json
  frontend/src/assets/main.css
  frontend/src/components/AuthLayout.vue
  frontend/src/components/AuthorsInput.vue
  frontend/src/components/LibraryHeader.vue
  frontend/src/components/NavigationMenu.vue
  frontend/src/components/form/DateField.vue
  frontend/src/components/ui/AppMultiSelect.vue
  frontend/src/components/ui/AppSelect.vue
  frontend/src/composables/useFloatingPanel.js
  frontend/src/locales/en.json
  frontend/src/locales/pt.json
  frontend/src/main.js
  frontend/src/router/index.js
  frontend/src/views/Dashboard.vue
  frontend/src/views/Library.vue
  frontend/vite.config.js
  frontend/vite/primevueTheme.js
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
diff --git a/README.md b/README.md
index bbcc587a80a571e47ae48f517d24daedd6f62702..e7dcbf43eac10235bedf4d9f217caf1fe74690ca 100644
--- a/README.md
+++ b/README.md
@@ -20,7 +20,7 @@ Live at **[librishelf.com](https://librishelf.com)**.
 
 | Layer    | Tech                                                                 |
 |----------|----------------------------------------------------------------------|
-| Frontend | Vue 3, Vite, PrimeVue 3, vue-i18n, Chart.js                           |
+| Frontend | Vue 3, Vite, vue-i18n, Chart.js, PrimeIcons (own UI components in `src/components/ui`) |
 | Backend  | Node.js 22+, Express 5, `pg`, `sharp` (covers → AVIF/JPG), JWT in an httpOnly cookie |
 | Database | PostgreSQL (schema `librishelf`)                                     |
 | Deploy   | Docker Compose; nginx serves the SPA and proxies `/api` to the backend |
diff --git a/frontend/package-lock.json b/frontend/package-lock.json
index add56850c6cb9cfb06866b225475b16fe285a6d9..5fcdad159b0f1c73597ab0c78c06bbe97b31031c 100644
--- a/frontend/package-lock.json
+++ b/frontend/package-lock.json
@@ -12,14 +12,12 @@
         "@fontsource-variable/source-serif-4": "^5.3.0",
         "chart.js": "^4.5.1",
         "primeicons": "^7.0.0",
-        "primevue": "^3.52.0",
         "vue": "^3.4.21",
         "vue-i18n": "^11.2.8",
         "vue-router": "^4.3.0"
       },
       "devDependencies": {
         "@vitejs/plugin-vue": "^6.0.9",
-        "postcss": "^8.5.29",
         "vite": "^8.3.4"
       },
       "engines": {
@@ -959,15 +957,6 @@
       "integrity": "sha512-jK3Et9UzwzTsd6tzl2RmwrVY/b8raJ3QZLzoDACj+oTJ0oX7L9Hy+XnVwgo4QVKlKpnP/Ur13SXV/pVh4LzaDw==",
       "license": "MIT"
     },
-    "node_modules/primevue": {
-      "version": "3.53.1",
-      "resolved": "https://registry.npmjs.org/primevue/-/primevue-3.53.1.tgz",
-      "integrity": "sha512-Bp4peZPdhfKYXwvtsOGGh5dfgmTelm+LZEZKGs/c5mOHhsUJ6xi3EcOZoQVI6oklS946ayMQvgD5L0S7itGO0g==",
-      "license": "MIT",
-      "peerDependencies": {
-        "vue": "^3.0.0"
-      }
-    },
     "node_modules/rolldown": {
       "version": "1.2.13",
       "resolved": "https://registry.npmjs.org/rolldown/-/rolldown-1.2.13.tgz",
diff --git a/frontend/package.json b/frontend/package.json
index c2da8e5da7b1e06a53e97b8d61c71f0eb8b67bf3..78110a2c60aff5d0fa4c434c8019fc8914241f98 100644
--- a/frontend/package.json
+++ b/frontend/package.json
@@ -13,14 +13,12 @@
     "@fontsource-variable/source-serif-4": "^5.3.0",
     "chart.js": "^4.5.1",
     "primeicons": "^7.0.0",
-    "primevue": "^3.52.0",
     "vue": "^3.4.21",
     "vue-i18n": "^11.2.8",
     "vue-router": "^4.3.0"
   },
   "devDependencies": {
     "@vitejs/plugin-vue": "^6.0.9",
-    "postcss": "^8.5.29",
     "vite": "^8.3.4"
   },
   "engines": {
diff --git a/frontend/src/assets/main.css b/frontend/src/assets/main.css
index d9863529ec0ed6208066f4a309ee4e46b9434cb3..b04ee9e752fee202734591a09ee02470fcc255bb 100644
--- a/frontend/src/assets/main.css
+++ b/frontend/src/assets/main.css
@@ -2,7 +2,6 @@
   --font-family: 'Inter Variable', 'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
   /* Títulos, logo e capas desenhadas: serifa empacotada, igual em todo sistema */
   --font-display: 'Source Serif 4 Variable', 'Source Serif 4', Georgia, serif;
-  --p-focus-ring-color: var(--main-color);
 
   /* Escala de fonte (use estes tokens em vez de tamanhos soltos) */
   --fs-xs: 0.75rem;
@@ -56,19 +55,6 @@
   --yellow-solid-rgb: 143, 101, 0;
   --orange-solid-rgb: 194, 65, 12;
 
-  /* Variáveis do PrimeVue apontando para as do app */
-  --primary-color: var(--main-color);
-  --primary-color-text: var(--on-main);
-  --surface-ground: var(--bg-app);
-  --surface-section: var(--bg-panel);
-  --surface-card: var(--bg-panel);
-  --surface-overlay: var(--bg-panel);
-  --surface-border: var(--border-color);
-  --text-color: var(--text-primary);
-  --text-color-secondary: var(--text-secondary);
-  --highlight-bg: rgba(var(--main-color-rgb), 0.16);
-  --highlight-text-color: var(--main-color);
-
   color-scheme: dark;
 }
 
@@ -199,61 +185,6 @@ body {
   outline-offset: 2px;
 }
 
-.p-checkbox .p-checkbox-box {
-  border: 2px solid var(--text-muted);
-  background: transparent;
-  border-radius: 6px;
-  transition: all 0.2s;
-}
-
-.p-checkbox.p-highlight .p-checkbox-box {
-  border-color: var(--main-solid);
-  background-color: var(--main-solid);
-}
-
-.p-checkbox-box .p-icon {
-  color: var(--on-main);
-}
-
-.p-inputtext {
-  background-color: var(--bg-input);
-  color: var(--text-primary);
-  border: 1px solid transparent;
-  padding: 0.75rem 1rem;
-  border-radius: 8px;
-  transition: all 0.2s;
-}
-
-.p-inputtext:enabled:focus {
-  outline: none;
-  border-color: var(--main-color);
-  box-shadow: 0 0 0 2px rgba(var(--main-color-rgb), 0.2);
-}
-
-.p-inputtext:disabled {
-  background-color: transparent;
-  color: var(--text-muted);
-  opacity: 0.7;
-}
-
-.p-dialog-mask {
-  background-color: var(--bg-overlay) !important;
-  backdrop-filter: blur(4px);
-}
-
-.dialog-overlay {
-  background-color: var(--bg-panel);
-  color: var(--text-primary);
-  border: 1px solid var(--border-color);
-  border-radius: 16px;
-  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
-}
-
-@media (max-width: 768px) {
-  .dialog-overlay {
-    width: 90%;
-  }
-}
 /* ------------------------------------------------------------------ botões
  * AppButton (components/ui/AppButton.vue). Sem classe de variante é o botão
  * principal: fundo na cor de destaque e texto branco.
diff --git a/frontend/src/components/AuthLayout.vue b/frontend/src/components/AuthLayout.vue
index 8da626cc0cab09d503a2a4d37c5b1a1cbbb6cadb..f442190b68a0b0d095bd59d6350b9463610ed2fc 100644
--- a/frontend/src/components/AuthLayout.vue
+++ b/frontend/src/components/AuthLayout.vue
@@ -225,46 +225,6 @@ onMounted(async () => {
   width: 100%;
 }
 
-.form-wrapper :deep(.p-inputtext) {
-  background-color: var(--bg-panel);
-  border: 1px solid var(--border-color);
-  color: var(--text-primary);
-  padding: 1rem;
-  width: 100%;
-}
-
-.form-wrapper :deep(.p-inputtext:focus),
-.form-wrapper :deep(.p-inputwrapper-focus .p-inputtext) {
-  border-color: var(--main-color);
-  box-shadow: 0 0 0 1px var(--main-color);
-}
-
-.form-wrapper :deep(.p-float-label label) {
-  color: var(--text-secondary);
-  top: 50%;
-  margin-top: -0.5rem;
-  left: 1rem;
-  transition: all 0.2s ease;
-  pointer-events: none;
-}
-
-.form-wrapper :deep(.p-inputtext:focus ~ label),
-.form-wrapper :deep(.p-inputtext.p-filled ~ label),
-.form-wrapper :deep(.p-inputwrapper-focus ~ label),
-.form-wrapper :deep(.p-inputwrapper-filled ~ label) {
-  top: -0.75rem;
-  font-size: var(--fs-xs);
-  background-color: var(--bg-panel);
-  padding: 0 0.5rem;
-  color: var(--main-color);
-  left: 0.5rem;
-  z-index: 2;
-}
-
-.form-wrapper :deep(.p-password) {
-  width: 100%;
-}
-
 .form-wrapper :deep(.field-hint) {
   display: block;
   margin-top: 0.4rem;
diff --git a/frontend/src/components/AuthorsInput.vue b/frontend/src/components/AuthorsInput.vue
index 521478c92c407919414aa6282396e1e2d0da8ff1..71fc29226c67c9c9833d5cdebd055d58ab43471e 100644
--- a/frontend/src/components/AuthorsInput.vue
+++ b/frontend/src/components/AuthorsInput.vue
@@ -1,21 +1,46 @@
 <template>
   <div
     class="authors-input"
-    :class="{ invalid: Boolean(error), floated: focused || modelValue.length > 0 }"
+    :class="{ invalid: Boolean(error), floated: focused || modelValue.length > 0 || draft !== '' }"
   >
     <div class="field-box">
-      <Chips
-        :modelValue="modelValue"
-        :inputId="inputId"
-        :allowDuplicate="false"
-        addOnBlur
-        :max="maxAuthors"
-        :aria-invalid="error ? 'true' : undefined"
-        :aria-describedby="describedBy"
-        @update:modelValue="onUpdate"
-        @focus="focused = true"
-        @blur="focused = false"
-      />
+      <div
+        class="chips-box"
+        @click="inputEl?.focus()"
+      >
+        <span
+          v-for="(name, index) in modelValue"
+          :key="name"
+          class="author-chip"
+        >
+          {{ name }}
+          <button
+            type="button"
+            class="author-chip-remove"
+            :aria-label="t('common.removeItem', { name })"
+            @click.stop="removeAt(index)"
+          >
+            <i
+              class="pi pi-times"
+              aria-hidden="true"
+            ></i>
+          </button>
+        </span>
+        <input
+          :id="inputId"
+          ref="inputEl"
+          v-model="draft"
+          class="chips-input"
+          autocomplete="off"
+          :aria-invalid="error ? 'true' : undefined"
+          :aria-describedby="describedBy"
+          :disabled="modelValue.length >= maxAuthors"
+          @keydown.enter.prevent="commit"
+          @keydown.backspace="onBackspace"
+          @focus="focused = true"
+          @blur="onBlur"
+        />
+      </div>
       <label
         :for="inputId"
         class="field-label"
@@ -45,7 +70,6 @@
 
 <script setup>
 import { computed, ref } from 'vue'
-import Chips from 'primevue/chips'
 import { useI18n } from 'vue-i18n'
 
 /**
@@ -64,12 +88,35 @@ const props = defineProps({
 const emit = defineEmits(['update:modelValue'])
 const { t } = useI18n()
 const focused = ref(false)
+const draft = ref('')
+const inputEl = ref(null)
 
 // Mesmo limite do backend (utils/nameList.js → MAX_NAMES).
 const maxAuthors = 30
 
 const describedBy = computed(() => [props.error ? `${props.inputId}-error` : '', `${props.inputId}-hint`].filter(Boolean).join(' '))
 
+// Enter (ou sair do campo) põe o nome digitado na lista
+function commit() {
+  if (!draft.value.trim()) return
+  onUpdate([...props.modelValue, draft.value])
+  draft.value = ''
+}
+
+function onBlur() {
+  focused.value = false
+  commit()
+}
+
+// Backspace com o campo vazio tira o último autor
+function onBackspace() {
+  if (draft.value === '' && props.modelValue.length) removeAt(props.modelValue.length - 1)
+}
+
+function removeAt(index) {
+  onUpdate(props.modelValue.filter((_, i) => i !== index))
+}
+
 function onUpdate(values) {
   const seen = new Set()
   const cleaned = []
@@ -112,46 +159,63 @@ function onUpdate(values) {
   border-color: var(--red);
 }
 
-.authors-input :deep(.p-chips) {
-  width: 100%;
-}
-
-.authors-input :deep(.p-chips-multiple-container) {
-  width: 100%;
+.chips-box {
+  display: flex;
+  flex-wrap: wrap;
+  align-items: center;
+  gap: 0.35rem;
   min-height: 3.25rem;
-  background: transparent;
-  border: none;
-  box-shadow: none;
-  border-radius: 10px;
   padding: 1.4rem 0.6rem 0.4rem;
-  gap: 0.35rem;
-  flex-wrap: wrap;
+  cursor: text;
 }
 
-.authors-input :deep(.p-chips-token) {
+.author-chip {
+  display: inline-flex;
+  align-items: center;
+  gap: 0.2rem;
+  padding: 0.15rem 0.2rem 0.15rem 0.65rem;
+  border-radius: 999px;
   background-color: rgba(var(--main-color-rgb), 0.15);
   color: var(--text-primary);
-  border-radius: 999px;
-  padding: 0.15rem 0.65rem;
   font-size: var(--fs-sm);
 }
 
-.authors-input :deep(.p-chips-input-token) {
-  flex: 1;
-  min-width: 8rem;
+.author-chip-remove {
+  display: inline-flex;
+  align-items: center;
+  justify-content: center;
+  width: 1.4rem;
+  height: 1.4rem;
+  padding: 0;
+  border: none;
+  border-radius: 50%;
+  background: transparent;
+  color: inherit;
+  opacity: 0.7;
+  cursor: pointer;
 }
 
-.authors-input :deep(.p-chips-input-token input),
-.authors-input :deep(.p-chips-input-token input:focus) {
-  width: 100%;
-  color: var(--text-primary);
-  background: transparent;
-  border: none;
-  box-shadow: none;
+.author-chip-remove .pi {
+  font-size: 0.65rem;
+}
+
+.author-chip-remove:hover,
+.author-chip-remove:focus-visible {
+  opacity: 1;
+  background: rgba(127, 127, 127, 0.25);
   outline: none;
+}
+
+.chips-input {
+  flex: 1;
+  min-width: 8rem;
   padding: 0.1rem 0.3rem;
+  border: none;
+  background: transparent;
+  color: var(--text-primary);
   font: inherit;
   font-size: var(--fs-md);
+  outline: none;
 }
 
 .field-label {
diff --git a/frontend/src/components/LibraryHeader.vue b/frontend/src/components/LibraryHeader.vue
index e63e7ac1e9f8ebeda629f2f44a357cec31ec5ab0..198dd1b268eb489f0ac120a4c811527d3abeb957 100644
--- a/frontend/src/components/LibraryHeader.vue
+++ b/frontend/src/components/LibraryHeader.vue
@@ -47,16 +47,15 @@
         </div>
 
         <!-- Ordenar à mão, ao lado da busca (antes só dentro da gaveta de filtros).
-             Dropdown do PrimeVue, e não <select>: a lista nativa não segue o tema. -->
-        <Dropdown
+             AppSelect, e não <select>: a lista nativa não segue o tema. -->
+        <AppSelect
           :modelValue="filters.sortField"
           :options="sortOptions"
           optionLabel="label"
           optionValue="value"
           :aria-label="t('library.sort_by')"
           class="sort-quick"
-          panelClass="custom-panel sort-quick-panel"
-          scrollHeight="22rem"
+          panel-class="sort-quick-panel"
           @update:modelValue="value => emitFilter('sortField', value)"
         >
           <template #value>
@@ -69,7 +68,7 @@
               <span class="sort-quick-value">{{ currentSortLabel }}</span>
             </span>
           </template>
-        </Dropdown>
+        </AppSelect>
       </div>
 
       <div class="actions">
@@ -214,31 +213,27 @@
         <div class="sidebar-content">
           <div class="filter-group">
             <label id="filter-read-status">{{ t('library.read_status') }}</label>
-            <Dropdown
-              appendTo="self"
+            <AppSelect
               :modelValue="filters.readState"
               :options="readStateOptions"
               optionLabel="label"
               optionValue="value"
               aria-labelledby="filter-read-status"
-              class="w-full custom-dropdown"
-              panelClass="custom-panel"
+              class="w-full"
               @update:modelValue="value => emitFilter('readState', value)"
             />
           </div>
 
           <div class="filter-group">
             <label for="filter-read-year">{{ t('library.read_year') }}</label>
-            <Dropdown
-              appendTo="self"
+            <AppSelect
               inputId="filter-read-year"
               :modelValue="hasReadYear ? filters.readYear : 'all'"
               :options="yearOptions"
               optionLabel="label"
               optionValue="value"
               :placeholder="t('library.select_year')"
-              class="w-full custom-dropdown"
-              panelClass="custom-panel"
+              class="w-full"
               @update:modelValue="setReadYear"
             />
           </div>
@@ -246,15 +241,13 @@
           <div class="filter-group">
             <label for="filter-sort">{{ t('library.sort_by') }}</label>
             <div class="sort-row">
-              <Dropdown
-                appendTo="self"
+              <AppSelect
                 inputId="filter-sort"
                 :modelValue="filters.sortField"
                 :options="sortOptions"
                 optionLabel="label"
                 optionValue="value"
                 class="custom-dropdown"
-                panelClass="custom-panel"
                 @update:modelValue="value => emitFilter('sortField', value)"
               />
               <AppButton
@@ -269,57 +262,51 @@
 
           <div class="filter-group">
             <label for="filter-tags">{{ t('library.tags') }}</label>
-            <MultiSelect
-              appendTo="self"
+            <AppMultiSelect
               inputId="filter-tags"
               :modelValue="filters.tags"
               :options="tagsList"
               optionLabel="name"
               optionValue="name"
               :placeholder="t('library.select_tags')"
-              :maxSelectedLabels="2"
-              :selectedItemsLabel="`{0} ${t('library.selected_tags')}`"
+              :max-labels="2"
+              :selected-label="`{0} ${t('library.selected_tags')}`"
               filter
-              class="w-full custom-multiselect"
-              panelClass="custom-panel"
+              class="w-full"
               @update:modelValue="value => emitFilter('tags', value)"
             />
           </div>
 
           <div class="filter-group">
             <label for="filter-authors">{{ t('library.authors') }}</label>
-            <MultiSelect
-              appendTo="self"
+            <AppMultiSelect
               inputId="filter-authors"
               :modelValue="filters.author"
               :options="authorsList"
               optionLabel="name"
               optionValue="name"
               :placeholder="t('library.select_authors')"
-              :maxSelectedLabels="2"
-              :selectedItemsLabel="`{0} ${t('library.selected_authors')}`"
+              :max-labels="2"
+              :selected-label="`{0} ${t('library.selected_authors')}`"
               filter
-              class="w-full custom-multiselect"
-              panelClass="custom-panel"
+              class="w-full"
               @update:modelValue="value => emitFilter('author', value)"
             />
           </div>
 
           <div class="filter-group">
             <label for="filter-publishers">{{ t('library.publishers') }}</label>
-            <MultiSelect
-              appendTo="self"
+            <AppMultiSelect
               inputId="filter-publishers"
               :modelValue="filters.publisher"
               :options="publishersList"
               optionLabel="name"
               optionValue="name"
               :placeholder="t('library.select_publishers')"
-              :maxSelectedLabels="2"
-              :selectedItemsLabel="`{0} ${t('library.selected_publishers')}`"
+              :max-labels="2"
+              :selected-label="`{0} ${t('library.selected_publishers')}`"
               filter
-              class="w-full custom-multiselect"
-              panelClass="custom-panel"
+              class="w-full"
               @update:modelValue="value => emitFilter('publisher', value)"
             />
           </div>
@@ -349,8 +336,8 @@ import { ref, computed, watch, onMounted } from 'vue'
 import AppButton from './ui/AppButton.vue'
 import AppDialog from './ui/AppDialog.vue'
 import IconButton from './form/IconButton.vue'
-import MultiSelect from 'primevue/multiselect'
-import Dropdown from 'primevue/dropdown'
+import AppMultiSelect from './ui/AppMultiSelect.vue'
+import AppSelect from './ui/AppSelect.vue'
 import AppChip from './ui/AppChip.vue'
 import AddBookDialog from './AddBookDialog.vue'
 import api from '../services/api.js'
@@ -592,37 +579,14 @@ defineExpose({ reloadOptions: loadOptions })
   min-width: 0;
 }
 
-.sort-quick.p-dropdown {
+.sort-quick {
   flex-shrink: 0;
-  height: 2.75rem;
-  align-items: center;
-  border-radius: 999px;
-  border: 1px solid var(--border-color);
-  background: var(--bg-input);
-  box-shadow: none;
-}
-
-.sort-quick.p-dropdown:not(.p-disabled):hover {
-  border-color: var(--border-hover);
-}
-
-.sort-quick.p-dropdown.p-focus {
-  border-color: var(--main-color);
-  box-shadow: 0 0 0 2px rgba(var(--main-color-rgb), 0.2);
 }
 
-.sort-quick :deep(.p-dropdown-label) {
-  display: flex;
-  align-items: center;
-  padding: 0 0.25rem 0 0.95rem;
-  background: transparent;
-  border: none;
-}
-
-.sort-quick :deep(.p-dropdown-trigger) {
-  width: 2.25rem;
-  background: transparent;
-  color: var(--text-secondary);
+.sort-quick :deep(.app-select-trigger) {
+  min-height: 2.75rem;
+  border-radius: 999px;
+  padding: 0 0.85rem 0 0.95rem;
 }
 
 .sort-quick-content {
@@ -713,20 +677,20 @@ defineExpose({ reloadOptions: loadOptions })
   align-items: center;
 }
 
-.action-btn {
-  color: var(--text-secondary) !important;
+.action-btn.btn {
+  --btn-fg: var(--text-secondary);
   width: 42px;
   height: 42px;
 }
 
-.action-btn:hover {
-  background-color: var(--bg-hover) !important;
-  color: var(--text-primary) !important;
+.action-btn.btn:hover:not(:disabled) {
+  --btn-bg: var(--bg-hover);
+  --btn-fg: var(--text-primary);
 }
 
-.action-btn.active-filter {
-  color: var(--main-color) !important;
-  background-color: rgba(var(--main-color-rgb), 0.1) !important;
+.action-btn.btn.active-filter {
+  --btn-fg: var(--main-color);
+  --btn-bg: rgba(var(--main-color-rgb), 0.1);
 }
 
 .add-btn {
@@ -839,7 +803,7 @@ defineExpose({ reloadOptions: loadOptions })
 
 .sort-row .custom-dropdown {
   flex: 1;
-  width: auto !important;
+  width: auto;
   min-width: 0;
 }
 
@@ -893,11 +857,8 @@ defineExpose({ reloadOptions: loadOptions })
     padding-bottom: 0.6rem;
   }
 
-  .sort-quick.p-dropdown {
-    height: 2.6rem;
-  }
-
-  .sort-quick :deep(.p-dropdown-label) {
+  .sort-quick :deep(.app-select-trigger) {
+    min-height: 2.6rem;
     padding-left: 0.8rem;
   }
 
@@ -946,9 +907,9 @@ defineExpose({ reloadOptions: loadOptions })
     flex-shrink: 0;
   }
 
-  .clear-all-btn {
+  .clear-all-btn.btn {
     flex-shrink: 0;
-    padding: 0.35rem 0.5rem !important;
+    padding: 0.35rem 0.5rem;
   }
 }
 </style>
@@ -963,107 +924,9 @@ defineExpose({ reloadOptions: loadOptions })
   overflow-y: auto;
 }
 
-.filters-drawer .p-dropdown,
-.filters-drawer .p-multiselect {
-  background-color: var(--bg-input);
-  border: 1px solid var(--border-color);
-  border-radius: 8px;
-  transition: all 0.2s;
-  height: 42px;
-  display: flex;
-  align-items: center;
-}
-
-.filters-drawer .p-multiselect-label-container {
-  display: flex;
-  align-items: center;
-  padding-top: 0;
-  padding-bottom: 0;
-}
-
-.filters-drawer .p-dropdown:not(.p-disabled):hover,
-.filters-drawer .p-multiselect:not(.p-disabled):hover,
-.filters-drawer .p-dropdown.p-focus,
-.filters-drawer .p-multiselect.p-focus {
-  border-color: var(--main-color) !important;
-  box-shadow: 0 0 0 1px rgba(var(--main-color-rgb), 0.2) !important;
-}
-
-.filters-drawer .p-dropdown-label,
-.filters-drawer .p-multiselect-label {
-  color: var(--text-primary);
-}
-
-.p-dropdown-label {
-  background-color: #00000000;
-}
-
-.custom-selectbutton .btn {
-  background-color: var(--bg-input);
-  border: 1px solid var(--border-color);
-  color: var(--text-secondary);
-  transition: all 0.2s;
-}
-
-.custom-selectbutton .btn:hover {
-  background-color: var(--bg-hover);
-}
-
-.p-selectbutton .btn.p-highlight::before {
-  background-color: #00000000 !important;
-}
-
-.p-multiselect-panel .p-multiselect-header {
-  background-color: var(--bg-panel) !important;
-  border-bottom: 1px solid var(--border-color) !important;
-}
-
-.custom-selectbutton .btn.p-highlight {
-  background-color: var(--main-solid) !important;
-  border-color: var(--main-solid) !important;
-  color: var(--on-main) !important;
-  font-weight: 700;
-}
-
-.custom-panel.p-dropdown-panel,
-.custom-panel.p-multiselect-panel {
-  background-color: var(--bg-panel) !important;
-  border: 1px solid var(--border-color) !important;
-}
-
-.custom-panel .p-dropdown-item,
-.custom-panel .p-multiselect-item {
-  color: var(--text-primary) !important;
-}
-
-.custom-panel .p-dropdown-item:hover,
-.custom-panel .p-multiselect-item:hover {
-  background-color: var(--bg-hover) !important;
-}
-
-.custom-panel .p-dropdown-item.p-highlight,
-.custom-panel .p-multiselect-item.p-highlight {
-  color: var(--main-color) !important;
-  background-color: rgba(var(--main-color-rgb), 0.1) !important;
-}
-
 /* Lista do "Ordenar" ao lado da busca */
-.sort-quick-panel.p-dropdown-panel {
+.sort-quick-panel {
   min-width: 13rem;
-  margin-top: 0.35rem;
-  border-radius: 12px;
-  overflow: hidden;
-  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.3);
-}
-
-.sort-quick-panel .p-dropdown-items {
-  padding: 0.35rem;
-}
-
-.sort-quick-panel .p-dropdown-item {
-  border-radius: 8px;
-  padding: 0.6rem 0.85rem;
-  font-size: var(--fs-sm);
 }
 
 /* Tela de toque: área de toque de 44px sem mudar o desenho de 34px */
diff --git a/frontend/src/components/NavigationMenu.vue b/frontend/src/components/NavigationMenu.vue
index 643a986bf316b9d6a5bdb9ddb15a2c06b574335d..892d625cb4620161ecc4213f3d0b663d3822f78f 100644
--- a/frontend/src/components/NavigationMenu.vue
+++ b/frontend/src/components/NavigationMenu.vue
@@ -508,8 +508,8 @@ button.nav-item {
     height: 60px;
   }
 
-  .menu-btn {
-    color: var(--text-primary) !important;
+  .menu-btn.btn {
+    --btn-fg: var(--text-primary);
     padding: 0;
     width: 40px;
   }
diff --git a/frontend/src/components/form/DateField.vue b/frontend/src/components/form/DateField.vue
index 672d3609ac45ce1cf87144242a1c80548736c912..18b789a7cddfbd9cd7720cb16e3cfdc4a940fdf1 100644
--- a/frontend/src/components/form/DateField.vue
+++ b/frontend/src/components/form/DateField.vue
@@ -5,7 +5,6 @@
   >
     <div class="field-box">
       <input
-        v-if="native"
         :id="id"
         type="date"
         class="field-control native"
@@ -17,22 +16,6 @@
         @focus="focused = true"
         @blur="focused = false"
       />
-      <Calendar
-        v-else
-        :inputId="id"
-        :modelValue="modelValue"
-        :maxDate="maxDate || undefined"
-        dateFormat="dd/mm/yy"
-        class="field-calendar"
-        appendTo="self"
-        :showIcon="false"
-        showButtonBar
-        :aria-invalid="error ? 'true' : undefined"
-        :aria-describedby="describedBy"
-        @update:modelValue="value => emit('update:modelValue', value || null)"
-        @focus="focused = true"
-        @blur="focused = false"
-      />
       <label
         :for="id"
         class="field-label"
@@ -57,14 +40,13 @@
 </template>
 
 <script setup>
-import { computed, ref, onMounted, onBeforeUnmount } from 'vue'
-import Calendar from 'primevue/calendar'
+import { computed, ref } from 'vue'
 import { toApiDate } from '../../utils/dates.js'
 
 /**
- * Data com rótulo flutuante. Até 640px usa o seletor nativo do celular
- * (<input type="date">), mais fácil de usar com o polegar que o calendário
- * flutuante do PrimeVue.
+ * Data com rótulo flutuante, no seletor nativo do navegador
+ * (<input type="date">): calendário do sistema no celular e digitação
+ * dia/mês/ano no computador.
  */
 const props = defineProps({
   modelValue: { type: Date, default: null },
@@ -77,11 +59,6 @@ const props = defineProps({
 const emit = defineEmits(['update:modelValue'])
 const focused = ref(false)
 
-const query = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(max-width: 640px)') : null
-const native = ref(Boolean(query?.matches))
-const onChange = event => { native.value = event.matches }
-onMounted(() => query?.addEventListener?.('change', onChange))
-onBeforeUnmount(() => query?.removeEventListener?.('change', onChange))
 
 const describedBy = computed(() => (props.error ? `${props.id}-error` : undefined))
 
@@ -118,8 +95,7 @@ function onNativeInput(event) {
   border-color: var(--red);
 }
 
-.field-control,
-.field-calendar :deep(.p-inputtext) {
+.field-control {
   width: 100%;
   min-height: 3.25rem;
   background: transparent;
@@ -133,15 +109,7 @@ function onNativeInput(event) {
   border-radius: 10px;
 }
 
-.field-calendar {
-  display: block;
-  width: 100%;
-}
 
-.field-calendar :deep(.p-inputtext:enabled:focus) {
-  box-shadow: none;
-  border: none;
-}
 
 /* Vazio e sem foco, o texto do seletor nativo (dd/mm/aaaa) fica escondido atrás do rótulo */
 .date-field:not(.floated) .native {
diff --git a/frontend/src/components/ui/AppMultiSelect.vue b/frontend/src/components/ui/AppMultiSelect.vue
new file mode 100644
index 0000000000000000000000000000000000000000..5d8174e60869f5d76fb8ccb8217dba6db7c1dd9e
--- /dev/null
+++ b/frontend/src/components/ui/AppMultiSelect.vue
@@ -0,0 +1,329 @@
+<template>
+  <div
+    class="app-select app-multiselect"
+    :class="{ open: isOpen }"
+  >
+    <button
+      :id="inputId"
+      ref="triggerEl"
+      type="button"
+      class="app-select-trigger"
+      role="combobox"
+      aria-haspopup="listbox"
+      :aria-expanded="isOpen ? 'true' : 'false'"
+      :aria-controls="listId"
+      :aria-label="ariaLabel || undefined"
+      :popovertarget="panelId"
+      @keydown="onTriggerKeydown"
+    >
+      <span class="app-select-value">
+        <span :class="{ placeholder: !modelValue.length }">{{ summary }}</span>
+      </span>
+      <span
+        v-if="modelValue.length"
+        class="count-badge"
+        aria-hidden="true"
+      >{{ modelValue.length }}</span>
+      <i
+        class="pi pi-chevron-down app-select-chevron"
+        aria-hidden="true"
+      ></i>
+    </button>
+
+    <div
+      :id="panelId"
+      ref="panelEl"
+      class="app-select-panel app-multiselect-panel"
+      popover="auto"
+      @toggle="onToggle"
+      @keydown="onPanelKeydown"
+    >
+      <div
+        v-if="filter"
+        class="ms-search"
+      >
+        <i
+          class="pi pi-search"
+          aria-hidden="true"
+        ></i>
+        <input
+          ref="searchEl"
+          v-model="query"
+          type="search"
+          :placeholder="t('common.search')"
+          :aria-label="t('common.search')"
+          :aria-controls="listId"
+          autocomplete="off"
+        />
+      </div>
+
+      <div
+        :id="listId"
+        class="ms-list"
+        role="listbox"
+        aria-multiselectable="true"
+        :aria-label="ariaLabel || undefined"
+      >
+        <button
+          v-for="option in visibleOptions"
+          :key="valueOf(option)"
+          type="button"
+          role="option"
+          class="app-select-option ms-option"
+          :aria-selected="isSelected(option) ? 'true' : 'false'"
+          tabindex="-1"
+          @click="toggleOption(option)"
+        >
+          <span
+            class="ms-check"
+            :class="{ on: isSelected(option) }"
+            aria-hidden="true"
+          ><i class="pi pi-check"></i></span>
+          <span class="ms-label">{{ labelOf(option) }}</span>
+        </button>
+        <p
+          v-if="!visibleOptions.length"
+          class="ms-empty"
+        >{{ t('common.noResults') }}</p>
+        <p
+          v-else-if="hiddenCount > 0"
+          class="ms-empty"
+        >{{ t('common.typeToSeeMore', { n: hiddenCount }) }}</p>
+      </div>
+
+      <div
+        v-if="modelValue.length"
+        class="ms-footer"
+      >
+        <button
+          type="button"
+          class="ms-clear"
+          @click="emit('update:modelValue', [])"
+        >{{ t('common.clearSelection') }}</button>
+      </div>
+    </div>
+  </div>
+</template>
+
+<script setup>
+import { computed, nextTick, ref } from 'vue'
+import { useI18n } from 'vue-i18n'
+import { useFloatingPanel } from '../../composables/useFloatingPanel.js'
+
+/**
+ * Escolha de vários itens com busca (no lugar do MultiSelect do PrimeVue).
+ * Listas grandes (milhares de autores) mostram só os primeiros resultados;
+ * os já marcados vêm sempre no topo.
+ */
+const props = defineProps({
+  modelValue: { type: Array, default: () => [] },
+  options: { type: Array, default: () => [] },
+  optionLabel: { type: String, default: 'label' },
+  optionValue: { type: String, default: 'value' },
+  placeholder: { type: String, default: '' },
+  // "{n} selecionados" quando passa de maxLabels
+  selectedLabel: { type: String, default: '' },
+  maxLabels: { type: Number, default: 2 },
+  filter: { type: Boolean, default: false },
+  inputId: { type: String, default: undefined },
+  ariaLabel: { type: String, default: '' }
+})
+
+const emit = defineEmits(['update:modelValue'])
+const { t, locale } = useI18n()
+const uid = Math.random().toString(36).slice(2, 9)
+const panelId = `app-ms-panel-${uid}`
+const listId = `app-ms-list-${uid}`
+const SHOWN = 120
+
+const query = ref('')
+const searchEl = ref(null)
+
+const { triggerEl, panelEl, isOpen, open, onToggle } = useFloatingPanel({
+  onOpen: async () => {
+    await nextTick()
+    if (props.filter) searchEl.value?.focus()
+    else panelEl.value?.querySelector('.ms-option')?.focus()
+  },
+  onClose: () => {
+    query.value = ''
+    if (panelEl.value?.contains(document.activeElement) || document.activeElement === document.body) triggerEl.value?.focus()
+  }
+})
+
+const valueOf = option => (option && typeof option === 'object' ? option[props.optionValue] : option)
+const labelOf = option => (option && typeof option === 'object' ? option[props.optionLabel] : String(option))
+const selectedSet = computed(() => new Set(props.modelValue))
+const isSelected = option => selectedSet.value.has(valueOf(option))
+
+const normalize = text => String(text).toLocaleLowerCase(locale.value).normalize('NFD').replace(/[̀-ͯ]/g, '')
+
+const matches = computed(() => {
+  const term = normalize(query.value.trim())
+  const list = term ? props.options.filter(option => normalize(labelOf(option)).includes(term)) : props.options
+  const chosen = list.filter(isSelected)
+  const rest = list.filter(option => !isSelected(option))
+  return [...chosen, ...rest]
+})
+
+const visibleOptions = computed(() => matches.value.slice(0, SHOWN))
+const hiddenCount = computed(() => Math.max(0, matches.value.length - SHOWN))
+
+const summary = computed(() => {
+  const count = props.modelValue.length
+  if (!count) return props.placeholder
+  if (count > props.maxLabels) return props.selectedLabel.replace('{0}', count)
+  return props.modelValue.join(', ')
+})
+
+function toggleOption(option) {
+  const value = valueOf(option)
+  const next = isSelected(option) ? props.modelValue.filter(item => item !== value) : [...props.modelValue, value]
+  emit('update:modelValue', next)
+}
+
+function onTriggerKeydown(event) {
+  if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
+    event.preventDefault()
+    open()
+  }
+}
+
+function onPanelKeydown(event) {
+  const list = [...(panelEl.value?.querySelectorAll('.ms-option') || [])]
+  const index = list.indexOf(document.activeElement)
+  if (event.key === 'ArrowDown') {
+    list[Math.min(index + 1, list.length - 1)]?.focus()
+  } else if (event.key === 'ArrowUp') {
+    if (index <= 0 && props.filter) searchEl.value?.focus()
+    else list[Math.max(index - 1, 0)]?.focus()
+  } else return
+  event.preventDefault()
+}
+</script>
+
+<style>
+.app-multiselect .count-badge {
+  flex-shrink: 0;
+  min-width: 1.4rem;
+  padding: 0.05rem 0.4rem;
+  border-radius: 999px;
+  background: var(--main-solid);
+  color: var(--on-main);
+  font-size: var(--fs-xs);
+  font-weight: 700;
+  text-align: center;
+}
+
+.app-multiselect-panel {
+  display: flex;
+  flex-direction: column;
+  padding: 0;
+  overflow: hidden;
+  width: min(22rem, calc(100vw - 2rem));
+}
+
+.app-multiselect-panel:not(:popover-open) {
+  display: none;
+}
+
+.ms-search {
+  position: relative;
+  padding: 0.5rem;
+  border-bottom: 1px solid var(--border-color);
+}
+
+.ms-search .pi {
+  position: absolute;
+  left: 1.25rem;
+  top: 50%;
+  transform: translateY(-50%);
+  color: var(--text-muted);
+  font-size: var(--fs-sm);
+}
+
+.ms-search input {
+  width: 100%;
+  height: 2.5rem;
+  padding: 0 0.75rem 0 2.2rem;
+  border: 1px solid transparent;
+  border-radius: 8px;
+  background: var(--bg-input);
+  color: var(--text-primary);
+  font: inherit;
+  font-size: var(--fs-sm);
+  outline: none;
+}
+
+.ms-search input:focus {
+  border-color: var(--main-color);
+}
+
+.ms-list {
+  flex: 1;
+  min-height: 0;
+  overflow-y: auto;
+  padding: 0.35rem;
+}
+
+.app-select-option.ms-option {
+  justify-content: flex-start;
+}
+
+.ms-label {
+  min-width: 0;
+  overflow: hidden;
+  text-overflow: ellipsis;
+  white-space: nowrap;
+}
+
+.ms-check {
+  display: inline-flex;
+  align-items: center;
+  justify-content: center;
+  flex-shrink: 0;
+  width: 1.15rem;
+  height: 1.15rem;
+  border: 2px solid var(--text-muted);
+  border-radius: 5px;
+  color: transparent;
+}
+
+.ms-check .pi {
+  font-size: 0.65rem;
+}
+
+.ms-check.on {
+  border-color: var(--main-solid);
+  background: var(--main-solid);
+  color: var(--on-main);
+}
+
+.ms-empty {
+  margin: 0;
+  padding: 0.75rem 0.85rem;
+  color: var(--text-muted);
+  font-size: var(--fs-xs);
+}
+
+.ms-footer {
+  padding: 0.4rem 0.5rem;
+  border-top: 1px solid var(--border-color);
+}
+
+.ms-clear {
+  border: none;
+  background: transparent;
+  color: var(--main-color);
+  font: inherit;
+  font-size: var(--fs-sm);
+  font-weight: 600;
+  padding: 0.4rem 0.5rem;
+  border-radius: 6px;
+  cursor: pointer;
+}
+
+.ms-clear:hover {
+  background: rgba(var(--main-color-rgb), 0.1);
+}
+</style>
diff --git a/frontend/src/components/ui/AppSelect.vue b/frontend/src/components/ui/AppSelect.vue
new file mode 100644
index 0000000000000000000000000000000000000000..430b545980200762d60bc660bd75520b25dd3ff8
--- /dev/null
+++ b/frontend/src/components/ui/AppSelect.vue
@@ -0,0 +1,271 @@
+<template>
+  <div
+    class="app-select"
+    :class="{ open: isOpen, disabled }"
+  >
+    <button
+      :id="inputId"
+      ref="triggerEl"
+      type="button"
+      class="app-select-trigger"
+      role="combobox"
+      aria-haspopup="listbox"
+      :aria-expanded="isOpen ? 'true' : 'false'"
+      :aria-controls="listId"
+      :aria-label="ariaLabel || undefined"
+      :aria-labelledby="ariaLabelledby || undefined"
+      :disabled="disabled"
+      :popovertarget="listId"
+      @keydown="onTriggerKeydown"
+    >
+      <span class="app-select-value">
+        <slot
+          name="value"
+          :option="selected"
+          :label="selectedLabel"
+        >
+          <span :class="{ placeholder: !selected }">{{ selected ? selectedLabel : placeholder }}</span>
+        </slot>
+      </span>
+      <i
+        class="pi pi-chevron-down app-select-chevron"
+        aria-hidden="true"
+      ></i>
+    </button>
+
+    <div
+      :id="listId"
+      ref="panelEl"
+      class="app-select-panel"
+      :class="panelClass"
+      popover="auto"
+      role="listbox"
+      :aria-label="ariaLabel || undefined"
+      :aria-labelledby="ariaLabelledby || undefined"
+      @toggle="onToggle"
+      @keydown="onListKeydown"
+    >
+      <button
+        v-for="(option, index) in options"
+        :key="valueOf(option)"
+        type="button"
+        role="option"
+        class="app-select-option"
+        :class="{ selected: valueOf(option) === modelValue }"
+        :aria-selected="valueOf(option) === modelValue ? 'true' : 'false'"
+        :data-index="index"
+        tabindex="-1"
+        @click="choose(option)"
+      >
+        <span>{{ labelOf(option) }}</span>
+        <i
+          v-if="valueOf(option) === modelValue"
+          class="pi pi-check"
+          aria-hidden="true"
+        ></i>
+      </button>
+    </div>
+  </div>
+</template>
+
+<script setup>
+import { computed, nextTick } from 'vue'
+import { useFloatingPanel } from '../../composables/useFloatingPanel.js'
+
+/**
+ * Lista de escolha única (no lugar do Dropdown do PrimeVue). Botão com
+ * role="combobox" e lista num popover: setas, Home/End, Enter e Esc.
+ *
+ *   <AppSelect v-model="x" :options="[{ label, value }]" option-label="label" option-value="value" />
+ */
+const props = defineProps({
+  modelValue: { type: [String, Number, Boolean], default: null },
+  options: { type: Array, default: () => [] },
+  optionLabel: { type: String, default: 'label' },
+  optionValue: { type: String, default: 'value' },
+  placeholder: { type: String, default: '' },
+  inputId: { type: String, default: undefined },
+  ariaLabel: { type: String, default: '' },
+  ariaLabelledby: { type: String, default: '' },
+  disabled: { type: Boolean, default: false },
+  panelClass: { type: [String, Array, Object], default: '' }
+})
+
+const emit = defineEmits(['update:modelValue'])
+const listId = `app-select-${Math.random().toString(36).slice(2, 9)}`
+
+const { triggerEl, panelEl, isOpen, open, close, onToggle } = useFloatingPanel({
+  onOpen: () => focusOption(Math.max(0, selectedIndex.value)),
+  onClose: () => {
+    if (panelEl.value?.contains(document.activeElement) || document.activeElement === document.body) triggerEl.value?.focus()
+  }
+})
+
+const valueOf = option => (option && typeof option === 'object' ? option[props.optionValue] : option)
+const labelOf = option => (option && typeof option === 'object' ? option[props.optionLabel] : String(option))
+
+const selectedIndex = computed(() => props.options.findIndex(option => valueOf(option) === props.modelValue))
+const selected = computed(() => props.options[selectedIndex.value] ?? null)
+const selectedLabel = computed(() => (selected.value ? labelOf(selected.value) : ''))
+
+function optionEls() {
+  return [...(panelEl.value?.querySelectorAll('.app-select-option') || [])]
+}
+
+async function focusOption(index) {
+  await nextTick()
+  const list = optionEls()
+  const el = list[Math.min(Math.max(index, 0), list.length - 1)]
+  el?.focus({ preventScroll: true })
+  el?.scrollIntoView({ block: 'nearest' })
+}
+
+function choose(option) {
+  emit('update:modelValue', valueOf(option))
+  close()
+}
+
+function onTriggerKeydown(event) {
+  if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
+    event.preventDefault()
+    open()
+  }
+}
+
+function onListKeydown(event) {
+  const list = optionEls()
+  const index = list.indexOf(document.activeElement)
+  if (event.key === 'ArrowDown') focusOption(index + 1)
+  else if (event.key === 'ArrowUp') focusOption(index - 1)
+  else if (event.key === 'Home') focusOption(0)
+  else if (event.key === 'End') focusOption(list.length - 1)
+  else if (event.key === 'Tab') {
+    close()
+    return
+  } else return
+  event.preventDefault()
+}
+</script>
+
+<style>
+.app-select {
+  position: relative;
+  display: inline-flex;
+  min-width: 0;
+}
+
+.app-select.w-full {
+  display: flex;
+  width: 100%;
+}
+
+.app-select-trigger {
+  display: inline-flex;
+  align-items: center;
+  justify-content: space-between;
+  gap: 0.6rem;
+  width: 100%;
+  min-height: 2.75rem;
+  padding: 0 0.85rem 0 1rem;
+  border: 1px solid var(--border-color);
+  border-radius: 10px;
+  background: var(--bg-input);
+  color: var(--text-primary);
+  font: inherit;
+  font-size: var(--fs-md);
+  text-align: left;
+  cursor: pointer;
+}
+
+.app-select-trigger:hover:not(:disabled) {
+  border-color: var(--border-hover);
+}
+
+.app-select-trigger:focus-visible,
+.app-select.open .app-select-trigger {
+  outline: none;
+  border-color: var(--main-color);
+  box-shadow: 0 0 0 2px rgba(var(--main-color-rgb), 0.2);
+}
+
+.app-select-trigger:disabled {
+  opacity: 0.55;
+  cursor: not-allowed;
+}
+
+.app-select-value {
+  flex: 1;
+  min-width: 0;
+  overflow: hidden;
+  text-overflow: ellipsis;
+  white-space: nowrap;
+}
+
+.app-select-value .placeholder {
+  color: var(--text-muted);
+}
+
+.app-select-chevron {
+  flex-shrink: 0;
+  font-size: var(--fs-xs);
+  color: var(--text-secondary);
+  transition: transform 0.15s ease;
+}
+
+.app-select.open .app-select-chevron {
+  transform: rotate(180deg);
+}
+
+.app-select-panel {
+  position: fixed;
+  inset: auto;
+  margin: 0;
+  max-height: min(22rem, 60vh);
+  overflow-y: auto;
+  padding: 0.35rem;
+  border: 1px solid var(--border-color);
+  border-radius: 12px;
+  background: var(--bg-panel);
+  color: var(--text-primary);
+  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.3);
+}
+
+.app-select-option {
+  display: flex;
+  align-items: center;
+  justify-content: space-between;
+  gap: 0.75rem;
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
+.app-select-option:hover,
+.app-select-option:focus-visible {
+  background: var(--bg-hover);
+  outline: none;
+}
+
+.app-select-option.selected {
+  color: var(--main-color);
+  background: rgba(var(--main-color-rgb), 0.1);
+  font-weight: 600;
+}
+
+.app-select-option .pi {
+  font-size: var(--fs-xs);
+}
+
+@media (pointer: coarse) {
+  .app-select-option {
+    min-height: 2.75rem;
+  }
+}
+</style>
diff --git a/frontend/src/composables/useFloatingPanel.js b/frontend/src/composables/useFloatingPanel.js
new file mode 100644
index 0000000000000000000000000000000000000000..f02eb3dedec8824bff2e6123a5f273d35b02b0f3
--- /dev/null
+++ b/frontend/src/composables/useFloatingPanel.js
@@ -0,0 +1,93 @@
+import { nextTick, onBeforeUnmount, ref } from 'vue'
+
+/**
+ * Painel flutuante preso a um gatilho (listas do AppSelect e do
+ * AppMultiSelect). Usa a Popover API: o painel vai para a camada superior,
+ * então não é cortado por overflow nem fica atrás de um diálogo, e o
+ * navegador fecha com Esc e com clique fora.
+ *
+ *   const { triggerEl, panelEl, isOpen, open, close, onToggle } = useFloatingPanel({ matchWidth: true })
+ *   <button ref="triggerEl" :popovertarget="id">…</button>
+ *   <div ref="panelEl" :id="id" popover="auto" @toggle="onToggle">…</div>
+ *
+ * O gatilho com popovertarget deixa o navegador abrir e fechar no clique
+ * (sem o "fecha e abre de novo" de quando o clique fora cai no gatilho).
+ */
+export function useFloatingPanel({ matchWidth = true, gap = 6, onOpen, onClose } = {}) {
+  const triggerEl = ref(null)
+  const panelEl = ref(null)
+  const isOpen = ref(false)
+
+  function place() {
+    const trigger = triggerEl.value
+    const panel = panelEl.value
+    if (!trigger || !panel) return
+    const rect = trigger.getBoundingClientRect()
+    if (matchWidth) panel.style.minWidth = `${rect.width}px`
+    const panelRect = panel.getBoundingClientRect()
+    const spaceBelow = window.innerHeight - rect.bottom
+    const openUp = spaceBelow < panelRect.height + gap + 8 && rect.top > spaceBelow
+    const left = Math.max(8, Math.min(rect.left, window.innerWidth - panelRect.width - 8))
+    panel.style.left = `${left}px`
+    // Abrindo para cima, prende pela base: se a lista encolher (busca), continua colada no gatilho
+    if (openUp) {
+      panel.style.top = 'auto'
+      panel.style.bottom = `${window.innerHeight - rect.top + gap}px`
+    } else {
+      panel.style.bottom = 'auto'
+      panel.style.top = `${rect.bottom + gap}px`
+    }
+  }
+
+  function onScrollOrResize(event) {
+    // Rolagem dentro do próprio painel não fecha
+    if (event?.type === 'scroll' && panelEl.value?.contains(event.target)) return
+    close()
+  }
+
+  function open() {
+    const panel = panelEl.value
+    if (!panel || panel.matches(':popover-open')) return
+    try {
+      panel.showPopover()
+    } catch {
+      // navegador sem Popover API
+    }
+  }
+
+  function close() {
+    const panel = panelEl.value
+    if (panel?.matches(':popover-open')) panel.hidePopover()
+  }
+
+  function toggle() {
+    if (isOpen.value) close()
+    else open()
+  }
+
+  // Ligar no @toggle do painel: vale para abrir/fechar por clique, teclado,
+  // Esc ou clique fora.
+  async function onToggle(event) {
+    if (event.newState === 'open') {
+      isOpen.value = true
+      place()
+      window.addEventListener('resize', onScrollOrResize)
+      window.addEventListener('scroll', onScrollOrResize, true)
+      await nextTick()
+      place()
+      onOpen?.()
+      return
+    }
+    isOpen.value = false
+    window.removeEventListener('resize', onScrollOrResize)
+    window.removeEventListener('scroll', onScrollOrResize, true)
+    onClose?.()
+  }
+
+  onBeforeUnmount(() => {
+    window.removeEventListener('resize', onScrollOrResize)
+    window.removeEventListener('scroll', onScrollOrResize, true)
+  })
+
+  return { triggerEl, panelEl, isOpen, open, close, toggle, place, onToggle }
+}
diff --git a/frontend/src/locales/en.json b/frontend/src/locales/en.json
index f6d28e6a72dfe703c9581cef477348e3febf9e57..eb8732daba24fd974fb4c996d5966422640ee59f 100644
--- a/frontend/src/locales/en.json
+++ b/frontend/src/locales/en.json
@@ -40,7 +40,10 @@
     "skipToContent": "Skip to content",
     "removeItem": "Remove {name}",
     "decrease": "Decrease",
-    "increase": "Increase"
+    "increase": "Increase",
+    "noResults": "Nothing found.",
+    "typeToSeeMore": "{n} more — type to filter.",
+    "clearSelection": "Clear selection"
   },
   "home": {
     "morning": "Good morning, {name}",
diff --git a/frontend/src/locales/pt.json b/frontend/src/locales/pt.json
index 63bb4f3b3fb2cd87c2ce05858c53e66482b763c6..ee1daca2aa69d9fc8af770a433e3686acac45a37 100644
--- a/frontend/src/locales/pt.json
+++ b/frontend/src/locales/pt.json
@@ -77,7 +77,10 @@
     "skipToContent": "Pular para o conteúdo",
     "removeItem": "Tirar {name}",
     "decrease": "Diminuir",
-    "increase": "Aumentar"
+    "increase": "Aumentar",
+    "noResults": "Nada encontrado.",
+    "typeToSeeMore": "Mais {n} — digite para filtrar.",
+    "clearSelection": "Limpar seleção"
   },
   "book": {
     "new_title": "Novo Livro",
diff --git a/frontend/src/main.js b/frontend/src/main.js
index b7be1e84ec25474b7880a62ff7d5cbd3f03c9438..3c2307f6d5a3f1665540eb92cd35b0fd2576b0ca 100644
--- a/frontend/src/main.js
+++ b/frontend/src/main.js
@@ -2,15 +2,10 @@ import { createApp } from 'vue'
 import i18n from './i18n'
 import App from './App.vue'
 import router from './router'
-import PrimeVue from 'primevue/config'
 import tooltip from './directives/tooltip.js'
 
 import '@fontsource-variable/inter'
 import '@fontsource-variable/source-serif-4'
-// Os dois temas convivem: o plugin vite/primevueTheme.js prefixa cada um com
-// [data-theme] e troca o azul do Aura pela cor de destaque do app.
-import 'primevue/resources/themes/aura-dark-blue/theme.css'
-import 'primevue/resources/themes/aura-light-blue/theme.css'
 import 'primeicons/primeicons.css'
 import './assets/main.css'
 
@@ -24,7 +19,6 @@ const app = createApp(App)
 
 app.use(router)
 app.use(i18n)
-app.use(PrimeVue, { ripple: true })
 app.directive('tooltip', tooltip)
 
 app.mount('#app')
diff --git a/frontend/src/router/index.js b/frontend/src/router/index.js
index 7a3f4f536eb30293ea9fc5c7ff66d63b443f58b2..aef3159ea1247e6a12661c5434d0301e2d8be974 100644
--- a/frontend/src/router/index.js
+++ b/frontend/src/router/index.js
@@ -10,8 +10,8 @@ import { setRouteTitle } from '../services/pageTitle.js'
  *   public       — acessível com ou sem sessão (mostra o menu se houver sessão)
  *   title        — chave de pageTitle.* para o título da aba (services/pageTitle.js)
  *
- * Views carregadas sob demanda: o chart.js do Dashboard e o PrimeVue pesado
- * das telas internas não entram no bundle do login.
+ * Views carregadas sob demanda: o chart.js do Dashboard e as telas internas
+ * não entram no bundle do login.
  */
 const router = createRouter({
   history: createWebHistory(import.meta.env.BASE_URL),
diff --git a/frontend/src/views/Dashboard.vue b/frontend/src/views/Dashboard.vue
index 34150b7a088f4ae7ed10c20ac328c0dcac041064..4030f6de135a0aa3a909f00d6b20bbef579d25e7 100644
--- a/frontend/src/views/Dashboard.vue
+++ b/frontend/src/views/Dashboard.vue
@@ -10,12 +10,11 @@
           class="sr-only"
           for="dashboard-year"
         >{{ t('dashboard.yearLabel') }}</label>
-        <Dropdown
+        <AppSelect
           inputId="dashboard-year"
           :modelValue="year"
           :options="yearOptions"
           class="year-dropdown"
-          panelClass="custom-panel"
           @update:modelValue="changeYear"
         />
         <div class="date-display">{{ currentDate }}</div>
@@ -385,7 +384,7 @@ import { useToast } from '../services/toast.js'
 import ChartCanvas from '../components/ui/ChartCanvas.vue'
 import AppSkeleton from '../components/ui/AppSkeleton.vue'
 import AppButton from '../components/ui/AppButton.vue'
-import Dropdown from 'primevue/dropdown'
+import AppSelect from '../components/ui/AppSelect.vue'
 import NumberField from '../components/ui/NumberField.vue'
 import api from '../services/api.js'
 import { useTheme, cssVar } from '../composables/useTheme.js'
@@ -1014,10 +1013,6 @@ a.author-row:focus-visible {
   flex-wrap: wrap;
 }
 
-.goal-input :deep(.p-inputnumber-input) {
-  width: 6rem;
-}
-
 .chart-hint {
   margin: -1rem 0 1rem;
   color: var(--text-secondary);
@@ -1058,7 +1053,7 @@ a.author-row:focus-visible {
   min-height: 0;
 }
 
-.chart-wrapper > :deep(.p-chart) {
+.chart-wrapper > .chart-canvas {
   position: relative;
   width: 100%;
   height: 100%;
@@ -1107,9 +1102,8 @@ a.author-row:hover {
 }
 
 .author-row .rank {
-  color: var(--author-color) !important;
+  color: var(--author-color);
   font-weight: bold;
-  color: var(--text-secondary);
   width: 20px;
 }
 
diff --git a/frontend/src/views/Library.vue b/frontend/src/views/Library.vue
index 1ae8db0d35568b6d97f35be203b52d2ec9270e69..8e07631958ea6ab448a5d9aaa4b0811bcf5e47bf 100644
--- a/frontend/src/views/Library.vue
+++ b/frontend/src/views/Library.vue
@@ -281,7 +281,7 @@ function afterBatch() {
 }
 
 function onKeydown(event) {
-  if (event.key === 'Escape' && selecting.value && !document.querySelector('.p-dialog-mask')) toggleSelecting()
+  if (event.key === 'Escape' && selecting.value && !document.querySelector('dialog[open]')) toggleSelecting()
 }
 
 // Grade ou lista: vem da URL (?view=list); sem ela, a última escolha neste navegador.
@@ -383,16 +383,8 @@ onUnmounted(() => {
   aspect-ratio: 2/3.5;
 }
 
-:deep(.p-skeleton) {
-  background-color: rgba(255, 255, 255, 0.05) !important;
-}
-
-:deep(.p-skeleton)::after {
-  background: linear-gradient(90deg, rgba(255, 255, 255, 0), rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0));
-}
-
 .cover-skeleton {
-  border-radius: 12px !important;
+  border-radius: 12px;
   flex: 1;
 }
 
diff --git a/frontend/vite.config.js b/frontend/vite.config.js
index 1f6aabf6d6eee4b0379557e1ab1a4309442da0e9..f89b84dd89a67071ff40fb13d2949e051efb22fd 100644
--- a/frontend/vite.config.js
+++ b/frontend/vite.config.js
@@ -1,7 +1,6 @@
 import { fileURLToPath, URL } from 'node:url'
 import { defineConfig, loadEnv } from 'vite'
 import vue from '@vitejs/plugin-vue'
-import primevueTheme from './vite/primevueTheme.js'
 import preloadIconFont from './vite/preloadIconFont.js'
 
 export default defineConfig(({ mode }) => {
@@ -10,7 +9,7 @@ export default defineConfig(({ mode }) => {
   const apiTarget = env.VITE_DEV_API_TARGET || 'http://localhost:3050'
 
   return {
-    plugins: [primevueTheme(), vue(), preloadIconFont()],
+    plugins: [vue(), preloadIconFont()],
     resolve: {
       alias: {
         '@': fileURLToPath(new URL('./src', import.meta.url))
diff --git a/frontend/vite/primevueTheme.js b/frontend/vite/primevueTheme.js
deleted file mode 100644
index ecaf3e82280d7b4d49fe8cb3c1db1120db3a4323..0000000000000000000000000000000000000000
--- a/frontend/vite/primevueTheme.js
+++ /dev/null
@@ -1,110 +0,0 @@
-import postcss from 'postcss'
-
-/**
- * Tema do PrimeVue ligado aos tokens do app.
- *
- * O PrimeVue 3 traz o tema Aura em arquivos prontos, com as cores escritas
- * direto em cada regra (o azul do tema aparece mais de 100 vezes). Este plugin
- * carrega o Aura claro e o escuro e, no build:
- *
- *   1. prefixa cada regra com :where([data-theme="dark"|"light"]) — os dois
- *      convivem no mesmo CSS e vale o tema escolhido no app (o :where não
- *      soma especificidade, então o CSS do app continua vencendo como antes);
- *   2. troca o azul do Aura pela cor de destaque do app (--main-color para
- *      texto e borda, --main-solid para fundo com texto branco);
- *   3. tira os @font-face (o app usa a própria Inter).
- *
- * Uso: import 'primevue/resources/themes/aura-dark-blue/theme.css' e
- * '.../aura-light-blue/theme.css' no main.js.
- */
-
-const THEME_FILE = /primevue\/resources\/themes\/aura-(dark|light)-blue\/theme\.css$/
-
-const solid = 'var(--main-solid)'
-const accent = 'var(--main-color)'
-const onAccent = 'var(--on-main)'
-const darker = pct => `color-mix(in srgb, var(--main-solid) ${pct}%, black)`
-const tint = alpha => `rgba(var(--main-color-rgb), ${alpha})`
-
-// cor do Aura → [valor quando é fundo, valor nos outros usos (texto, borda, sombra)]
-const PALETTE = {
-  dark: {
-    '#60a5fa': [solid, accent],
-    '#3b82f6': [solid, accent],
-    '#93c5fd': [darker(88), accent],
-    '#bfdbfe': [darker(78), accent],
-    '#020617': [onAccent, onAccent]
-  },
-  light: {
-    '#3b82f6': [solid, accent],
-    '#2563eb': [darker(88), accent],
-    '#1d4ed8': [darker(78), accent],
-    '#eff6ff': [tint(0.1), tint(0.5)],
-    '#dbeafe': [tint(0.16), tint(0.5)],
-    '#bfdbfe': [tint(0.24), tint(0.5)],
-    // cinzas "slate" do Aura claro → "zinc", os mesmos cinzas do app
-    '#f8fafc': ['#fafafa', '#fafafa'],
-    '#f1f5f9': ['#f4f4f5', '#f4f4f5'],
-    '#e2e8f0': ['#e4e4e7', '#e4e4e7'],
-    '#cbd5e1': ['#d4d4d8', '#d4d4d8'],
-    '#94a3b8': ['#a1a1aa', '#a1a1aa'],
-    '#64748b': ['#71717a', 'var(--text-secondary)'],
-    '#475569': ['#52525b', '#52525b'],
-    '#334155': ['#3f3f46', 'var(--text-primary)'],
-    '#1e293b': ['#27272a', '#27272a'],
-    '#0f172a': ['#18181b', '#18181b']
-  }
-}
-const BLUE_RGBA = /rgba\(\s*(?:96,\s*165,\s*250|59,\s*130,\s*246)\s*,\s*([\d.]+)\s*\)/gi
-const HEX = /#[0-9a-f]{6}\b/gi
-
-function isBackground(prop) {
-  return prop === 'background' || prop === 'background-color' || /^--.*(bg|background)/.test(prop)
-}
-
-function recolor(value, prop, palette) {
-  const bg = isBackground(prop)
-  return value
-    .replace(BLUE_RGBA, (_, alpha) => tint(alpha))
-    .replace(HEX, hex => {
-      const entry = palette[hex.toLowerCase()]
-      return entry ? entry[bg ? 0 : 1] : hex
-    })
-}
-
-function scopeSelector(selector, scope) {
-  if (selector.startsWith(':root')) return `:where(:root${scope})${selector.slice(5)}`
-  return `:where(${scope}) ${selector}`
-}
-
-export function transformTheme(css, mode) {
-  const scope = `[data-theme="${mode}"]`
-  const palette = PALETTE[mode]
-  const root = postcss.parse(css)
-
-  root.walkAtRules('font-face', rule => rule.remove())
-  root.walkRules(rule => {
-    if (rule.parent?.type === 'atrule' && /keyframes$/i.test(rule.parent.name)) return
-    rule.selectors = rule.selectors.map(sel => scopeSelector(sel, scope))
-  })
-  root.walkDecls(decl => {
-    if (decl.prop === 'font-family' || decl.prop === '--font-family') {
-      decl.remove()
-      return
-    }
-    decl.value = recolor(decl.value, decl.prop, palette)
-  })
-  return root.toString()
-}
-
-export default function primevueTheme() {
-  return {
-    name: 'librishelf:primevue-theme',
-    enforce: 'pre',
-    transform(code, id) {
-      const match = id.split('?')[0].match(THEME_FILE)
-      if (!match) return null
-      return { code: transformTheme(code, match[1]), map: null }
-    }
-  }
-}
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

echo "→ Instalando dependências novas do frontend…"
(cd frontend && npm install --no-audit --no-fund)
[ -d backend/node_modules ] || (cd backend && npm ci --no-audit --no-fund)

echo "→ Testes unitários do backend…"
(cd backend && npm run test:unit --silent)

echo "→ Build do frontend…"
(cd frontend && npm run build)

echo
echo "✓ Tudo certo. Mensagem de commit sugerida:"
echo "────────────────────────────────────────────"
cat <<'__MSG__'
refactor: remove o PrimeVue (3/3)

- AppSelect e AppMultiSelect (Popover API, teclado, busca com acento
  ou sem) no lugar de Dropdown e MultiSelect
- DateField sempre com o seletor de data nativo; AuthorsInput com
  etiquetas próprias no lugar do Chips
- sai o pacote primevue, os temas Aura, o plugin vite/primevueTheme.js
  e o postcss que só ele usava
- CSS de override do PrimeVue removido; !important só no
  prefers-reduced-motion
- CSS do app: 689 kB → 34 kB (gzip 67 kB → 8 kB); JS inicial
  161 kB → 105 kB
__MSG__
echo "────────────────────────────────────────────"