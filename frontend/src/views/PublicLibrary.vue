<template>
  <div class="page public-library-container">
    <PublicBar />

    <div
      v-if="profileCoverUrl && !notFound"
      class="profile-cover"
      :class="{ 'from-book': profile?.profileCover?.kind === 'book' }"
      aria-hidden="true"
      :style="{ backgroundImage: `url(${profileCoverUrl})` }"
    ></div>

    <PublicProfileHeader
      v-if="!notFound"
      :profile="profile"
      :username="username"
      :display-name="displayName"
      :reload="loadProfile"
      @viewer="change => Object.assign(profile.viewer, change)"
      @blocked="onBlocked"
    />

    <!-- Apresentação (até 2 linhas) -->
    <template v-if="profile?.bio">
      <p class="owner-bio">{{ profile.bio }}</p>
      <p
        v-if="profile.bioHidden"
        class="bio-hidden"
        role="note"
      >{{ t('publicPage.bioHidden') }}</p>
    </template>

    <!-- Perfil ainda carregando -->
    <div
      v-if="!profileSettled && !notFound"
      class="profile-skeleton"
      aria-busy="true"
      :aria-label="t('common.loading')"
    >
      <AppSkeleton
        width="100%"
        height="5.5rem"
        border-radius="var(--card-radius)"
      />
    </div>

    <ReadingNow
      v-if="profile?.reading?.length"
      :items="profile.reading"
      @open="openBook"
    />

    <EmptyState
      v-if="notFound"
      icon="pi pi-lock"
      :title="t('publicLibrary.notFound')"
      role="status"
    >
      <template #action>
        <router-link
          to="/"
          class="btn btn-outlined btn-secondary"
        >{{ t('notFound.goHome') }}</router-link>
      </template>
    </EmptyState>

    <template v-else-if="profileSettled">
      <!-- Abas: Estante · Listas · Resenhas · Números (na URL: ?tab=) -->
      <AppTabs
        :model-value="activeTab"
        :tabs="tabs"
        :label="t('publicLibrary.title', { ownerName: displayName })"
        id-prefix="public-"
        @update:model-value="setTab"
      />

      <!-- Estante -->
      <section
        v-if="activeTab === 'shelf'"
        id="public-panel-shelf"
        role="tabpanel"
        aria-labelledby="public-tab-shelf"
        class="tab-panel"
      >
        <PublicShelf
          :books="books"
          :total="total"
          :loading="loading"
          :error="error"
          :favorites="profile?.favorites ?? []"
          :shelf="shelf"
          :default-shelf="defaultShelf"
          :username="username"
          @change="replaceQuery"
          @clear="replaceQuery({ status: 'all', search: '', sort: 'recent' })"
          @more="loadLibrary({ append: true })"
          @retry="loadLibrary()"
          @open="openBook"
        />
      </section>

      <!-- Listas -->
      <section
        v-else-if="activeTab === 'lists'"
        id="public-panel-lists"
        role="tabpanel"
        aria-labelledby="public-tab-lists"
        class="tab-panel"
      >
        <ul class="list-grid">
          <li
            v-for="list in lists"
            :key="list.id"
          >
            <ListCard
              :list="list"
              :to="{ name: 'public-list', params: { username, id: list.id, slug: slugify(list.title) || undefined } }"
            />
          </li>
        </ul>
      </section>

      <!-- Resenhas -->
      <section
        v-else-if="activeTab === 'reviews'"
        id="public-panel-reviews"
        role="tabpanel"
        aria-labelledby="public-tab-reviews"
        class="tab-panel"
      >
        <div class="review-grid">
          <ReviewCard
            v-for="item in reviews.items"
            :key="item.id"
            :review="item"
            show-book
            @open-book="openBook"
          />
        </div>
        <p
          v-if="reviews.total > reviews.items.length"
          class="muted small"
        >{{ t('review.profileMore', { n: reviews.total - reviews.items.length }) }}</p>
      </section>

      <!-- Números -->
      <section
        v-else
        id="public-panel-stats"
        role="tabpanel"
        aria-labelledby="public-tab-stats"
        class="tab-panel"
      >
        <PublicStats
          :stats="stats"
          :viewer="viewer"
          @open="openBook"
        />
      </section>
    </template>

    <BookDialog
      v-if="openedBookId"
      :key="openedBookId"
      v-model="bookDialogVisible"
      :book-id="openedBookId"
      is-read-only
      :owner-username="username"
    />

    <VisitorInvite
      v-if="profileSettled && profile && !viewer"
      :name="displayName"
      :username="username"
      :redirect="route.fullPath"
    />

    <footer
      v-if="profileSettled"
      class="public-footer"
    >
      <LegalLinks />
      <span aria-hidden="true">·</span>
      <span>{{ t('publicLibrary.poweredBy') }}</span>
    </footer>
  </div>
