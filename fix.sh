#!/usr/bin/env bash
# =============================================================================
#  Librishelf — revisão do frontend (versão completa)
#
#  1. Revisão responsiva: Início pessoal, Painel, diálogos no celular, menu
#     acessível, avisos, abas da Comunidade, iniciais, "Categorias"
#     (o mesmo conteúdo do librishelf-frontend.sh)
#  2. Cabeçalho da Biblioteca compacto no celular
#  3. Modal do livro enxuto: "Marcar como lido" direto, dados numa linha,
#     comunidade recolhida, sem rótulos em maiúsculas
#     (+ backend: PATCH /library/:id/read aceita a data local)
#
#  Uso:   bash librishelf-frontend-v2.sh [caminho/do/repo]
#  Base:  commit 2e36b86. Quem já aplicou o librishelf-frontend.sh ou copiou o
#         LibraryHeader.vue recebe só o que falta. NÃO commita, NÃO faz push.
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
[ -f backend/src/routes/uploads.js ] || fail "Falta o commit 2e36b86 (capas privadas). Aplique o librishelf-capas.sh antes."

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT
P1="$TMP_DIR/1-revisao.patch"
P2="$TMP_DIR/2-modal-cabecalho.patch"

cat > "$P1" <<'P1_EOF'
diff --git a/frontend/src/App.vue b/frontend/src/App.vue
index 49d738e..fa81705 100644
--- a/frontend/src/App.vue
+++ b/frontend/src/App.vue
@@ -15,7 +15,10 @@
       id="main-content"
       tabindex="-1"
     >
-      <Toast position="bottom-right" />
+      <Toast
+        position="bottom-right"
+        :breakpoints="{ '640px': { width: 'calc(100vw - 2rem)', left: '1rem', right: '1rem' } }"
+      />
       <ConfirmDialog />
       <router-view />
     </main>
