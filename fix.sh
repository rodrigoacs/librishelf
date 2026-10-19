#!/usr/bin/env bash
# Librishelf — pacote 3 de 4: celular e acabamento
#
# Rode na raiz do repositório Librishelf, na branch fix/audit-2026-08, com
# o pacote anterior já commitado:   bash pacote-3-celular-e-acabamento.sh
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
  frontend/src/App.vue
  frontend/src/assets/main.css
  frontend/src/components/AuthLayout.vue
  frontend/src/components/BookItem.vue
  frontend/src/components/BookRow.vue
  frontend/src/components/EntityListView.vue
  frontend/src/components/LibraryHeader.vue
  frontend/src/components/NavigationMenu.vue
  frontend/src/locales/en.json
  frontend/src/locales/pt.json
  frontend/src/views/Community.vue
  frontend/src/views/Dashboard.vue
  frontend/src/views/Home.vue
  frontend/src/views/Library.vue
  frontend/src/views/Login.vue
  frontend/src/views/NotFound.vue
  frontend/src/views/Privacy.vue
  frontend/src/views/PublicLibrary.vue
  frontend/src/views/Settings.vue
  frontend/vite.config.js
  frontend/vite/preloadIconFont.js
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
diff --git a/frontend/src/App.vue b/frontend/src/App.vue
index 8ad946e5feb957b5a27ac3c5b62955a4bbc77bbd..7cd3ae7b1d80ffbf7db832001ff37696ed554f28 100644
--- a/frontend/src/App.vue
+++ b/frontend/src/App.vue
@@ -63,6 +63,7 @@ body {
 .app-layout {
   display: flex;
   min-height: 100vh;
+  min-height: 100dvh;
   width: 100%;
   flex-direction: row;
 }
@@ -71,6 +72,7 @@ body {
   flex: 1;
   min-width: 0;
   min-height: 100vh;
+  min-height: 100dvh;
   display: flex;
   flex-direction: column;
 }
diff --git a/frontend/src/assets/main.css b/frontend/src/assets/main.css
index c47c5ea984f64c4efc6f7323cde6481d83c90f90..3a87e490ed999a8c4e98809b9e2070355b536c4b 100644
--- a/frontend/src/assets/main.css
+++ b/frontend/src/assets/main.css
@@ -177,6 +177,7 @@ body {
   align-items: center;
   width: 100%;
   min-height: 100vh;
+  min-height: 100dvh;
 }
 
 *::-webkit-scrollbar {
diff --git a/frontend/src/components/AuthLayout.vue b/frontend/src/components/AuthLayout.vue
index 23594261f31de8f33d95c7acb3c812abfbc8f5e4..8da626cc0cab09d503a2a4d37c5b1a1cbbb6cadb 100644
--- a/frontend/src/components/AuthLayout.vue
+++ b/frontend/src/components/AuthLayout.vue
@@ -73,6 +73,7 @@ onMounted(async () => {
 .auth-container {
   display: flex;
   min-height: 100vh;
+  min-height: 100dvh;
   width: 100vw;
   background-color: var(--bg-app);
   overflow: hidden;
diff --git a/frontend/src/components/BookItem.vue b/frontend/src/components/BookItem.vue
index 44305ca660c23392b2cbefa86cde716784bcedc3..df67a1f01528a68a84638df8d14eb8fdafb9556e 100644
--- a/frontend/src/components/BookItem.vue
+++ b/frontend/src/components/BookItem.vue
@@ -415,4 +415,14 @@ button.book-card {
   overflow: hidden;
   text-overflow: ellipsis;
 }
+
+/* Tela de toque: área de toque de 44px sem mudar o desenho de 34px */
+@media (pointer: coarse) {
+  .quick-read::after {
+    content: '';
+    position: absolute;
+    inset: -5px;
+    border-radius: 50%;
+  }
+}
 </style>
diff --git a/frontend/src/components/BookRow.vue b/frontend/src/components/BookRow.vue
index 568649022480405961e45409aaa38ef736e8df7e..f634d131d7c64572488634c930e2a90119afb240 100644
--- a/frontend/src/components/BookRow.vue
+++ b/frontend/src/components/BookRow.vue
@@ -398,4 +398,18 @@ const ariaLabel = computed(() => {
     display: none;
   }
 }
+
+/* Tela de toque: área de toque de 44px sem mudar o desenho de 34px */
+@media (pointer: coarse) {
+  .row-read {
+    position: relative;
+  }
+
+  .row-read::after {
+    content: '';
+    position: absolute;
+    inset: -5px;
+    border-radius: 50%;
+  }
+}
 </style>
diff --git a/frontend/src/components/EntityListView.vue b/frontend/src/components/EntityListView.vue
index a5128ced2051f83f91c6da03a084f742f0378a5d..60063a77e8b2e98875fee49a3ef9099c8026482f 100644
--- a/frontend/src/components/EntityListView.vue
+++ b/frontend/src/components/EntityListView.vue
@@ -434,6 +434,7 @@ onMounted(load)
 .entity-container {
   padding: 2rem;
   min-height: 100vh;
+  min-height: 100dvh;
   background-color: var(--bg-app);
 }
 
@@ -857,4 +858,14 @@ button.entity-card {
     max-width: none;
   }
 }
+
+/* Tela de toque: área de toque de 44px sem mudar o desenho de 30px */
+@media (pointer: coarse) {
+  .rename-btn::after {
+    content: '';
+    position: absolute;
+    inset: -7px;
+    border-radius: 50%;
+  }
+}
 </style>
\ No newline at end of file
diff --git a/frontend/src/components/LibraryHeader.vue b/frontend/src/components/LibraryHeader.vue
index 77d934b0830a994b945c4224ff658b29ade78dd8..c9ae6226bb5d2f965611584d4fffe9aafce209f7 100644
--- a/frontend/src/components/LibraryHeader.vue
+++ b/frontend/src/components/LibraryHeader.vue
@@ -925,4 +925,18 @@ defineExpose({ reloadOptions: loadOptions })
   color: var(--main-color) !important;
   background-color: rgba(var(--main-color-rgb), 0.1) !important;
 }
+
+/* Tela de toque: área de toque de 44px sem mudar o desenho de 34px */
+@media (pointer: coarse) {
+  .view-btn {
+    position: relative;
+  }
+
+  .view-btn::after {
+    content: '';
+    position: absolute;
+    inset: -5px;
+    border-radius: 50%;
+  }
+}
 </style>
\ No newline at end of file
diff --git a/frontend/src/components/NavigationMenu.vue b/frontend/src/components/NavigationMenu.vue
index 8044364e14b548e2a43e10f779ce7d4b88629348..dee85ebc5664bdf3fc74d21a0439da46e4942d9f 100644
--- a/frontend/src/components/NavigationMenu.vue
+++ b/frontend/src/components/NavigationMenu.vue
@@ -259,6 +259,7 @@ const items = computed(() => [
 .navigation-container {
   width: 260px;
   height: 100vh;
+  height: 100dvh;
   flex-shrink: 0;
   background-color: var(--bg-panel);
   border-right: 1px solid var(--border-color);
diff --git a/frontend/src/locales/en.json b/frontend/src/locales/en.json
index ba806499bd322d3a0075c31d0a82fd2c27b42bbe..1e38548aca6f733643048877812850b54aa67cdf 100644
--- a/frontend/src/locales/en.json
+++ b/frontend/src/locales/en.json
@@ -453,6 +453,14 @@
       "failed": "{n} with problems | {n} with problems",
       "errorLine": "Line {line} ({title})",
       "seeLibrary": "See in library"
+    },
+    "index": {
+      "label": "On this page",
+      "privacy": "Privacy",
+      "account": "Account",
+      "password": "Password",
+      "data": "Data",
+      "delete": "Delete"
     }
   },
   "discover": {
diff --git a/frontend/src/locales/pt.json b/frontend/src/locales/pt.json
index ca77eb632829a6bf37446a39a13191b599f7d468..3f5927e3a285b21532ff897a196b0c8dc6745c08 100644
--- a/frontend/src/locales/pt.json
+++ b/frontend/src/locales/pt.json
@@ -453,6 +453,14 @@
       "failed": "{n} com problema | {n} com problema",
       "errorLine": "Linha {line} ({title})",
       "seeLibrary": "Ver na biblioteca"
+    },
+    "index": {
+      "label": "Nesta página",
+      "privacy": "Privacidade",
+      "account": "Conta",
+      "password": "Senha",
+      "data": "Dados",
+      "delete": "Excluir"
     }
   },
   "discover": {
diff --git a/frontend/src/views/Community.vue b/frontend/src/views/Community.vue
index b1835d4d6e8ed7d12c276873ab949aa6e5459eec..79a46d66a6526668b3ac2eb5d986de4d0c6d40ba 100644
--- a/frontend/src/views/Community.vue
+++ b/frontend/src/views/Community.vue
@@ -27,31 +27,38 @@
       </div>
 
       <div
-        class="tabs"
-        role="tablist"
-        :aria-label="t('communityView.title')"
+        class="tabs-wrap"
+        :class="{ 'fade-start': tabsFade.start, 'fade-end': tabsFade.end }"
       >
-        <button
-          v-for="tab in tabs"
-          :id="`tab-${tab.key}`"
-          :key="tab.key"
-          type="button"
-          role="tab"
-          class="tab"
-          :class="{ active: activeTab === tab.key }"
-          :aria-selected="activeTab === tab.key"
-          :aria-controls="`panel-${tab.key}`"
-          :tabindex="activeTab === tab.key ? 0 : -1"
-          @click="activeTab = tab.key"
-          @keydown.right.prevent="moveTab(1)"
-          @keydown.left.prevent="moveTab(-1)"
+        <div
+          ref="tabsEl"
+          class="tabs"
+          role="tablist"
+          :aria-label="t('communityView.title')"
+          @scroll.passive="updateTabsFade"
         >
-          {{ tab.label }}
-          <span
-            v-if="tab.count"
-            class="tab-count"
-          >{{ tab.count }}</span>
-        </button>
+          <button
+            v-for="tab in tabs"
+            :id="`tab-${tab.key}`"
+            :key="tab.key"
+            type="button"
+            role="tab"
+            class="tab"
+            :class="{ active: activeTab === tab.key }"
+            :aria-selected="activeTab === tab.key"
+            :aria-controls="`panel-${tab.key}`"
+            :tabindex="activeTab === tab.key ? 0 : -1"
+            @click="activeTab = tab.key"
+            @keydown.right.prevent="moveTab(1)"
+            @keydown.left.prevent="moveTab(-1)"
+          >
+            {{ tab.label }}
+            <span
+              v-if="tab.count"
+              class="tab-count"
+            >{{ tab.count }}</span>
+          </button>
+        </div>
       </div>
 
       <!-- Feed -->
@@ -362,7 +369,7 @@
 </template>
 
 <script setup>
-import { ref, computed, onMounted, watch } from 'vue'
+import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
 import { useRoute } from 'vue-router'
 import { useI18n } from 'vue-i18n'
 import { useToast } from 'primevue/usetoast'
@@ -400,6 +407,44 @@ const tabs = computed(() => [
   { key: 'followers', label: t('communityView.tab_followers'), count: connections.value.followers.length }
 ])
 
+// Abas que não cabem (celular): degradê na borda que tem mais abas e a aba
+// ativa rola para o meio, para "Seguidores" não ficar escondida.
+const tabsEl = ref(null)
+const tabsFade = ref({ start: false, end: false })
+
+function updateTabsFade() {
+  const el = tabsEl.value
+  if (!el) return
+  const max = el.scrollWidth - el.clientWidth
+  tabsFade.value = { start: el.scrollLeft > 4, end: el.scrollLeft < max - 4 }
+}
+
+function centerActiveTab(smooth = true) {
+  const el = tabsEl.value
+  const tab = el?.querySelector('[aria-selected="true"]')
+  if (!el || !tab) return
+  const left = tab.offsetLeft - (el.clientWidth - tab.offsetWidth) / 2
+  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
+  el.scrollTo({ left: Math.max(0, left), behavior: smooth && !reduce ? 'smooth' : 'auto' })
+}
+
+watch(activeTab, () => nextTick(() => centerActiveTab()))
+// As contagens chegam depois e mudam a largura das abas
+watch(connections, () => nextTick(() => {
+  centerActiveTab(false)
+  updateTabsFade()
+}))
+
+onMounted(() => {
+  nextTick(() => {
+    centerActiveTab(false)
+    updateTabsFade()
+  })
+  window.addEventListener('resize', updateTabsFade)
+})
+
+onBeforeUnmount(() => window.removeEventListener('resize', updateTabsFade))
+
 function moveTab(step) {
   const keys = tabs.value.map(tab => tab.key)
   const next = keys[(keys.indexOf(activeTab.value) + step + keys.length) % keys.length]
@@ -522,6 +567,7 @@ onMounted(async () => {
 .community-container {
   padding: 2rem;
   min-height: 100vh;
+  min-height: 100dvh;
   background-color: var(--bg-app);
 }
 
@@ -566,12 +612,49 @@ onMounted(async () => {
   color: var(--main-color);
 }
 
+.tabs-wrap {
+  position: relative;
+  margin-bottom: 1.25rem;
+}
+
+.tabs-wrap::before,
+.tabs-wrap::after {
+  content: '';
+  position: absolute;
+  top: 0;
+  bottom: 1px;
+  width: 2.5rem;
+  pointer-events: none;
+  opacity: 0;
+  transition: opacity 0.15s ease;
+  z-index: 1;
+}
+
+.tabs-wrap::before {
+  left: 0;
+  background: linear-gradient(to right, var(--bg-app), transparent);
+}
+
+.tabs-wrap::after {
+  right: 0;
+  background: linear-gradient(to left, var(--bg-app), transparent);
+}
+
+.tabs-wrap.fade-start::before,
+.tabs-wrap.fade-end::after {
+  opacity: 1;
+}
+
 .tabs {
   display: flex;
   gap: 0.25rem;
   border-bottom: 1px solid var(--border-color);
-  margin-bottom: 1.25rem;
   overflow-x: auto;
+  scrollbar-width: none;
+}
+
+.tabs::-webkit-scrollbar {
+  display: none;
 }
 
 .tab {
diff --git a/frontend/src/views/Dashboard.vue b/frontend/src/views/Dashboard.vue
index 675cff84266c1edd2d9b62e7a1aa98715ac805f5..b01d79ef932c4903caf799d583501910135c3990 100644
--- a/frontend/src/views/Dashboard.vue
+++ b/frontend/src/views/Dashboard.vue
@@ -647,6 +647,7 @@ onMounted(loadStats)
 .dashboard-container {
   padding: 2rem;
   min-height: 100vh;
+  min-height: 100dvh;
   background-color: var(--bg-app);
   max-width: 1100px;
   margin: 0 auto;
diff --git a/frontend/src/views/Home.vue b/frontend/src/views/Home.vue
index 9a614ceba7bcf109bc477fe4248f5b6372551e86..a75eb35e021c8500316d581e5c3cac7f492410a3 100644
--- a/frontend/src/views/Home.vue
+++ b/frontend/src/views/Home.vue
@@ -184,7 +184,10 @@
               read-only
               :owner-username="rec.owner"
             />
-            <p class="rec-reason">{{ recReason(rec) }}</p>
+            <p
+              class="rec-reason"
+              :title="recReason(rec)"
+            >{{ recReason(rec) }}</p>
             <Button
               :label="rec.added ? t('home.recAdded') : t('status.want')"
               :icon="rec.added ? 'pi pi-check' : 'pi pi-bookmark'"
@@ -358,6 +361,7 @@ onMounted(() => {
   width: 100%;
   min-width: 0;
   min-height: 100vh;
+  min-height: 100dvh;
   background-color: var(--bg-app);
   color: var(--text-primary);
   padding: 2.5rem 2rem 3rem;
@@ -459,9 +463,16 @@ onMounted(() => {
   font-size: var(--fs-xs);
   color: var(--text-secondary);
   line-height: 1.35;
+  /* No máximo 2 linhas: os botões das recomendações ficam na mesma altura */
+  display: -webkit-box;
+  -webkit-box-orient: vertical;
+  -webkit-line-clamp: 2;
+  line-clamp: 2;
+  overflow: hidden;
 }
 
 .rec-btn.p-button {
+  margin-top: auto;
   border-radius: 999px;
   justify-content: center;
 }
@@ -577,6 +588,8 @@ onMounted(() => {
     display: flex;
     overflow-x: auto;
     scroll-snap-type: x mandatory;
+    /* Sem isto o snap encosta o primeiro livro na borda da tela */
+    scroll-padding-inline: 1rem;
     gap: 0.85rem;
     margin: 0 -1rem;
     padding: 0 1rem 0.5rem;
diff --git a/frontend/src/views/Library.vue b/frontend/src/views/Library.vue
index 4f195309552a82f564afd0bc67fdcba73b259aaa..1b5334cc437b5cd6e1d8be23d191b3292bac3cdc 100644
--- a/frontend/src/views/Library.vue
+++ b/frontend/src/views/Library.vue
@@ -335,7 +335,9 @@ onUnmounted(() => {
 
 <style scoped>
 .library-container {
+  /* 100dvh desconta a barra de endereço do celular; 100vh fica de reserva */
   height: 100vh;
+  height: 100dvh;
   width: 100%;
   display: flex;
   flex-direction: column;
diff --git a/frontend/src/views/Login.vue b/frontend/src/views/Login.vue
index 4d82fa3593b6c9c6b70e263e4eb3f9ee337389ae..8d7a8a8221dd08b781986bf131b491f7ef76024e 100644
--- a/frontend/src/views/Login.vue
+++ b/frontend/src/views/Login.vue
@@ -97,7 +97,7 @@ async function handleLogin() {
     await api.login({ username: username.value.trim(), password: password.value })
     await loadSession({ force: true })
 
-    toast.add({ severity: 'success', summary: t('login.welcome'), detail: t('login.success'), life: 3000 })
+    // Sem toast de boas-vindas: a tela de Início já mostra que entrou
     router.replace(safeRedirect(route.query.redirect))
   } catch (error) {
     // 401 = credenciais; qualquer outro (429 do rate limit, 5xx) mostra a
diff --git a/frontend/src/views/NotFound.vue b/frontend/src/views/NotFound.vue
index dcb062ac5ee488e839d047d124c7e0c393315cfc..e3338d80e9e258e37386166638285ee79fe4a051 100644
--- a/frontend/src/views/NotFound.vue
+++ b/frontend/src/views/NotFound.vue
@@ -28,6 +28,7 @@ const { t } = useI18n()
 <style scoped>
 .not-found {
   min-height: 100vh;
+  min-height: 100dvh;
   width: 100%;
   padding: 2rem;
   display: flex;
diff --git a/frontend/src/views/Privacy.vue b/frontend/src/views/Privacy.vue
index e5e764a80a3be0d9134b15c2ec38a206dfff25c6..996eacdb18f124b688e2c05f79fbf0bb086078ab 100644
--- a/frontend/src/views/Privacy.vue
+++ b/frontend/src/views/Privacy.vue
@@ -66,6 +66,7 @@ const updatedAt = computed(() => {
 .privacy-container {
   padding: 2rem;
   min-height: 100vh;
+  min-height: 100dvh;
   width: 100%;
   background-color: var(--bg-app);
   display: flex;
diff --git a/frontend/src/views/PublicLibrary.vue b/frontend/src/views/PublicLibrary.vue
index d43145606eddf9c3be3999b8463a8097c0d2f035..36019bf016e8c277379f3ff4191911345c64d50f 100644
--- a/frontend/src/views/PublicLibrary.vue
+++ b/frontend/src/views/PublicLibrary.vue
@@ -489,6 +489,7 @@ watch(username, () => {
 .public-library-container {
   padding: 2rem;
   min-height: 100vh;
+  min-height: 100dvh;
   width: 100%;
   background-color: var(--bg-app);
   display: flex;
diff --git a/frontend/src/views/Settings.vue b/frontend/src/views/Settings.vue
index 302a3fdbadb8a0daefd37febef5154fb9b05558b..096eaf9eaa1688b4f96a34fb924f4a21d941194f 100644
--- a/frontend/src/views/Settings.vue
+++ b/frontend/src/views/Settings.vue
@@ -6,11 +6,27 @@
         <p>{{ t('settings.subtitle') }}</p>
       </div>
 
+      <!-- Índice: no celular são 7 cartões em coluna -->
+      <nav
+        class="settings-index"
+        :aria-label="t('settings.index.label')"
+      >
+        <a
+          v-for="item in indexItems"
+          :key="item.id"
+          :href="`#${item.id}`"
+          class="index-link"
+          @click.prevent="jumpTo(item.id)"
+        >{{ item.label }}</a>
+      </nav>
+
       <div class="settings-grid">
         <!-- Biblioteca pública -->
         <section
           class="settings-card"
           aria-labelledby="settings-public-title"
+          id="settings-privacy"
+          tabindex="-1"
         >
           <h2 id="settings-public-title">{{ t('settings.public.title') }}</h2>
           <p class="card-desc">{{ t('settings.public.desc') }}</p>
@@ -107,6 +123,8 @@
         <section
           class="settings-card"
           aria-labelledby="settings-account-title"
+          id="settings-account"
+          tabindex="-1"
         >
           <h2 id="settings-account-title">{{ t('settings.account.title') }}</h2>
           <p class="card-desc">{{ t('settings.account.desc') }}</p>
@@ -147,6 +165,8 @@
         <section
           class="settings-card"
           aria-labelledby="settings-password-title"
+          id="settings-password"
+          tabindex="-1"
         >
           <h2 id="settings-password-title">{{ t('settings.password.title') }}</h2>
           <p class="card-desc">{{ t('settings.password.desc') }}</p>
@@ -217,6 +237,8 @@
         <section
           class="settings-card"
           aria-labelledby="settings-data-title"
+          id="settings-data"
+          tabindex="-1"
         >
           <h2 id="settings-data-title">{{ t('settings.data.title') }}</h2>
           <p class="card-desc">{{ t('settings.data.exportDesc') }}</p>
@@ -297,6 +319,8 @@
         <section
           class="settings-card danger"
           aria-labelledby="settings-delete-title"
+          id="settings-delete"
+          tabindex="-1"
         >
           <h2 id="settings-delete-title">{{ t('settings.delete.title') }}</h2>
           <p class="card-desc">{{ t('settings.delete.desc') }}</p>
@@ -426,6 +450,23 @@ import api from '../services/api.js'
 import { currentUser, updateUser, setUser, clearSession } from '../services/session.js'
 
 const { t, locale } = useI18n()
+
+const indexItems = computed(() => [
+  { id: 'settings-privacy', label: t('settings.index.privacy') },
+  { id: 'settings-account', label: t('settings.index.account') },
+  { id: 'settings-password', label: t('settings.index.password') },
+  { id: 'settings-data', label: t('settings.index.data') },
+  { id: 'settings-delete', label: t('settings.index.delete') }
+])
+
+function jumpTo(id) {
+  const el = document.getElementById(id)
+  if (!el) return
+  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
+  el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
+  el.focus({ preventScroll: true })
+}
+
 const toast = useToast()
 const router = useRouter()
 
@@ -611,6 +652,7 @@ async function deleteAccount() {
 .settings-container {
   padding: 2rem;
   min-height: 100vh;
+  min-height: 100dvh;
   background-color: var(--bg-app);
 }
 
@@ -637,6 +679,46 @@ async function deleteAccount() {
   margin: 0.5rem 0 0 0;
 }
 
+.settings-index {
+  display: flex;
+  flex-wrap: wrap;
+  gap: 0.5rem;
+  margin: -1rem 0 1.75rem;
+}
+
+.index-link {
+  display: inline-flex;
+  align-items: center;
+  min-height: 2.25rem;
+  padding: 0.35rem 0.9rem;
+  border: 1px solid var(--border-color);
+  border-radius: 999px;
+  color: var(--text-secondary);
+  font-size: var(--fs-sm);
+  font-weight: 600;
+  text-decoration: none;
+  transition: border-color 0.15s ease, color 0.15s ease;
+}
+
+.index-link:hover {
+  border-color: var(--main-color);
+  color: var(--text-primary);
+}
+
+.settings-card {
+  scroll-margin-top: 5rem;
+}
+
+.settings-card:focus {
+  outline: none;
+}
+
+@media (pointer: coarse) {
+  .index-link {
+    min-height: 2.75rem;
+  }
+}
+
 .settings-grid {
   display: flex;
   flex-direction: column;
diff --git a/frontend/vite.config.js b/frontend/vite.config.js
index 0654620229c89d7eac8077e4bcbc9f416f130cbd..1f6aabf6d6eee4b0379557e1ab1a4309442da0e9 100644
--- a/frontend/vite.config.js
+++ b/frontend/vite.config.js
@@ -2,6 +2,7 @@ import { fileURLToPath, URL } from 'node:url'
 import { defineConfig, loadEnv } from 'vite'
 import vue from '@vitejs/plugin-vue'
 import primevueTheme from './vite/primevueTheme.js'
+import preloadIconFont from './vite/preloadIconFont.js'
 
 export default defineConfig(({ mode }) => {
   const env = loadEnv(mode, process.cwd(), '')
@@ -9,7 +10,7 @@ export default defineConfig(({ mode }) => {
   const apiTarget = env.VITE_DEV_API_TARGET || 'http://localhost:3050'
 
   return {
-    plugins: [primevueTheme(), vue()],
+    plugins: [primevueTheme(), vue(), preloadIconFont()],
     resolve: {
       alias: {
         '@': fileURLToPath(new URL('./src', import.meta.url))
diff --git a/frontend/vite/preloadIconFont.js b/frontend/vite/preloadIconFont.js
new file mode 100644
index 0000000000000000000000000000000000000000..67f8a2d3187c4d637a5a80408ad45409847ad9a2
--- /dev/null
+++ b/frontend/vite/preloadIconFont.js
@@ -0,0 +1,33 @@
+/**
+ * Pré-carrega a fonte do PrimeIcons no build.
+ *
+ * O primeicons.css usa font-display: block: até a fonte chegar, os ícones
+ * ficam invisíveis e os botões só de ícone (fechar, filtro, marcar como lido,
+ * estrelas) aparecem vazios. Com o <link rel="preload"> no index.html o
+ * navegador baixa a fonte junto com o CSS, sem esperar o primeiro ícone.
+ * O nome do arquivo tem hash, por isso o link é gerado aqui e não escrito à mão.
+ */
+export default function preloadIconFont() {
+  let base = '/'
+  return {
+    name: 'librishelf:preload-icon-font',
+    apply: 'build',
+    configResolved(config) {
+      base = config.base
+    },
+    transformIndexHtml: {
+      order: 'post',
+      handler(html, ctx) {
+        const font = Object.values(ctx.bundle || {}).find(
+          file => file.type === 'asset' && /primeicons.*\.woff2$/.test(file.fileName)
+        )
+        if (!font) return html
+        return [{
+          tag: 'link',
+          attrs: { rel: 'preload', as: 'font', type: 'font/woff2', href: `${base}${font.fileName}`, crossorigin: '' },
+          injectTo: 'head'
+        }]
+      }
+    }
+  }
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
fix: acabamento no celular

- prateleiras do Início com scroll-padding: o primeiro livro não encosta
  mais na borda
- recomendações com motivo em até 2 linhas e botão "Quero ler" alinhado
  no pé do card
- área de toque de 44px em tela de toque (marcar como lido no card e na
  linha, grade/lista, renomear) sem mudar o desenho
- 100dvh depois de cada 100vh (barra de endereço do celular)
- abas da Comunidade: degradê na borda e aba ativa rolada para o meio
- preload da fonte do PrimeIcons no build (vite/preloadIconFont.js)
- sem toast de boas-vindas no login
- índice no topo da Conta (Privacidade · Conta · Senha · Dados · Excluir)
__MSG__
echo "────────────────────────────────────────────"