</template>

<script setup>
import ReviewCard from '../components/review/ReviewCard.vue'
import ListCard from '../components/list/ListCard.vue'
import { slugify } from '../utils/slug.js'
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import AppSkeleton from '../components/ui/AppSkeleton.vue'
import EmptyState from '../components/ui/EmptyState.vue'
import AppTabs from '../components/ui/AppTabs.vue'
import api from '../services/api.js'
import BookDialog from '../components/BookDialog.vue'
import PublicBar from '../components/PublicBar.vue'
import { setRobots } from '../services/pageTitle.js'
import { profileCoverUrl as profileCoverSrc } from '../utils/profileCover.js'
import PublicProfileHeader from '../components/public/PublicProfileHeader.vue'
import PublicShelf from '../components/public/PublicShelf.vue'
import PublicStats from '../components/public/PublicStats.vue'
import ReadingNow from '../components/public/ReadingNow.vue'
import VisitorInvite from '../components/public/VisitorInvite.vue'
import { setPageTheme } from '../composables/useTheme.js'
import { isDefaultShelf, readPublicQuery, shelfParams, writePublicQuery } from '../utils/publicShelf.js'
import LegalLinks from '../components/legal/LegalLinks.vue'
import { firstVisit } from '../utils/publicVisit.js'
import { toApiDate } from '../utils/dates.js'

/**
 * Biblioteca pública (pacote 33): a página que circula por link.
 *   Topo com quem é, números em linha, seguir e compartilhar
 *   (PublicProfileHeader); apresentação; lendo agora; abas Estante
 *   (PublicShelf) · Listas · Resenhas · Números. A estante tem favoritos,
 *   status, busca e ordem, tudo na URL. Visitante sem conta vê o convite.
 *   Com Pro, a paleta e a cor do dono valem aqui para quem visita.
 */
const PAGE_SIZE = 20

const { t } = useI18n()
const route = useRoute()
const router = useRouter()

const profile = ref(null)
// Capa de fundo escolhida no Pro (continua aparecendo se o Pro acabar)
const profileCoverUrl = computed(() => {
  const cover = profile.value?.profileCover
  return profileCoverSrc(profile.value?.username, cover)
})
const openedBookId = ref(null)
const bookDialogVisible = ref(false)

const stats = computed(() => profile.value?.stats ?? {})
const displayName = computed(() => ownerName.value || profile.value?.username || username.value)
const viewer = computed(() => profile.value?.viewer ?? null)
const reviews = computed(() => profile.value?.reviews ?? { total: 0, items: [] })
const lists = computed(() => profile.value?.lists ?? [])

// --- Abas e estante (estado na URL)
const urlState = computed(() => readPublicQuery(route.query))
const shelf = computed(() => ({ status: urlState.value.status, search: urlState.value.search, sort: urlState.value.sort }))
const defaultShelf = computed(() => isDefaultShelf(shelf.value))