diff --git a/frontend/src/components/AddBookDialog.vue b/frontend/src/components/AddBookDialog.vue
index 1a2bb36..8d55cca 100644
--- a/frontend/src/components/AddBookDialog.vue
+++ b/frontend/src/components/AddBookDialog.vue
@@ -897,20 +897,26 @@ button.upload-container {
 @media (max-width: 768px) {
   .dialog-body {
     flex-direction: column;
+    min-height: 0;
+    max-height: calc(100dvh - 2rem);
   }
 
   .cover-section {
+    flex: none;
     max-width: 100%;
-    padding: 2rem 1rem;
+    padding: 1rem;
     height: auto;
   }
 
   .upload-container {
-    max-width: 150px;
+    max-width: 110px;
   }
 
   .form-section {
-    padding: 1.5rem;
+    flex: 1;
+    min-height: 0;
+    max-height: none;
+    padding: 1.25rem;
   }
 
   .form-header h2 {
diff --git a/frontend/src/components/BookDialog.vue b/frontend/src/components/BookDialog.vue
index f7565bd..81b34b9 100644
--- a/frontend/src/components/BookDialog.vue
+++ b/frontend/src/components/BookDialog.vue
@@ -1140,19 +1140,31 @@ button.cover-wrapper {
 }
 
 @media (max-width: 768px) {
+  /* Celular/tablet em pé: capa compacta em cima e só os detalhes rolam,
+     para o botão de fechar e o título ficarem sempre à vista. */
   .dialog-body {
     flex-direction: column;
+    min-height: 0;
+    max-height: calc(100dvh - 2rem);
   }
 
   .cover-section {
+    flex: none;
     max-width: 100%;
-    height: 250px;
+    height: 190px;
     border-bottom: 1px solid var(--border-color);
   }
 
   .details-section {
-    padding: 1.5rem;
-    gap: 1.5rem;
+    flex: 1;
+    min-height: 0;
+    max-height: none;
+    padding: 1.25rem;
+    gap: 1.25rem;
+  }
+
+  .book-title {
+    font-size: 1.5rem;
   }
 
   .dates-grid,
diff --git a/frontend/src/components/EntityListView.vue b/frontend/src/components/EntityListView.vue
index 3e026e7..cd9b9be 100644
--- a/frontend/src/components/EntityListView.vue
+++ b/frontend/src/components/EntityListView.vue
@@ -156,7 +156,14 @@ const filteredItems = computed(() => {
 })
 
 function initials(name) {
-  return name ? name.substring(0, 2).toUpperCase() : '?'
+  if (!name) return '?'
+  // "Sobrenome, Nome" vira "Nome Sobrenome" antes de pegar as letras.
+  const [last, first] = name.split(',').map(part => part.trim())
+  const ordered = first ? `${first} ${last}` : name
+  const words = ordered.split(/\s+/).filter(word => /^\p{L}/u.test(word))
+  if (words.length === 0) return name.trim().charAt(0).toUpperCase() || '?'
+  const letters = words.length === 1 ? words[0].slice(0, 2) : words[0][0] + words.at(-1)[0]
+  return letters.toUpperCase()
 }
 
 // Cor pelo nome (não pela posição): não muda ao filtrar a lista.
diff --git a/frontend/src/components/NavigationMenu.vue b/frontend/src/components/NavigationMenu.vue
index d52ccb2..4eead55 100644
--- a/frontend/src/components/NavigationMenu.vue
+++ b/frontend/src/components/NavigationMenu.vue
@@ -3,10 +3,12 @@
 
     <div class="mobile-header">
       <Button
+        ref="menuButton"
         icon="pi pi-bars"
         class="p-button-text menu-btn"
         :aria-label="t('menu.openMenu')"
         :aria-expanded="mobileMenuOpen"
+        aria-controls="app-sidebar"
         @click="mobileMenuOpen = true"
       />
       <div class="mobile-logo-wrapper">
@@ -32,8 +34,10 @@
     </Transition>
 
     <aside
+      id="app-sidebar"
       class="sidebar"
       :class="{ 'sidebar-mobile-open': mobileMenuOpen }"
+      @keydown.esc="mobileMenuOpen = false"
     >
 
       <div class="sidebar-header">
@@ -49,6 +53,7 @@
           </div>
         </div>
         <button
+          ref="closeButton"
           type="button"
           class="close-sidebar-btn"
           :aria-label="t('menu.closeMenu')"
@@ -164,7 +169,7 @@
 </template>
 
 <script setup>
-import { ref, computed, watch } from 'vue'
+import { ref, computed, watch, nextTick, onBeforeUnmount } from 'vue'
 import { useRouter, useRoute } from 'vue-router'
 import { useI18n } from 'vue-i18n'
 import Button from 'primevue/button'
@@ -179,6 +184,19 @@ const route = useRoute()
 const { t } = useI18n()
 
 const mobileMenuOpen = ref(false)
+const menuButton = ref(null)
+const closeButton = ref(null)
+
+// Menu do celular: trava a rolagem da página, leva o foco para dentro ao abrir
+// e devolve ao botão do menu ao fechar (teclado e leitor de tela).
+watch(mobileMenuOpen, async (open) => {
+  document.body.style.overflow = open ? 'hidden' : ''
+  await nextTick()
+  if (open) closeButton.value?.focus()
+  else if (document.activeElement?.closest?.('#app-sidebar')) menuButton.value?.$el?.focus()
+})
+
+onBeforeUnmount(() => { document.body.style.overflow = '' })
 const showSettings = ref(false)
 
 const displayName = computed(() => currentUser.value?.name || t('menu.guest'))
@@ -518,11 +536,16 @@ button.nav-item {
     background-color: var(--bg-panel);
     box-shadow: none;
     transform: translateX(-100%);
-    transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
+    /* Fechado também fica invisível para teclado e leitor de tela; o
+       visibility espera a animação terminar antes de esconder. */
+    visibility: hidden;
+    transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), visibility 0s linear 0.3s;
   }
 
   .sidebar.sidebar-mobile-open {
     transform: translateX(0);
+    visibility: visible;
+    transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), visibility 0s;
     box-shadow: 10px 0 30px rgba(0, 0, 0, 0.5);
   }
 
diff --git a/frontend/src/locales/en.json b/frontend/src/locales/en.json
index d51e3ad..eb66cf6 100644
--- a/frontend/src/locales/en.json
+++ b/frontend/src/locales/en.json
@@ -40,26 +40,25 @@
     "skipToContent": "Skip to content"
   },
   "home": {
-    "welcome": "Welcome to ",
-    "hero": "Your digital library. Organize, track, and rediscover your book collection with elegance and security.",
-    "accessLibrary": "Access Your Library",
-    "features": "What you can do",
-    "manageBooks": {
-      "title": "Complete Management",
-      "desc": "Add books with details: author, publisher, date, and custom cover."
-    },
-    "trackReading": {
-      "title": "Reading Tracking",
-      "desc": "Mark books as read, log dates, and track your literary progress."
-    },
-    "smartSearch": {
-      "title": "Smart Search",
-      "desc": "Find any work instantly by filtering by title, author, publisher, or tags."
-    },
-    "visual": {
-      "title": "Premium Visuals",
-      "desc": "Your collection presented in a responsive, clean, and visually pleasing layout."
-    }
+    "morning": "Good morning, {name}",
+    "afternoon": "Good afternoon, {name}",
+    "evening": "Good evening, {name}",
+    "totalBooks": "{n} book on the shelf | {n} books on the shelf",
+    "readThisYear": "none read this year | {n} read this year | {n} read this year",
+    "addBook": "Add book",
+    "pendingRequests": "{n} person wants to follow you | {n} people want to follow you",
+    "recentlyAdded": "Recently added",
+    "seeLibrary": "See library",
+    "recentlyRead": "Recently read",
+    "seeStats": "See dashboard",
+    "community": "People you follow",
+    "seeCommunity": "See community",
+    "emptyTitle": "Your shelf is empty",
+    "emptyText": "Start with the book closest to you. With the ISBN, title, author, publisher and cover fill in on their own.",
+    "addFirst": "Add your first book",
+    "tipIsbn": "Type the ISBN (on the back, near the barcode) and click Look up.",
+    "tipRead": "Mark the books you have read and give them 1 to 5 stars.",
+    "tipShare": "In Account, make your library public to share the link and find other readers."
   },
   "book": {
     "new_title": "New Book",
@@ -192,11 +191,11 @@
     "bookCount": "{count} book | {count} books"
   },
   "tags": {
-    "title": "Tags",
-    "subtitle": "Manage your book tags.",
-    "search_ph": "Search tags...",
-    "empty": "No tags found.",
-    "error": "Could not load tags.",
+    "title": "Categories",
+    "subtitle": "The categories (tags) of your books.",
+    "search_ph": "Search categories...",
+    "empty": "No categories found.",
+    "error": "Could not load categories.",
     "bookCount": "{count} book | {count} books",
     "viewBooks": "View books"
   },
diff --git a/frontend/src/locales/pt.json b/frontend/src/locales/pt.json
index de9c1c5..a445eff 100644
--- a/frontend/src/locales/pt.json
+++ b/frontend/src/locales/pt.json
@@ -1,25 +1,24 @@
 {
   "home": {
-    "welcome": "Bem vindo ao ",
-    "hero": "Sua biblioteca digital. Organize, rastreie e redescubra sua coleção de livros com elegância e segurança.",
-    "accessLibrary": "Acesse sua biblioteca",
-    "features": "O que você pode fazer",
-    "manageBooks": {
-      "title": "Gerenciamento Completo",
-      "desc": "Adicione livros com detalhes: autor, editora, data e capa personalizada."
-    },
-    "trackReading": {
-      "title": "Rastreio de Leitura",
-      "desc": "Marque livros como lidos, registre datas e acompanhe seu progresso literário."
-    },
-    "smartSearch": {
-      "title": "Busca Inteligente",
-      "desc": "Encontre qualquer obra instantaneamente filtrando por título, autor, editora ou tags."
-    },
-    "visual": {
-      "title": "Visual Premium",
-      "desc": "Sua coleção apresentada em um layout responsivo, limpo e de visual agradável."
-    }
+    "morning": "Bom dia, {name}",
+    "afternoon": "Boa tarde, {name}",
+    "evening": "Boa noite, {name}",
+    "totalBooks": "{n} livro na estante | {n} livros na estante",
+    "readThisYear": "nenhum lido este ano | {n} lido este ano | {n} lidos este ano",
+    "addBook": "Adicionar livro",
+    "pendingRequests": "{n} pessoa quer seguir você | {n} pessoas querem seguir você",
+    "recentlyAdded": "Adicionados recentemente",
+    "seeLibrary": "Ver biblioteca",
+    "recentlyRead": "Lidos recentemente",
+    "seeStats": "Ver painel",
+    "community": "Quem você segue",
+    "seeCommunity": "Ver comunidade",
+    "emptyTitle": "Sua estante está vazia",
+    "emptyText": "Comece pelo livro que está mais perto de você. Com o ISBN, título, autor, editora e capa vêm sozinhos.",
+    "addFirst": "Adicionar o primeiro livro",
+    "tipIsbn": "Digite o ISBN (fica no verso, perto do código de barras) e clique em Buscar.",
+    "tipRead": "Marque os livros que já leu e dê uma nota de 1 a 5 estrelas.",
+    "tipShare": "Em Conta, torne a biblioteca pública para compartilhar o link e encontrar outros leitores."
   },
   "menu": {
     "home": "Início",
@@ -192,11 +191,11 @@
     "bookCount": "{count} livro | {count} livros"
   },
   "tags": {
-    "title": "Tags",
-    "subtitle": "Gerencie suas tags de livros.",
-    "search_ph": "Pesquisar tags...",
-    "empty": "Nenhuma tag encontrada.",
-    "error": "Não foi possível carregar as tags.",
+    "title": "Categorias",
+    "subtitle": "As categorias (tags) dos seus livros.",
+    "search_ph": "Pesquisar categorias...",
+    "empty": "Nenhuma categoria encontrada.",
+    "error": "Não foi possível carregar as categorias.",
     "bookCount": "{count} livro | {count} livros",
     "viewBooks": "Ver livros"
   },
diff --git a/frontend/src/views/Community.vue b/frontend/src/views/Community.vue
index ab3edb8..8db55c1 100644
--- a/frontend/src/views/Community.vue
+++ b/frontend/src/views/Community.vue
@@ -576,6 +576,14 @@ onMounted(async () => {
 }
 
 @media (max-width: 640px) {
+  /* As quatro abas cabem na largura do celular, sem rolagem lateral. */
+  .tab {
+    flex: 1;
+    justify-content: center;
+    padding: 0.7rem 0.35rem;
+    font-size: 0.9rem;
+  }
+
   .community-container {
     padding: 1.25rem;
   }
diff --git a/frontend/src/views/Dashboard.vue b/frontend/src/views/Dashboard.vue
index 25d90ff..8b7f27b 100644
--- a/frontend/src/views/Dashboard.vue
+++ b/frontend/src/views/Dashboard.vue
@@ -186,9 +186,11 @@ const stats = ref({
 
 const currentDate = computed(() => {
   const dateLocale = locale.value === 'pt' ? 'pt-BR' : 'en-US'
-  return new Date().toLocaleDateString(dateLocale, {
+  const text = new Date().toLocaleDateString(dateLocale, {
     weekday: 'long', day: 'numeric', month: 'long'
   })
+  // Só a primeira letra: "Sábado, 10 de outubro" (o CSS capitalize fazia "De Outubro").
+  return text.charAt(0).toUpperCase() + text.slice(1)
 })
 
 const readingRate = computed(() => {
@@ -298,7 +300,9 @@ onMounted(loadStats)
   padding: 2rem;
   min-height: 100vh;
   background-color: var(--bg-app);
-  margin: 0 10vw;
+  max-width: 1100px;
+  margin: 0 auto;
+  box-sizing: border-box;
 }
 
 .header-section {
@@ -323,12 +327,11 @@ onMounted(loadStats)
 .date-display {
   color: var(--main-color);
   font-weight: 600;
-  text-transform: capitalize;
 }
 
 .kpi-grid {
   display: grid;
-  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
+  grid-template-columns: repeat(4, minmax(0, 1fr));
   gap: 1.5rem;
   margin-bottom: 2rem;
 }
@@ -405,6 +408,7 @@ onMounted(loadStats)
 }
 
 .chart-card {
+  min-width: 0;
   background-color: var(--bg-panel);
   border: 1px solid var(--border-color);
   border-radius: 16px;
@@ -501,6 +505,12 @@ onMounted(loadStats)
   margin-bottom: 1.5rem;
 }
 
+@media (max-width: 1100px) {
+  .kpi-grid {
+    grid-template-columns: repeat(2, minmax(0, 1fr));
+  }
+}
+
 @media (max-width: 900px) {
   .charts-grid {
     grid-template-columns: 1fr;
@@ -513,11 +523,44 @@ onMounted(loadStats)
 
 @media (max-width: 600px) {
   .dashboard-container {
-    padding: 1rem;
+    padding: 1.25rem 1rem;
   }
 
+  /* Dois por linha: os quatro números cabem na primeira tela. */
   .kpi-grid {
-    grid-template-columns: 1fr;
+    grid-template-columns: repeat(2, minmax(0, 1fr));
+    gap: 0.75rem;
+    margin-bottom: 1.25rem;
+  }
+
+  .kpi-card {
+    padding: 1rem;
+    flex-direction: column;
+    align-items: flex-start;
+    gap: 0.6rem;
+  }
+
+  .kpi-icon {
+    width: 36px;
+    height: 36px;
+    font-size: 1.1rem;
+    border-radius: 10px;
+  }
+
+  .kpi-info .label {
+    font-size: 0.72rem;
+  }
+
+  .kpi-info .value {
+    font-size: 1.5rem;
+  }
+
+  .charts-grid {
+    gap: 1rem;
+  }
+
+  .chart-card {
+    padding: 1.1rem;
   }
 
   .header-section {
diff --git a/frontend/src/views/Home.vue b/frontend/src/views/Home.vue
index 7aec893..6dfb106 100644
--- a/frontend/src/views/Home.vue
+++ b/frontend/src/views/Home.vue
@@ -1,277 +1,472 @@
 <template>
   <div class="home-container">
-
-    <section class="hero-section">
-      <div class="logo-animation">
-        <img
-          width="120"
-          height="120"
-          src="/bookshelf.png"
-          alt=""
-          class="hero-logo"
-        />
-      </div>
-
-      <h1 class="hero-title">
-        {{ $t("home.welcome") }} <span class="highlight">Librishelf</span>
-      </h1>
-
-      <p class="hero-subtitle">
-        {{ $t("home.hero") }}
-      </p>
-
-      <div class="hero-actions">
-        <Button
-          :label="$t('home.accessLibrary')"
-          icon="pi pi-arrow-right"
-          iconPos="right"
-          class="p-button-rounded hero-btn"
-          @click="goToLibrary"
-        />
+    <header class="home-header">
+      <div class="greeting">
+        <h1>{{ greeting }}</h1>
+        <p
+          v-if="summary"
+          class="summary"
+        >{{ summary }}</p>
       </div>
+      <Button
+        v-if="!isEmpty"
+        :label="t('home.addBook')"
+        icon="pi pi-plus"
+        class="btn-action-primary add-btn-home"
+        @click="addDialogVisible = true"
+      />
+    </header>
+
+    <router-link
+      v-if="pendingRequests > 0"
+      :to="{ name: 'community' }"
+      class="notice"
+    >
+      <i
+        class="pi pi-user-plus"
+        aria-hidden="true"
+      ></i>
+      <span>{{ t('home.pendingRequests', { n: pendingRequests }, pendingRequests) }}</span>
+      <i
+        class="pi pi-angle-right notice-arrow"
+        aria-hidden="true"
+      ></i>
+    </router-link>
+
+    <!-- Carregando -->
+    <div
+      v-if="loading"
+      class="shelf-skeleton"
+      aria-busy="true"
+    >
+      <Skeleton
+        v-for="n in 6"
+        :key="n"
+        height="260px"
+        border-radius="12px"
+      />
+    </div>
+
+    <!-- Estante vazia: primeiro passo -->
+    <section
+      v-else-if="isEmpty"
+      class="empty-start"
+    >
+      <img
+        src="/bookshelf.png"
+        alt=""
+        width="96"
+        height="96"
+      />
+      <h2>{{ t('home.emptyTitle') }}</h2>
+      <p>{{ t('home.emptyText') }}</p>
+      <Button
+        :label="t('home.addFirst')"
+        icon="pi pi-plus"
+        class="btn-action-primary"
+        @click="addDialogVisible = true"
+      />
+      <ul class="tips">
+        <li>
+          <i
+            class="pi pi-search"
+            aria-hidden="true"
+          ></i>
+          <span>{{ t('home.tipIsbn') }}</span>
+        </li>
+        <li>
+          <i
+            class="pi pi-check-circle"
+            aria-hidden="true"
+          ></i>
+          <span>{{ t('home.tipRead') }}</span>
+        </li>
+        <li>
+          <i
+            class="pi pi-globe"
+            aria-hidden="true"
+          ></i>
+          <span>{{ t('home.tipShare') }}</span>
+        </li>
+      </ul>
     </section>
 
-    <section class="features-section">
-      <h2>{{ $t("home.features") }}</h2>
-
-      <div class="features-grid">
-        <div class="feature-card">
-          <div class="icon-box">
-            <i class="pi pi-plus" aria-hidden="true"></i>
-          </div>
-          <h3>{{ $t("home.manageBooks.title") }}</h3>
-          <p>{{ $t("home.manageBooks.desc") }}</p>
+    <template v-else>
+      <section
+        class="shelf"
+        aria-labelledby="home-recent-title"
+      >
+        <div class="shelf-head">
+          <h2 id="home-recent-title">{{ t('home.recentlyAdded') }}</h2>
+          <router-link
+            :to="{ name: 'library' }"
+            class="see-all"
+          >{{ t('home.seeLibrary') }}</router-link>
         </div>
-
-        <div class="feature-card">
-          <div class="icon-box">
-            <i class="pi pi-check-circle" aria-hidden="true"></i>
-          </div>
-          <h3>{{ $t("home.trackReading.title") }}</h3>
-          <p>{{ $t("home.trackReading.desc") }}</p>
+        <div class="shelf-row">
+          <BookItem
+            v-for="book in recentBooks"
+            :key="book.book_id"
+            :book="book"
+            @updated="reload"
+            @deleted="reload"
+          />
         </div>
-
-        <div class="feature-card">
-          <div class="icon-box">
-            <i class="pi pi-filter" aria-hidden="true"></i>
-          </div>
-          <h3>{{ $t("home.smartSearch.title") }}</h3>
-          <p>{{ $t("home.smartSearch.desc") }}</p>
+      </section>
+
+      <section
+        v-if="readBooks.length"
+        class="shelf"
+        aria-labelledby="home-read-title"
+      >
+        <div class="shelf-head">
+          <h2 id="home-read-title">{{ t('home.recentlyRead') }}</h2>
+          <router-link
+            :to="{ name: 'dashboard' }"
+            class="see-all"
+          >{{ t('home.seeStats') }}</router-link>
         </div>
-
-        <div class="feature-card">
-          <div class="icon-box">
-            <i class="pi pi-th-large" aria-hidden="true"></i>
-          </div>
-          <h3>{{ $t("home.visual.title") }}</h3>
-          <p>{{ $t("home.visual.desc") }}</p>
+        <div class="shelf-row">
+          <BookItem
+            v-for="book in readBooks"
+            :key="book.book_id"
+            :book="book"
+            @updated="reload"
+            @deleted="reload"
+          />
         </div>
-      </div>
-    </section>
-
+      </section>
+
+      <section
+        v-if="events.length"
+        class="activity"
+        aria-labelledby="home-activity-title"
+      >
+        <div class="shelf-head">
+          <h2 id="home-activity-title">{{ t('home.community') }}</h2>
+          <router-link
+            :to="{ name: 'community' }"
+            class="see-all"
+          >{{ t('home.seeCommunity') }}</router-link>
+        </div>
+        <ul class="activity-list">
+          <li
+            v-for="event in events"
+            :key="`${event.type}-${event.bookId}-${event.at}`"
+          >
+            <ReaderName
+              :username="event.username"
+              :is-public="event.isPublic"
+            />
+            {{ event.type === 'read' ? t('communityView.event_read') : t('communityView.event_added') }}
+            <strong>{{ event.title }}</strong>
+          </li>
+        </ul>
+      </section>
+    </template>
+
+    <AddBookDialog
+      v-model:visible="addDialogVisible"
+      @save="reload"
+    />
   </div>
 </template>
 
 <script setup>
-import { useRouter } from 'vue-router'
+import { ref, computed, onMounted } from 'vue'
+import { useI18n } from 'vue-i18n'
 import Button from 'primevue/button'
+import Skeleton from 'primevue/skeleton'
+import api from '../services/api.js'
+import BookItem from '../components/BookItem.vue'
+import AddBookDialog from '../components/AddBookDialog.vue'
+import ReaderName from '../components/ReaderName.vue'
+import { currentUser } from '../services/session.js'
+import { pendingRequests } from '../services/social.js'
+
+const SHELF_SIZE = 6
+const ACTIVITY_SIZE = 4
+
+const { t } = useI18n()
+
+const loading = ref(true)
+const recentBooks = ref([])
+const readBooks = ref([])
+const total = ref(0)
+const readThisYear = ref(0)
+const events = ref([])
+const addDialogVisible = ref(false)
+
+const isEmpty = computed(() => !loading.value && total.value === 0)
+
+const greeting = computed(() => {
+  const hour = new Date().getHours()
+  const key = hour < 5 ? 'home.evening' : hour < 12 ? 'home.morning' : hour < 18 ? 'home.afternoon' : 'home.evening'
+  return t(key, { name: currentUser.value?.name ?? '' })
+})
+
+const summary = computed(() => {
+  if (loading.value || total.value === 0) return ''
+  return `${t('home.totalBooks', { n: total.value }, total.value)} · ${t('home.readThisYear', { n: readThisYear.value }, readThisYear.value)}`
+})
+
+async function reload() {
+  try {
+    const [recent, read, stats] = await Promise.all([
+      api.getBooks({ page: 1, limit: SHELF_SIZE, sort: 'recent', order: 'desc' }),
+      api.getBooks({ page: 1, limit: SHELF_SIZE, sort: 'readDate', order: 'desc', readState: 'true' }),
+      api.getDashboardStats()
+    ])
+    recentBooks.value = recent.result || []
+    total.value = recent.total || 0
+    readBooks.value = read.result || []
+    const year = new Date().getFullYear()
+    readThisYear.value = stats.readingByYear?.find(entry => Number(entry.year) === year)?.count ?? 0
+  } catch {
+    recentBooks.value = []
+    readBooks.value = []
+  } finally {
+    loading.value = false
+  }
+}
 
-const router = useRouter()
-
-function goToLibrary() {
-  router.push('/books')
+async function loadActivity() {
+  try {
+    const feed = await api.getFeed(1)
+    events.value = (feed.events || []).slice(0, ACTIVITY_SIZE)
+  } catch {
+    events.value = []
+  }
 }
+
+onMounted(() => {
+  reload()
+  loadActivity()
+})
 </script>
 
 <style scoped>
 .home-container {
+  width: 100%;
+  min-width: 0;
   min-height: 100vh;
   background-color: var(--bg-app);
   color: var(--text-primary);
-  padding: 4rem 2rem;
-  display: flex;
-  flex-direction: column;
-  align-items: center;
+  padding: 2.5rem 2rem 3rem;
   max-width: 1200px;
   margin: 0 auto;
+  box-sizing: border-box;
+  display: flex;
+  flex-direction: column;
+  gap: 2.25rem;
 }
 
-.hero-section {
-  text-align: center;
-  max-width: 800px;
-  margin-bottom: 5rem;
-  animation: fadeUp 0.8s ease-out;
+.home-header {
+  display: flex;
+  justify-content: space-between;
+  align-items: flex-end;
+  gap: 1rem;
+  flex-wrap: wrap;
 }
 
-.hero-logo {
-  filter: drop-shadow(0 0 20px rgba(var(--main-color-rgb), 0.3));
-  margin-bottom: 1.5rem;
-  transition: transform 0.3s ease;
+.greeting h1 {
+  font-family: 'Georgia', serif;
+  font-size: 2.4rem;
+  margin: 0;
+  line-height: 1.15;
 }
 
-.hero-logo:hover {
-  transform: scale(1.05) rotate(-5deg);
+.summary {
+  margin: 0.5rem 0 0;
+  color: var(--text-secondary);
 }
 
-.hero-title {
-  font-family: 'Georgia', serif;
-  font-size: 3.5rem;
-  font-weight: 700;
-  margin: 0 0 1rem 0;
-  line-height: 1.1;
-  letter-spacing: -1px;
+.notice {
+  display: flex;
+  align-items: center;
+  gap: 0.75rem;
+  padding: 0.85rem 1.1rem;
+  border-radius: 10px;
+  border: 1px solid rgba(var(--main-color-rgb), 0.35);
+  background: rgba(var(--main-color-rgb), 0.08);
+  color: var(--text-primary);
+  text-decoration: none;
+  margin-top: -1rem;
 }
 
-.highlight {
+.notice .pi-user-plus {
   color: var(--main-color);
-  position: relative;
-  display: inline-block;
 }
 
-.highlight::after {
-  content: '';
-  position: absolute;
-  width: 100%;
-  height: 4px;
-  bottom: 5px;
-  left: 0;
-  background-color: var(--main-color);
-  opacity: 0.3;
-  transition: height 0.2s;
+.notice-arrow {
+  margin-left: auto;
+  color: var(--text-secondary);
 }
 
-.hero-title:hover .highlight::after {
-  height: 12px;
+.notice:hover {
+  background: rgba(var(--main-color-rgb), 0.14);
 }
 
-.hero-subtitle {
+.shelf-head {
+  display: flex;
+  justify-content: space-between;
+  align-items: baseline;
+  gap: 1rem;
+  margin-bottom: 1rem;
+}
+
+.shelf-head h2 {
+  margin: 0;
   font-size: 1.25rem;
-  color: #a1a1aa;
-  line-height: 1.6;
-  margin-bottom: 2.5rem;
+  font-weight: 600;
 }
 
-.hero-btn {
-  background-color: var(--main-color) !important;
-  border-color: var(--main-color) !important;
-  color: var(--text-primary) !important;
-  font-weight: 700 !important;
-  font-size: 1.1rem !important;
-  padding: 0.8rem 2rem !important;
-  transition: transform 0.2s !important;
+.see-all {
+  color: var(--main-color);
+  text-decoration: none;
+  font-size: 0.9rem;
+  white-space: nowrap;
 }
 
-.hero-btn:hover {
-  transform: translateY(-2px);
-  filter: brightness(1.1);
+.see-all:hover {
+  text-decoration: underline;
 }
 
-.features-section {
-  width: 100%;
-  animation: fadeUp 0.8s ease-out 0.2s backwards;
+.shelf-row,
+.shelf-skeleton {
+  display: grid;
+  grid-template-columns: repeat(6, minmax(0, 1fr));
+  gap: 1.25rem;
 }
 
-.features-section h2 {
-  text-align: center;
-  font-size: 1.8rem;
-  margin-bottom: 3rem;
-  color: var(--text-primary);
-  font-weight: 600;
-  letter-spacing: -0.5px;
+.activity-list {
+  list-style: none;
+  margin: 0;
+  padding: 0;
+  background: var(--bg-panel);
+  border: 1px solid var(--border-color);
+  border-radius: 12px;
 }
 
-.features-grid {
-  display: grid;
-  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
-  gap: 2rem;
+.activity-list li {
+  padding: 0.85rem 1.1rem;
+  border-bottom: 1px solid var(--border-color);
+  color: var(--text-secondary);
+  line-height: 1.45;
 }
 
-.feature-card {
-  background-color: var(--bg-panel);
-  border: 1px solid var(--border-color);
-  border-radius: 16px;
-  padding: 2rem;
-  display: flex;
-  flex-direction: column;
-  align-items: flex-start;
-  transition: all 0.3s ease;
-  position: relative;
-  overflow: hidden;
+.activity-list li:last-child {
+  border-bottom: none;
 }
 
-.feature-card:hover {
-  transform: translateY(-5px);
-  border-color: var(--main-color);
-  box-shadow: 0 10px 30px -10px rgba(0, 0, 0, 0.5);
+.activity-list strong {
+  color: var(--text-primary);
+  font-weight: 600;
 }
 
-.icon-box {
-  width: 50px;
-  height: 50px;
-  border-radius: 12px;
-  background-color: var(--main-color);
+.empty-start {
+  text-align: center;
+  max-width: 560px;
+  margin: 1rem auto 0;
   display: flex;
+  flex-direction: column;
   align-items: center;
-  justify-content: center;
-  margin-bottom: 1.5rem;
-  transition: background 0.3s;
+  gap: 1rem;
 }
 
-.feature-card:hover .icon-box {
-  background-color: var(--main-color);
+.empty-start h2 {
+  font-family: 'Georgia', serif;
+  font-size: 1.8rem;
+  margin: 0.5rem 0 0;
 }
 
-.icon-box i {
-  font-size: 1.5rem;
-  color: #fff;
-  transition: color 0.3s;
+.empty-start p {
+  margin: 0;
+  color: var(--text-secondary);
+  line-height: 1.55;
 }
 
-.feature-card:hover .icon-box i {
-  color: var(--text-primary);
+.tips {
+  list-style: none;
+  margin: 1.5rem 0 0;
+  padding: 0;
+  display: flex;
+  flex-direction: column;
+  gap: 0.75rem;
+  text-align: left;
+  width: 100%;
 }
 
-.feature-card h3 {
-  font-size: 1.25rem;
-  margin: 0 0 0.8rem 0;
-  color: var(--text-primary);
-  font-weight: 700;
+.tips li {
+  display: flex;
+  gap: 0.85rem;
+  align-items: flex-start;
+  background: var(--bg-panel);
+  border: 1px solid var(--border-color);
+  border-radius: 10px;
+  padding: 0.9rem 1rem;
+  color: var(--text-secondary);
+  line-height: 1.45;
 }
 
-.feature-card p {
-  font-size: 1rem;
-  color: var(--text-secondary);
-  margin: 0;
-  line-height: 1.6;
+.tips .pi {
+  color: var(--main-color);
+  margin-top: 0.15rem;
 }
 
-@keyframes fadeUp {
-  from {
-    opacity: 0;
-    transform: translateY(30px);
+@media (max-width: 1100px) {
+  .shelf-row,
+  .shelf-skeleton {
+    grid-template-columns: repeat(4, minmax(0, 1fr));
   }
 
-  to {
-    opacity: 1;
-    transform: translateY(0);
+  .shelf-row > :nth-child(n + 5),
+  .shelf-skeleton > :nth-child(n + 5) {
+    display: none;
   }
 }
 
-@media (max-width: 768px) {
+@media (max-width: 640px) {
   .home-container {
-    padding: 2rem 1rem;
+    padding: 1.5rem 1rem 2.5rem;
+    gap: 1.75rem;
+  }
+
+  .greeting h1 {
+    font-size: 1.8rem;
+  }
+
+  .add-btn-home {
+    width: 100%;
+  }
+
+  /* Celular: a estante rola para o lado, como uma prateleira. O contain
+     impede que a largura dos livros estique a página inteira. */
+  .shelf-row {
+    contain: inline-size;
+    display: flex;
+    overflow-x: auto;
+    scroll-snap-type: x mandatory;
+    gap: 0.85rem;
+    margin: 0 -1rem;
+    padding: 0 1rem 0.5rem;
+  }
+
+  .shelf-row > * {
+    flex: 0 0 42%;
+    scroll-snap-align: start;
   }
 
-  .hero-title {
-    font-size: 2.5rem;
+  .shelf-row > :nth-child(n + 5) {
+    display: flex;
   }
 
-  .hero-subtitle {
-    font-size: 1.1rem;
+  .shelf-skeleton {
+    grid-template-columns: repeat(2, minmax(0, 1fr));
   }
 
-  .features-grid {
-    grid-template-columns: 1fr;
+  .shelf-skeleton > :nth-child(n + 3) {
+    display: none;
   }
 }
 </style>
P1_EOF

cat > "$P2" <<'P2_EOF'
diff --git a/backend/src/routes/library.js b/backend/src/routes/library.js
index 41f202e..168ba0a 100644
--- a/backend/src/routes/library.js
+++ b/backend/src/routes/library.js
@@ -239,7 +239,7 @@ router.patch('/:id/rating', validateNumericId(), async (req, res) => {
 router.patch('/:id/read', validateNumericId(), async (req, res) => {
   try {
     const userId = req.user.id
-    await libraryService.markBookAsRead(req.params.id, userId)
+    await libraryService.markBookAsRead(req.params.id, userId, req.body?.readDate)
     res.status(STATUS.OK).json({ message: 'Book marked as read.' })
   } catch (error) {
     sendError(res, error, 'Erro ao marcar livro como lido')
diff --git a/backend/src/services/libraryService.js b/backend/src/services/libraryService.js
index 83638f0..dbe47eb 100644
--- a/backend/src/services/libraryService.js
+++ b/backend/src/services/libraryService.js
@@ -215,9 +215,13 @@ async function setRating(bookId, userId, value) {
   return await libraryRepository.updateRating(bookId, normalizeRating(value))
 }
 
-async function markBookAsRead(bookId, userId) {
+/**
+ * Marca como lido. O cliente manda a data local (YYYY-MM-DD): com o relógio do
+ * servidor em UTC, quem marca às 22h em Brasília veria "lido amanhã".
+ */
+async function markBookAsRead(bookId, userId, rawDate) {
   await checkBookOwnership(bookId, userId)
-  const readDate = new Date()
+  const readDate = normalizeDate(rawDate, 'readDate') ?? new Date()
   return await libraryRepository.updateReadDate(bookId, readDate)
 }
 
diff --git a/backend/src/tests/integration/library.test.js b/backend/src/tests/integration/library.test.js
index 061e202..75e0eb1 100644
--- a/backend/src/tests/integration/library.test.js
+++ b/backend/src/tests/integration/library.test.js
@@ -105,6 +105,23 @@ it('should mark book as read (PATCH)', async () => {
   expect(checkRes.body.read_date).not.toBeNull()
 })
 
+it('marca como lido na data enviada pelo cliente (dia local) e recusa data inválida', async () => {
+  const res = await request(app)
+    .patch(`/library/${createdBookId}/read`)
+    .set('Authorization', `Bearer ${token}`)
+    .send({ readDate: '2024-03-15' })
+  expect(res.statusCode).toEqual(200)
+
+  const checkRes = await request(app).get(`/library/${createdBookId}`).set('Authorization', `Bearer ${token}`)
+  expect(new Date(checkRes.body.read_date).toISOString().slice(0, 10)).toBe('2024-03-15')
+
+  const bad = await request(app)
+    .patch(`/library/${createdBookId}/read`)
+    .set('Authorization', `Bearer ${token}`)
+    .send({ readDate: 'ontem' })
+  expect(bad.statusCode).toEqual(400)
+})
+
 it('should mark book as unread (DELETE action)', async () => {
   const res = await request(app)
     .delete(`/library/${createdBookId}/read`)
diff --git a/frontend/src/components/BookDialog.vue b/frontend/src/components/BookDialog.vue
index 81b34b9..6d3d047 100644
--- a/frontend/src/components/BookDialog.vue
+++ b/frontend/src/components/BookDialog.vue
@@ -167,39 +167,24 @@
           </div>
         </div>
 
-        <div class="details-content">
+        <!-- Edição: formulário completo -->
+        <div
+          v-if="isEditing"
+          class="details-content"
+        >
           <div class="info-group">
-            <label :for="isEditing ? 'book-edit-tags' : undefined">{{ t('bookDialog.tags') }}</label>
-            <div v-if="isEditing">
-              <input
-                id="book-edit-tags"
-                v-model="book.tags"
-                class="modern-input"
-                :placeholder="t('bookDialog.tagsPlaceholder')"
-              />
-            </div>
-            <div
-              v-else
-              class="tags-list"
-            >
-              <span
-                v-if="!tagList.length"
-                class="empty-text"
-              >{{ t('bookDialog.noTags') }}</span>
-
-              <Chip
-                v-for="(tag, index) in tagList"
-                :key="`${tag}-${index}`"
-                :label="tag"
-                class="custom-chip colored-chip"
-                :style="{ '--tag-color': getTagColor(index) }"
-              />
-            </div>
+            <label for="book-edit-tags">{{ t('bookDialog.tags') }}</label>
+            <input
+              id="book-edit-tags"
+              v-model="book.tags"
+              class="modern-input"
+              :placeholder="t('bookDialog.tagsPlaceholder')"
+            />
           </div>
 
           <div class="dates-grid">
             <div class="info-group">
-              <label for="book-read-date">{{ t('bookDialog.readingStatus') }}</label>
+              <label for="book-read-date">{{ t('bookDialog.readDateLabel') }}</label>
               <div class="date-input-wrapper">
                 <i
                   class="pi"
@@ -209,7 +194,6 @@
                 <Calendar
                   inputId="book-read-date"
                   v-model="book.read_date"
-                  :disabled="!isEditing"
                   dateFormat="dd/mm/yy"
                   :placeholder="t('bookDialog.notRead')"
                   class="modern-calendar"
@@ -229,7 +213,6 @@
                 <Calendar
                   inputId="book-pub-date"
                   v-model="book.pubdate"
-                  :disabled="!isEditing"
                   dateFormat="dd/mm/yy"
                   :placeholder="t('bookDialog.dateUnknown')"
                   class="modern-calendar"
@@ -246,9 +229,7 @@
               <input
                 id="book-publisher"
                 v-model="book.publisher"
-                :readonly="!isEditing"
                 class="modern-input meta-input"
-                :class="{ 'readonly': !isEditing }"
                 placeholder="-"
               />
             </div>
@@ -257,117 +238,195 @@
               <input
                 id="book-isbn"
                 v-model="book.isbn"
-                :readonly="!isEditing"
                 class="modern-input meta-input"
-                :class="{ 'readonly': !isEditing }"
                 placeholder="-"
-                :aria-describedby="showIsbnWarning ? 'book-isbn-warning' : undefined"
               />
-              <small
-                v-if="showIsbnWarning"
-                id="book-isbn-warning"
-                class="isbn-warning"
-              >
+            </div>
+          </div>
+        </div>
+
+        <!-- Visualização: o livro primeiro, o resto a um clique -->
+        <div
+          v-else-if="!loading && !loadFailed"
+          class="details-content view"
+        >
+          <div
+            v-if="!isReadOnly || book.read_date"
+            class="read-state"
+          >
+            <template v-if="book.read_date">
+              <span class="read-pill">
                 <i
-                  class="pi pi-exclamation-triangle"
+                  class="pi pi-check"
                   aria-hidden="true"
                 ></i>
-                {{ t('bookDialog.isbnInvalid') }}
-              </small>
-            </div>
+                {{ t('bookDialog.readOn', { date: formatDate(book.read_date) }) }}
+              </span>
+              <button
+                v-if="!isReadOnly"
+                type="button"
+                class="link-btn"
+                :disabled="readSaving"
+                @click="markUnread"
+              >{{ t('bookDialog.undoRead') }}</button>
+            </template>
+            <Button
+              v-else
+              :label="t('bookDialog.markRead')"
+              icon="pi pi-check"
+              class="p-button-sm mark-read-btn"
+              :loading="readSaving"
+              @click="markRead"
+            />
+          </div>
+
+          <ul
+            v-if="metaItems.length"
+            class="meta-line"
+          >
+            <li
+              v-for="item in metaItems"
+              :key="item.key"
+              :title="item.title"
+            >{{ item.text }}</li>
+          </ul>
+
+          <p
+            v-if="showIsbnWarning"
+            id="book-isbn-warning"
+            class="isbn-warning"
+          >
+            <i
+              class="pi pi-exclamation-triangle"
+              aria-hidden="true"
+            ></i>
+            {{ t('bookDialog.isbnInvalid') }}
+          </p>
+
+          <div
+            v-if="tagList.length"
+            class="tags-list"
+            :aria-label="t('bookDialog.tags')"
+          >
+            <span
+              v-for="(tag, index) in tagList"
+              :key="`${tag}-${index}`"
+              class="tag-chip"
+              :style="{ '--tag-color': getTagColor(index) }"
+            >{{ tag }}</span>
           </div>
 
           <section
             v-if="showCommunity"
             class="community-section"
-            :aria-label="t('community.book_title')"
           >
-            <h3 class="community-title">
-              <i
-                class="pi pi-users"
-                aria-hidden="true"
-              ></i>
-              {{ t('community.book_title') }}
-            </h3>
-
             <p
               v-if="communityLoading"
-              class="empty-text"
+              class="muted-line"
             >{{ t('common.loading') }}</p>
 
             <p
               v-else-if="communityError"
-              class="empty-text"
+              class="muted-line"
             >{{ t('community.load_error') }}</p>
 
             <template v-else-if="community">
               <p
                 v-if="community.readerCount === 0"
-                class="empty-text"
-              >{{ t('community.no_readers') }}</p>
+                class="muted-line"
+              >
+                <i
+                  class="pi pi-users"
+                  aria-hidden="true"
+                ></i>
+                {{ t('community.no_readers') }}
+              </p>
 
               <template v-else>
-                <p class="community-summary">
-                  {{ t('community.readers_count', { n: community.readerCount }, community.readerCount) }}
-                  <span
-                    v-if="community.averageRating"
-                    class="avg-rating"
-                  >
-                    · <i
-                      class="pi pi-star-fill"
-                      aria-hidden="true"
-                    ></i>
-                    {{ t('community.average', { avg: formatAverage(community.averageRating), n: community.ratingCount }, community.ratingCount) }}
+                <button
+                  type="button"
+                  class="community-toggle"
+                  :aria-expanded="communityOpen"
+                  aria-controls="book-community-panel"
+                  @click="communityOpen = !communityOpen"
+                >
+                  <i
+                    class="pi pi-users"
+                    aria-hidden="true"
+                  ></i>
+                  <span class="toggle-text">
+                    {{ t('community.readers_count', { n: community.readerCount }, community.readerCount) }}
+                    <span
+                      v-if="community.averageRating"
+                      class="avg-rating"
+                    >
+                      <i
+                        class="pi pi-star-fill"
+                        aria-hidden="true"
+                      ></i>
+                      {{ formatAverage(community.averageRating) }}
+                    </span>
                   </span>
-                </p>
-
-                <ul class="reader-list">
-                  <li
-                    v-for="reader in community.readers"
-                    :key="reader.username"
-                  >
-                    <router-link
-                      :to="{ name: 'public-library', params: { username: reader.username } }"
-                      class="reader-link"
-                    >@{{ reader.username }}</router-link>
-                    <i
-                      v-if="reader.hasRead"
-                      class="pi pi-check-circle text-theme"
-                      v-tooltip.top="t('community.has_read')"
-                      :aria-label="t('community.has_read')"
-                    ></i>
-                    <StarRating
-                      v-if="reader.rating"
-                      :model-value="reader.rating"
-                      size="sm"
-                      readonly
-                    />
-                  </li>
-                </ul>
+                  <i
+                    class="pi pi-chevron-down chevron"
+                    :class="{ open: communityOpen }"
+                    aria-hidden="true"
+                  ></i>
+                </button>
 
                 <div
-                  v-if="community.alsoHave.length"
-                  class="also-have"
+                  v-show="communityOpen"
+                  id="book-community-panel"
+                  class="community-panel"
                 >
-                  <h4>{{ t('community.also_have') }}</h4>
-                  <ul>
+                  <ul class="reader-list">
                     <li
-                      v-for="item in community.alsoHave"
-                      :key="`${item.owner}-${item.bookId}`"
+                      v-for="reader in community.readers"
+                      :key="reader.username"
                     >
                       <router-link
-                        :to="{ name: 'public-library', params: { username: item.owner }, query: { book: item.bookId } }"
-                        class="also-link"
-                      >
-                        <span class="also-title">{{ item.title }}</span>
-                        <span
-                          v-if="item.authors"
-                          class="also-authors"
-                        >{{ item.authors }}</span>
-                      </router-link>
-                      <span class="also-count">{{ t('community.readers_short', { n: item.readers }, item.readers) }}</span>
+                        :to="{ name: 'public-library', params: { username: reader.username } }"
+                        class="reader-link"
+                      >@{{ reader.username }}</router-link>
+                      <i
+                        v-if="reader.hasRead"
+                        class="pi pi-check-circle text-theme"
+                        v-tooltip.top="t('community.has_read')"
+                        :aria-label="t('community.has_read')"
+                      ></i>
+                      <StarRating
+                        v-if="reader.rating"
+                        :model-value="reader.rating"
+                        size="sm"
+                        readonly
+                      />
                     </li>
                   </ul>
+
+                  <div
+                    v-if="community.alsoHave.length"
+                    class="also-have"
+                  >
+                    <h3>{{ t('community.also_have') }}</h3>
+                    <ul>
+                      <li
+                        v-for="item in community.alsoHave.slice(0, ALSO_HAVE_SHOWN)"
+                        :key="`${item.owner}-${item.bookId}`"
+                      >
+                        <router-link
+                          :to="{ name: 'public-library', params: { username: item.owner }, query: { book: item.bookId } }"
+                          class="also-link"
+                        >
+                          <span class="also-title">{{ item.title }}</span>
+                          <span
+                            v-if="item.authors"
+                            class="also-authors"
+                          >{{ item.authors }}</span>
+                        </router-link>
+                        <span class="also-count">{{ t('community.readers_short', { n: item.readers }, item.readers) }}</span>
+                      </li>
+                    </ul>
+                  </div>
                 </div>
               </template>
 
@@ -375,10 +434,6 @@
                 v-if="!currentUser?.showInCommunity"
                 class="community-hint"
               >
-                <i
-                  class="pi pi-info-circle"
-                  aria-hidden="true"
-                ></i>
                 <i18n-t
                   scope="global"
                   keypath="community.join_hint"
@@ -400,7 +455,6 @@
 <script setup>
 import { ref, watch, computed, onMounted, onBeforeUnmount } from 'vue'
 import { useI18n } from 'vue-i18n'
-import Chip from 'primevue/chip'
 import Dialog from 'primevue/dialog'
 import Calendar from 'primevue/calendar'
 import Button from 'primevue/button'
@@ -414,7 +468,7 @@ import { coverUrl, handleCoverError } from '../utils/covers.js'
 import { fromApiDate, toApiDate } from '../utils/dates.js'
 import { validateImageFile, createPreviewHandle } from '../utils/files.js'
 
-const { t } = useI18n()
+const { t, locale } = useI18n()
 const props = defineProps({
   modelValue: Boolean,
   bookId: Number,
@@ -454,7 +508,11 @@ const tagList = computed(() => {
   return book.value.tags.split(',').map(tag => tag.trim()).filter(Boolean)
 })
 
+const ALSO_HAVE_SHOWN = 3
+
 const ratingSaving = ref(false)
+const readSaving = ref(false)
+const communityOpen = ref(false)
 const community = ref(null)
 const communityLoading = ref(false)
 const communityError = ref(false)
@@ -462,6 +520,53 @@ const communityError = ref(false)
 const showIsbnWarning = computed(() => !isEditing.value && !loading.value && !book.value.isbnValid)
 const showCommunity = computed(() => !props.isReadOnly && !isEditing.value && !loading.value && !loadFailed.value)
 
+function formatDate(value) {
+  const date = value instanceof Date ? value : new Date(value)
+  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(locale.value)
+}
+
+// Editora · ano · ISBN numa linha só; a data completa fica no title.
+const metaItems = computed(() => {
+  const items = []
+  if (book.value.publisher) items.push({ key: 'publisher', text: book.value.publisher })
+  if (book.value.pubdate) {
+    items.push({
+      key: 'year',
+      text: String(book.value.pubdate.getFullYear()),
+      title: t('bookDialog.publishedOn', { date: formatDate(book.value.pubdate) })
+    })
+  }
+  if (book.value.isbn) items.push({ key: 'isbn', text: `ISBN ${book.value.isbn}` })
+  return items
+})
+
+async function markRead() {
+  readSaving.value = true
+  try {
+    const today = new Date()
+    await api.markAsRead(props.bookId, toApiDate(today))
+    book.value.read_date = new Date(today.getFullYear(), today.getMonth(), today.getDate())
+    emit('updated', { book: { book_id: props.bookId, read_date: toApiDate(today) }, coverChanged: false })
+  } catch (error) {
+    toast.add({ severity: 'error', summary: t('bookDialog.error'), detail: error.message || t('bookDialog.updateFailed'), life: 4000 })
+  } finally {
+    readSaving.value = false
+  }
+}
+
+async function markUnread() {
+  readSaving.value = true
+  try {
+    await api.markAsUnread(props.bookId)
+    book.value.read_date = null
+    emit('updated', { book: { book_id: props.bookId, read_date: null }, coverChanged: false })
+  } catch (error) {
+    toast.add({ severity: 'error', summary: t('bookDialog.error'), detail: error.message || t('bookDialog.updateFailed'), life: 4000 })
+  } finally {
+    readSaving.value = false
+  }
+}
+
 function formatAverage(value) {
   return Number(value).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
 }
@@ -727,7 +832,7 @@ onBeforeUnmount(() => preview.clear())
 .dialog-body {
   display: flex;
   flex-direction: row;
-  min-height: 500px;
+  min-height: 440px;
   position: relative;
   width: 100%;
   background-color: var(--bg-panel);
@@ -857,7 +962,7 @@ button.cover-wrapper {
   color: var(--text-primary);
   display: flex;
   flex-direction: column;
-  gap: 2rem;
+  gap: 1.5rem;
   overflow-y: auto;
   max-height: 85vh;
 }
@@ -867,6 +972,8 @@ button.cover-wrapper {
   justify-content: space-between;
   align-items: flex-start;
   gap: 1rem;
+  /* Espaço para o X do canto não encostar no lixo/lápis. */
+  padding-right: 2.25rem;
 }
 
 .title-area {
@@ -877,7 +984,8 @@ button.cover-wrapper {
 }
 
 .book-title {
-  font-size: 2rem;
+  font-family: 'Georgia', serif;
+  font-size: 1.9rem;
   font-weight: 700;
   margin: 0;
   line-height: 1.2;
@@ -909,10 +1017,18 @@ button.cover-wrapper {
 }
 
 .title-input {
-  font-size: 2rem;
+  font-family: 'Georgia', serif;
+  font-size: 1.9rem;
   font-weight: 700;
 }
 
+/* Na edição, todos os campos de baixo com a mesma cara. */
+.details-content .modern-input {
+  background-color: var(--bg-input);
+  padding: 0.7rem 0.75rem;
+  border-radius: 8px;
+}
+
 .author-input {
   font-size: 1.2rem;
   color: var(--text-secondary);
@@ -921,79 +1037,209 @@ button.cover-wrapper {
 .info-group label {
   display: block;
   font-size: 0.85rem;
-  text-transform: uppercase;
-  letter-spacing: 0.05em;
-  color: var(--text-muted);
-  margin-bottom: 0.5rem;
-  font-weight: 600;
+  color: var(--text-secondary);
+  margin-bottom: 0.4rem;
+  font-weight: 500;
 }
 
-.tags-list {
+.details-content {
   display: flex;
+  flex-direction: column;
+  gap: 1.25rem;
+}
+
+.details-content.view {
+  gap: 1.1rem;
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
   flex-wrap: wrap;
-  gap: 0.5rem;
-  margin-bottom: 0.5rem;
 }
 
-.custom-chip.colored-chip {
-  background-color: transparent !important;
-  background-image: none !important;
-  color: var(--tag-color) !important;
-  border: 1px solid var(--tag-color) !important;
-  box-shadow: none !important;
+.read-pill {
+  display: inline-flex;
+  align-items: center;
+  gap: 0.45rem;
+  padding: 0.4rem 0.85rem;
+  border-radius: 999px;
+  background: rgba(var(--main-color-rgb), 0.12);
+  color: var(--main-color);
   font-weight: 600;
+  font-size: 0.9rem;
 }
 
-.custom-chip.colored-chip:hover {
-  background-color: rgba(255, 255, 255, 0.05) !important;
+.read-pill .pi {
+  font-size: 0.8rem;
 }
 
-.empty-text {
-  color: var(--text-muted);
-  font-style: italic;
+.mark-read-btn.p-button {
+  background: transparent;
+  border: 1px solid var(--main-color);
+  color: var(--main-color);
+  border-radius: 999px;
+  font-weight: 600;
 }
 
-.rating-row {
-  margin-top: 0.5rem;
+.mark-read-btn.p-button:enabled:hover {
+  background: rgba(var(--main-color-rgb), 0.12);
+  border-color: var(--main-color);
+  color: var(--main-color);
+}
+
+.link-btn {
+  background: none;
+  border: none;
+  padding: 0.25rem;
+  color: var(--text-secondary);
+  font: inherit;
+  font-size: 0.85rem;
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
+.meta-line {
+  list-style: none;
+  margin: 0;
+  padding: 0;
+  display: flex;
+  flex-wrap: wrap;
+  color: var(--text-secondary);
+  font-size: 0.92rem;
+  line-height: 1.6;
+}
+
+.meta-line li + li::before {
+  content: '·';
+  margin: 0 0.5rem;
+  color: var(--text-muted);
 }
 
 .isbn-warning {
   display: flex;
   align-items: center;
-  gap: 0.35rem;
-  margin-top: 0.4rem;
+  gap: 0.4rem;
+  margin: -0.4rem 0 0;
   color: #f59e0b;
+  font-size: 0.82rem;
+}
+
+.tags-list {
+  display: flex;
+  flex-wrap: wrap;
+  gap: 0.4rem;
+}
+
+.tag-chip {
   font-size: 0.8rem;
+  font-weight: 500;
+  padding: 0.25rem 0.7rem;
+  border-radius: 999px;
+  color: var(--tag-color);
+  background: color-mix(in srgb, var(--tag-color) 12%, transparent);
+  border: 1px solid color-mix(in srgb, var(--tag-color) 35%, transparent);
 }
 
+/* Comunidade recolhida */
 .community-section {
   border-top: 1px solid var(--border-color);
-  padding-top: 1.25rem;
+  padding-top: 1rem;
   display: flex;
   flex-direction: column;
   gap: 0.75rem;
 }
 
-.community-title {
+.muted-line {
+  margin: 0;
   display: flex;
   align-items: center;
   gap: 0.5rem;
-  margin: 0;
-  font-size: 0.85rem;
-  text-transform: uppercase;
-  letter-spacing: 0.05em;
-  color: var(--text-muted);
-  font-weight: 600;
+  color: var(--text-secondary);
+  font-size: 0.9rem;
 }
 
-.community-summary {
-  margin: 0;
+.community-toggle {
+  display: flex;
+  align-items: center;
+  gap: 0.6rem;
+  width: 100%;
+  background: none;
+  border: none;
+  padding: 0.35rem 0;
+  font: inherit;
   color: var(--text-primary);
+  cursor: pointer;
+  text-align: left;
+}
+
+.community-toggle > .pi-users {
+  color: var(--text-secondary);
+}
+
+.toggle-text {
+  flex: 1;
+  font-size: 0.95rem;
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
 }
 
 .avg-rating .pi {
   color: #f5b301;
-  font-size: 0.85rem;
+  font-size: 0.8rem;
+}
+
+.chevron {
+  color: var(--text-muted);
+  font-size: 0.8rem;
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
 }
 
 .reader-list,
@@ -1006,7 +1252,7 @@ button.cover-wrapper {
 .reader-list {
   display: flex;
   flex-wrap: wrap;
-  gap: 0.5rem;
+  gap: 0.4rem;
 }
 
 .reader-list li {
@@ -1015,7 +1261,7 @@ button.cover-wrapper {
   gap: 0.4rem;
   background: var(--bg-input);
   border-radius: 999px;
-  padding: 0.3rem 0.75rem;
+  padding: 0.25rem 0.7rem;
   font-size: 0.85rem;
 }
 
@@ -1032,8 +1278,8 @@ button.cover-wrapper {
   text-decoration: underline;
 }
 
-.also-have h4 {
-  margin: 0.25rem 0 0.5rem;
+.also-have h3 {
+  margin: 0 0 0.35rem;
   font-size: 0.85rem;
   color: var(--text-secondary);
   font-weight: 500;
@@ -1044,7 +1290,7 @@ button.cover-wrapper {
   justify-content: space-between;
   align-items: baseline;
   gap: 1rem;
-  padding: 0.35rem 0;
+  padding: 0.45rem 0;
   border-bottom: 1px solid var(--border-color);
 }
 
@@ -1062,6 +1308,7 @@ button.cover-wrapper {
   color: var(--text-primary);
   overflow: hidden;
   text-overflow: ellipsis;
+  white-space: nowrap;
 }
 
 .also-authors,
@@ -1075,12 +1322,10 @@ button.cover-wrapper {
 }
 
 .community-hint {
-  display: flex;
-  gap: 0.5rem;
-  align-items: flex-start;
   margin: 0;
-  font-size: 0.8rem;
+  font-size: 0.82rem;
   color: var(--text-secondary);
+  line-height: 1.45;
 }
 
 .dates-grid,
@@ -1167,6 +1412,23 @@ button.cover-wrapper {
     font-size: 1.5rem;
   }
 
+  /* Capa inteira e pequena, em vez de um recorte gigante. */
+  .image-container {
+    padding: 1rem;
+    height: 100%;
+    box-sizing: border-box;
+  }
+
+  .cover-wrapper {
+    width: auto;
+    height: 100%;
+    max-width: none;
+  }
+
+  .details-header {
+    padding-right: 0;
+  }
+
   .dates-grid,
   .meta-grid {
     grid-template-columns: 1fr;
diff --git a/frontend/src/components/LibraryHeader.vue b/frontend/src/components/LibraryHeader.vue
index 0573f80..71e4608 100644
--- a/frontend/src/components/LibraryHeader.vue
+++ b/frontend/src/components/LibraryHeader.vue
@@ -612,34 +612,82 @@ defineExpose({ reloadOptions: loadOptions })
 }
 
 @media (max-width: 768px) {
+  /* Celular: duas linhas só — título e ações em cima, busca embaixo. O
+     cabeçalho é fixo no topo, então cada pixel aqui é um pixel a menos de estante. */
+  .library-header-wrapper {
+    padding: 0.75rem 1rem;
+  }
+
   .top-bar {
-    flex-wrap: wrap;
-    gap: 1rem;
+    display: grid;
+    grid-template-columns: minmax(0, 1fr) auto;
+    grid-template-areas:
+      "title actions"
+      "search search";
+    gap: 0.6rem 0.75rem;
   }
 
   .header-title {
-    width: 100%;
-    justify-content: center;
+    grid-area: title;
+    gap: 0.6rem;
   }
 
-  .search-area {
-    order: 3;
-    min-width: 100%;
+  .header-title h1 {
+    font-size: 1.3rem;
   }
 
   .actions {
-    order: 2;
-    width: 100%;
-    justify-content: space-between;
+    grid-area: actions;
+    gap: 0.25rem;
+  }
+
+  .search-area {
+    grid-area: search;
+    min-width: 0;
+    max-width: none;
+  }
+
+  .custom-search-input {
+    padding-top: 0.6rem;
+    padding-bottom: 0.6rem;
   }
 
   .add-btn {
     width: auto;
+    padding: 0.5rem 0.95rem;
   }
 
+  /* Filtros ativos numa linha só: os chips rolam para o lado e o
+     "Limpar tudo" fica sempre à mão no fim. */
   .active-filters-bar {
-    flex-direction: column;
-    align-items: flex-start;
+    margin-top: 0.6rem;
+    gap: 0.5rem;
+    flex-wrap: nowrap;
+  }
+
+  .filter-label {
+    display: none;
+  }
+
+  .chips-container {
+    flex: 1;
+    min-width: 0;
+    flex-wrap: nowrap;
+    overflow-x: auto;
+    scrollbar-width: none;
+  }
+
+  .chips-container::-webkit-scrollbar {
+    display: none;
+  }
+
+  .chips-container .custom-chip {
+    flex-shrink: 0;
+  }
+
+  .clear-all-btn {
+    flex-shrink: 0;
+    padding: 0.35rem 0.5rem !important;
   }
 }
 </style>
diff --git a/frontend/src/locales/en.json b/frontend/src/locales/en.json
index eb66cf6..1f84879 100644
--- a/frontend/src/locales/en.json
+++ b/frontend/src/locales/en.json
@@ -170,7 +170,12 @@
     "cannotEdit": "Cannot edit: the book details did not load.",
     "validationTitle": "Title is required.",
     "validationAuthors": "Author is required.",
-    "isbnInvalid": "This ISBN looks wrong (check digit doesn't match). Fix it so the book shows up in the community."
+    "isbnInvalid": "This ISBN looks wrong (check digit doesn't match). Fix it so the book shows up in the community.",
+    "readOn": "Read on {date}",
+    "markRead": "Mark as read",
+    "undoRead": "Undo",
+    "readDateLabel": "Date read",
+    "publishedOn": "Published on {date}"
   },
   "authors": {
     "title": "Authors",
diff --git a/frontend/src/locales/pt.json b/frontend/src/locales/pt.json
index a445eff..6c55ab1 100644
--- a/frontend/src/locales/pt.json
+++ b/frontend/src/locales/pt.json
@@ -170,7 +170,12 @@
     "cannotEdit": "Não é possível editar: os dados do livro não carregaram.",
     "validationTitle": "Título é obrigatório.",
     "validationAuthors": "Autor é obrigatório.",
-    "isbnInvalid": "Este ISBN parece incorreto (dígito verificador não confere). Corrija para o livro aparecer na comunidade."
+    "isbnInvalid": "Este ISBN parece incorreto (dígito verificador não confere). Corrija para o livro aparecer na comunidade.",
+    "readOn": "Lido em {date}",
+    "markRead": "Marcar como lido",
+    "undoRead": "Desfazer",
+    "readDateLabel": "Data de leitura",
+    "publishedOn": "Publicado em {date}"
   },
   "authors": {
     "title": "Autores",
diff --git a/frontend/src/services/api.js b/frontend/src/services/api.js
index 535fb4b..90e4a37 100644
--- a/frontend/src/services/api.js
+++ b/frontend/src/services/api.js
@@ -79,8 +79,9 @@ export default {
     return client.post(`/library/${id}/cover`, formData)
   },
 
-  markAsRead(id) {
-    return client.patch(`/library/${id}/read`)
+  /** readDate: 'YYYY-MM-DD' no fuso da pessoa (padrão: hoje no servidor). */
+  markAsRead(id, readDate) {
+    return client.patch(`/library/${id}/read`, readDate ? { readDate } : undefined)
   },
 
   markAsUnread(id) {
P2_EOF

# Arquivo por arquivo: o que já estiver aplicado é pulado.
SKIPPED=()
APPLIED=0
apply_layer() {
  local patch="$1"
  APPLIED=0
  for file in $(grep '^+++ b/' "$patch" | sed 's#^+++ b/##'); do
    if git apply --reverse --check --include="$file" --whitespace=nowarn "$patch" 2>/dev/null; then
      :
    elif git apply --check --include="$file" --whitespace=nowarn "$patch" 2>/dev/null; then
      git apply --include="$file" --whitespace=nowarn "$patch"
      APPLIED=$((APPLIED + 1))
    else
      SKIPPED+=("$file")
    fi
  done
}

step "1/4 Aplicando"
apply_layer "$P1"; ok "Revisão responsiva: $APPLIED arquivo(s) aplicados agora."
apply_layer "$P2"; ok "Modal do livro e cabeçalho: $APPLIED arquivo(s) aplicados agora."
if [ ${#SKIPPED[@]} -gt 0 ]; then
  warn "Não encaixaram (mudanças locais nesses arquivos); ficaram como estavam:"
  printf '      %s\n' "${SKIPPED[@]}" | sort -u
  fail "Rode 'git stash' nesses arquivos e execute de novo."
fi

step "2/4 Testes unitários"
[ -d backend/node_modules ] || (cd backend && npm ci --no-audit --no-fund --loglevel=error >/dev/null)
if (cd backend && npm run --silent test:unit -- --silent 2>&1 | grep -E '^(Tests|Test Suites):' | sed 's/^/  /'; exit "${PIPESTATUS[0]}"); then ok "Passando"; else fail "Falharam (rode 'npm run test:unit' em backend/)."; fi

step "3/4 Build do frontend"
[ -d frontend/node_modules ] || (cd frontend && npm ci --no-audit --no-fund --loglevel=error >/dev/null)
if (cd frontend && npx --no-install vite build >"$TMP_DIR/build.log" 2>&1); then ok "OK"; else tail -20 "$TMP_DIR/build.log" >&2; fail "Build falhou."; fi

step "4/4 Pronto — nada foi commitado"
git status --short | sed 's/^/  /'

cat <<'MSG'

Conferir: cd backend && npm test (inclui a data de leitura local)
Produção: docker compose build && docker compose up -d   (backend e frontend mudaram; sem migration)

Sugestão de commit
  feat: frontend revisado — início pessoal, modal do livro enxuto e celular

  - Início vira a estante da pessoa (recentes, lidos, quem ela segue, primeiro passo)
  - modal do livro: "Marcar como lido" direto, editora · ano · ISBN numa linha,
    comunidade recolhida com resumo, campos de formulário só na edição
  - marcar como lido usa a data local (antes podia gravar o dia seguinte à noite)
  - cabeçalho da Biblioteca em duas linhas no celular; filtros numa linha só
  - Painel, diálogos, menu, avisos e abas da Comunidade ajustados ao celular
  - menu do celular fechado fora do Tab; Esc fecha
  - iniciais certas em Autores; "Categorias" em todo lugar
MSG