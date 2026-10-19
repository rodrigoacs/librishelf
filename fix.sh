#!/usr/bin/env bash
# Librishelf — pacote 4.1: lista do Ordenar com o tema
#
# Rode na raiz do repositório Librishelf, na branch fix/audit-2026-08, com
# o pacote anterior já commitado:   bash pacote-4.1-ordenar-com-tema.sh
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
  frontend/src/components/LibraryHeader.vue
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
diff --git a/frontend/src/components/LibraryHeader.vue b/frontend/src/components/LibraryHeader.vue
index 6d907874fde5fd50e500d3bab3be2dc9dbb5d33d..ee9f899ae36484238102127ce76f6f7077799c55 100644
--- a/frontend/src/components/LibraryHeader.vue
+++ b/frontend/src/components/LibraryHeader.vue
@@ -46,38 +46,30 @@
           </button>
         </div>
 
-        <!-- Ordenar à mão, ao lado da busca (antes só dentro da gaveta de filtros) -->
-        <label class="sort-quick">
-          <i
-            class="pi pi-sort-alt sort-quick-icon"
-            aria-hidden="true"
-          ></i>
-          <span
-            class="sort-quick-prefix"
-            aria-hidden="true"
-          >{{ t('library.sort_short') }}</span>
-          <span
-            class="sort-quick-value"
-            aria-hidden="true"
-          >{{ currentSortLabel }}</span>
-          <!-- O select transparente cobre o botão todo: clique em qualquer ponto abre a lista do sistema -->
-          <select
-            class="sort-quick-select"
-            :value="filters.sortField"
-            :aria-label="t('library.sort_by')"
-            @change="emitFilter('sortField', $event.target.value)"
-          >
-            <option
-              v-for="option in sortOptions"
-              :key="option.value"
-              :value="option.value"
-            >{{ option.label }}</option>
-          </select>
-          <i
-            class="pi pi-chevron-down sort-quick-chevron"
-            aria-hidden="true"
-          ></i>
-        </label>
+        <!-- Ordenar à mão, ao lado da busca (antes só dentro da gaveta de filtros).
+             Dropdown do PrimeVue, e não <select>: a lista nativa não segue o tema. -->
+        <Dropdown
+          :modelValue="filters.sortField"
+          :options="sortOptions"
+          optionLabel="label"
+          optionValue="value"
+          :aria-label="t('library.sort_by')"
+          class="sort-quick"
+          panelClass="custom-panel sort-quick-panel"
+          scrollHeight="22rem"
+          @update:modelValue="value => emitFilter('sortField', value)"
+        >
+          <template #value>
+            <span class="sort-quick-content">
+              <i
+                class="pi pi-sort-alt sort-quick-icon"
+                aria-hidden="true"
+              ></i>
+              <span class="sort-quick-prefix">{{ t('library.sort_short') }}</span>
+              <span class="sort-quick-value">{{ currentSortLabel }}</span>
+            </span>
+          </template>
+        </Dropdown>
       </div>
 
       <div class="actions">
@@ -585,27 +577,48 @@ defineExpose({ reloadOptions: loadOptions })
   min-width: 0;
 }
 
-.sort-quick {
-  position: relative;
-  display: inline-flex;
-  align-items: center;
-  gap: 0.35rem;
+.sort-quick.p-dropdown {
   flex-shrink: 0;
   height: 2.75rem;
-  padding: 0 2.1rem 0 0.9rem;
+  align-items: center;
   border-radius: 999px;
   border: 1px solid var(--border-color);
   background: var(--bg-input);
-  color: var(--text-secondary);
-  font-size: var(--fs-sm);
-  cursor: pointer;
+  box-shadow: none;
+}
+
+.sort-quick.p-dropdown:not(.p-disabled):hover {
+  border-color: var(--border-hover);
 }
 
-.sort-quick:focus-within {
+.sort-quick.p-dropdown.p-focus {
   border-color: var(--main-color);
   box-shadow: 0 0 0 2px rgba(var(--main-color-rgb), 0.2);
 }
 
+.sort-quick :deep(.p-dropdown-label) {
+  display: flex;
+  align-items: center;
+  padding: 0 0.25rem 0 0.95rem;
+  background: transparent;
+  border: none;
+}
+
+.sort-quick :deep(.p-dropdown-trigger) {
+  width: 2.25rem;
+  background: transparent;
+  color: var(--text-secondary);
+}
+
+.sort-quick-content {
+  display: inline-flex;
+  align-items: center;
+  gap: 0.35rem;
+  min-width: 0;
+  font-size: var(--fs-sm);
+  color: var(--text-secondary);
+}
+
 .sort-quick-icon {
   display: none;
   font-size: var(--fs-sm);
@@ -620,27 +633,6 @@ defineExpose({ reloadOptions: loadOptions })
   max-width: 11rem;
 }
 
-.sort-quick-select {
-  position: absolute;
-  inset: 0;
-  width: 100%;
-  opacity: 0;
-  cursor: pointer;
-  font: inherit;
-}
-
-.sort-quick-select option {
-  background: var(--bg-panel);
-  color: var(--text-primary);
-}
-
-.sort-quick-chevron {
-  position: absolute;
-  right: 0.85rem;
-  font-size: var(--fs-xs);
-  pointer-events: none;
-}
-
 .search-input-wrapper {
   position: relative;
   display: flex;
@@ -883,9 +875,12 @@ defineExpose({ reloadOptions: loadOptions })
   }
 
   /* Celular: só o ícone e o valor, para a busca continuar larga */
-  .sort-quick {
+  .sort-quick.p-dropdown {
     height: 2.6rem;
-    padding: 0 1.9rem 0 0.75rem;
+  }
+
+  .sort-quick :deep(.p-dropdown-label) {
+    padding-left: 0.8rem;
   }
 
   .sort-quick-prefix {
@@ -1044,6 +1039,25 @@ defineExpose({ reloadOptions: loadOptions })
   background-color: rgba(var(--main-color-rgb), 0.1) !important;
 }
 
+/* Lista do "Ordenar" ao lado da busca */
+.sort-quick-panel.p-dropdown-panel {
+  min-width: 13rem;
+  margin-top: 0.35rem;
+  border-radius: 12px;
+  overflow: hidden;
+  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.3);
+}
+
+.sort-quick-panel .p-dropdown-items {
+  padding: 0.35rem;
+}
+
+.sort-quick-panel .p-dropdown-item {
+  border-radius: 8px;
+  padding: 0.6rem 0.85rem;
+  font-size: var(--fs-sm);
+}
+
 /* Tela de toque: área de toque de 44px sem mudar o desenho de 34px */
 @media (pointer: coarse) {
   .view-btn {
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
fix: lista do "Ordenar" com o tema do app

O <select> nativo abria a lista do sistema, sem tema (fundo branco,
fonte do Windows). Agora é um Dropdown do PrimeVue, com as cores do
tema claro/escuro e da cor de destaque, e mostra as 7 opções sem
rolagem interna.
__MSG__
echo "────────────────────────────────────────────"