const tabs = computed(() => [
  { key: 'shelf', label: t('publicPage.tabs.shelf'), count: stats.value.totalBooks || 0 },
  ...(lists.value.length ? [{ key: 'lists', label: t('publicPage.tabs.lists'), count: lists.value.length }] : []),
  ...(reviews.value.total ? [{ key: 'reviews', label: t('publicPage.tabs.reviews'), count: reviews.value.total }] : []),
  { key: 'stats', label: t('publicPage.tabs.stats') }
])
// Aba da URL que não existe aqui (sem listas, por exemplo) cai na estante
const activeTab = computed(() => tabs.value.some(tab => tab.key === urlState.value.tab) ? urlState.value.tab : 'shelf')

function replaceQuery(state) {
  router.replace({ query: writePublicQuery(route.query, { ...urlState.value, ...state }) })
}

function setTab(key) {
  replaceQuery({ tab: key })
}

// --- Tema do dono (Pro): vale só enquanto esta página está aberta
watch(() => profile.value?.theme ?? null, theme => setPageTheme(theme))
onBeforeUnmount(() => setPageTheme(null))

function openBook(id) {
  openedBookId.value = Number(id)
  bookDialogVisible.value = true
}

watch(bookDialogVisible, (open) => {
  if (!open && route.query.book) {
    const { book, ...query } = route.query
    router.replace({ query })
  }
})

// Perfil respondeu (com dados ou não): a grade de livros pode aparecer
const profileSettled = ref(false)

async function loadProfile() {
  const requestedFor = username.value
  try {
    const result = await api.getPublicProfile(requestedFor)
    if (requestedFor === username.value) {
      profile.value = result
      // Mesma decisão que o servidor já pôs no HTML (aparecer em buscadores)
      setRobots(!result?.indexable)
      countVisit(requestedFor, result)
    }
  } catch {
    if (requestedFor === username.value) {
      profile.value = null
      setRobots(true)
    }
  } finally {
    if (requestedFor === username.value) profileSettled.value = true
  }
}

// Métricas (pacote 41): uma visita por sessão do navegador e por dia; a do
// próprio dono não conta (o servidor também confere)
function countVisit(name, result) {
  if (!result || result.viewer?.isOwner) return
  if (firstVisit(() => window.sessionStorage, name, toApiDate(new Date()))) api.trackPublicPage(name, 'visit')
}

// Bloqueado não aparece mais aqui (e a resenha deixa de ser visível)
function onBlocked() {
  Object.assign(profile.value.viewer, { blockedByMe: true, followStatus: null, commonCount: null, commonBooks: [] })
  profile.value.reviews = { total: 0, items: [] }
}

const books = ref([])
const ownerName = ref('')
const total = ref(0)
const page = ref(0)
const loading = ref(false)
const error = ref(false)
const notFound = ref(false)

const username = computed(() => String(route.params.username || ''))

async function loadLibrary({ append = false } = {}) {
  const nextPage = append ? page.value + 1 : 1
  const requestedFor = username.value

  loading.value = true
  error.value = false
  if (!append) notFound.value = false

  try {
    const filters = shelfParams(shelf.value, nextPage, PAGE_SIZE)
    const requestKey = JSON.stringify(shelf.value)
    const response = await api.getPublicLibrary(requestedFor, filters)

    // Navegou para outro usuário (ou mudou o filtro) enquanto carregava: descarta.
    if (requestedFor !== username.value || requestKey !== JSON.stringify(shelf.value)) return

    books.value = append ? [...books.value, ...response.result] : response.result
    ownerName.value = response.owner || requestedFor
    total.value = response.total || 0
    page.value = nextPage
  } catch (err) {
    if (requestedFor !== username.value) return
    if (err.status === 404) {
      notFound.value = true
      books.value = []
    } else {
      error.value = true
    }
  } finally {
    loading.value = false
  }
}

// Filtro, busca ou ordem mudou (mesmo usuário): estante do começo
watch(shelf, (next, previous) => {
  if (JSON.stringify(next) === JSON.stringify(previous)) return
  books.value = []
  total.value = 0
  page.value = 0
  loadLibrary()
})

// /u/a → /u/b reaproveita o componente; recarrega quando o usuário da URL muda.
watch(username, () => {
  setPageTheme(null)
  books.value = []
  total.value = 0
  page.value = 0
  profile.value = null
  profileSettled.value = false
  bookDialogVisible.value = false
  openedBookId.value = null
  loadLibrary()
  loadProfile()

  // Link direto para um livro (/u/fulano?book=12), usado pela comunidade.
  const bookFromQuery = Number(route.query.book)
  if (Number.isInteger(bookFromQuery) && bookFromQuery > 0) openBook(bookFromQuery)
}, { immediate: true })
</script>

<style scoped>
/* Capa escolhida: faixa de ponta a ponta colada na faixa do cabeçalho
   (mesma largura, sem raio), esmaecendo até a cor dela (--bg-panel), então
   as duas viram um bloco só. Imagem enviada aparece nítida; capa de livro
   (pequena, esticada) é desfocada. */
.profile-cover {
  position: relative;
  height: clamp(7rem, 22vw, 14rem);
  margin: 0 calc(-1 * var(--page-pad-x));
  overflow: hidden;
  background-color: var(--bg-panel);
  background-position: center 30%;
  background-size: cover;
}

.profile-cover::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(to bottom, transparent 40%, var(--bg-panel));
}

.profile-cover.from-book::after {
  /* A capa ampliada para faixa fica pixelada: o desfoque esconde isso */
  backdrop-filter: blur(8px) saturate(1.1);
  background: linear-gradient(to bottom, transparent, var(--bg-panel));
}

.public-library-container {
  /* Casca e recuo em .page (main.css) */
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}

/* O espaço entre os blocos vem do gap; capa e faixa do cabeçalho grudadas */
.public-library-container > .page-header {
  margin-bottom: 0;
}

.public-bar + .profile-cover,
.public-bar + .page-header,
.profile-cover + .page-header {
  margin-top: calc(-1 * var(--space-5));
}

.list-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 240px), 1fr));
  gap: var(--space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

.list-grid > li {
  display: flex;
  min-width: 0;
}

.list-grid > li > * {
  flex: 1;
}

.review-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 320px), 1fr));
  align-items: start;
  gap: var(--space-3);
}

.muted {
  color: var(--text-secondary);
  font-size: var(--fs-sm);
}

.small {
  margin: var(--space-2) 0 0;
}

.public-footer {
  margin-top: auto;
  padding-top: var(--space-8);
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  justify-content: center;
  color: var(--text-muted);
  font-size: var(--fs-sm);
}

.public-footer a {
  color: inherit;
}

.owner-bio {
  max-width: 40rem;
  margin: calc(-1 * var(--space-3)) 0 0;
  color: var(--text-primary);
  font-size: var(--fs-md);
  line-height: 1.5;
  white-space: pre-line;
}

.bio-hidden {
  margin: 0;
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-md);
  background: rgba(var(--red-rgb), 0.1);
  color: var(--text-primary);
  font-size: var(--fs-sm);
}

.profile-skeleton {
  display: flex;
}

/* Abas (AppTabs): o espaço até o painel vem do gap */
.public-library-container {
  --tabs-margin: var(--space-2) 0 0;
}

.tab-panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
  padding-top: var(--space-2);
}

.tab-panel:focus {
  outline: none;
}

@media (max-width: 639.98px) {
  /* Seguir na largura toda; compartilhar e ⋯ ao lado (PublicFollowActions) */
  .public-library-container > .page-header :deep(.page-header-actions) {
    width: 100%;
    flex-wrap: nowrap;
  }

  .owner-bio {
    margin-top: calc(-1 * var(--space-2));
    font-size: var(--fs-sm);
  }
}
</style>
