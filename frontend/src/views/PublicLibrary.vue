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

    <!-- Topo: quem é, números em linha, seguir e compartilhar -->
    <PageHeader
      v-if="!notFound"
      :title="t('publicLibrary.title', { ownerName: displayName })"
    >
      <template #lead>
        <ReaderAvatar
          :username="displayName"
          :avatar="profile?.avatarVersion ?? null"
          size="lg"
        />
      </template>
      <template #subtitle>
        <p class="owner-meta">
          <span class="handle">@{{ username }}</span>
          <VanguardaBadge
            v-if="profile?.badges?.includes('vanguarda')"
            class="owner-badge"
          />
        </p>
        <p
          v-if="profile"
          class="owner-counts"
        >
          <span>{{ t('publicPage.counts.books', { n: stats.totalBooks ?? 0 }, stats.totalBooks ?? 0) }}</span>
          <span>{{ t('publicPage.counts.read', { n: stats.readBooks ?? 0 }, stats.readBooks ?? 0) }}</span>
          <span v-if="stats.averageRating">
            <i
              class="pi pi-star-fill star"
              aria-hidden="true"
            ></i>
            {{ formatAverage(stats.averageRating) }}
            <span class="sr-only">{{ t('profile.avg_rating', { n: stats.ratedBooks }, stats.ratedBooks) }}</span>
          </span>
          <span v-if="viewer && !viewer.isOwner && viewer.commonCount">{{ t('publicPage.counts.common', { n: viewer.commonCount }, viewer.commonCount) }}</span>
        </p>
      </template>
      <template
        v-if="profile"
        #actions
      >
      <div class="follow-area">
        <template v-if="viewer?.isOwner">
          <span class="owner-note">{{ t('profile.own_page') }}</span>
          <router-link
            :to="{ name: 'settings' }"
            class="owner-link"
          >{{ t('profile.privacy_settings') }}</router-link>
          <AppButton
            :label="t('publicPage.share')"
            icon="pi pi-share-alt"
            class="btn-outlined btn-secondary"
            @click="share"
          />
        </template>

        <template v-else-if="viewer">
          <!-- Bloqueado por mim: só o desbloquear -->
          <AppButton
            v-if="viewer.blockedByMe"
            :label="t('block.unblock')"
            icon="pi pi-lock-open"
            class="btn-outlined btn-secondary"
            :loading="blockBusy"
            @click="unblock"
          />
          <AppButton
            v-else-if="followStatus === 'accepted'"
            :label="t('profile.following')"
            icon="pi pi-check"
            class="btn-outlined btn-secondary"
            :loading="followBusy"
            @click="unfollow"
          />
          <AppButton
            v-else-if="followStatus === 'pending'"
            :label="t('profile.cancel_request')"
            icon="pi pi-clock"
            class="btn-outlined btn-secondary"
            :loading="followBusy"
            @click="unfollow"
          />
          <AppButton
            v-else-if="profile.acceptsFollowers"
            :label="t('profile.follow')"
            icon="pi pi-user-plus"
            class="btn-primary"
            :loading="followBusy"
            @click="follow"
          />
          <IconButton
            icon="pi pi-share-alt"
            :label="t('publicPage.share')"
            class="share-btn"
            @click="share"
          />
          <IconButton
            v-if="!viewer.blockedByMe"
            icon="pi pi-ellipsis-h"
            :label="t('block.moreActions')"
            class="more-btn"
            aria-haspopup="true"
            aria-controls="profile-more-menu"
            @click="event => moreMenu.toggle(event)"
          />
          <PopupMenu
            id="profile-more-menu"
            ref="moreMenu"
            :items="moreItems"
          />
          <ReportDialog
            v-if="profile?.avatarVersion"
            v-model:visible="reportAvatarOpen"
            kind="avatar"
            :username="ownerName || username"
          />
          <ReportDialog
            v-if="profile?.bio"
            v-model:visible="reportBioOpen"
            kind="bio"
            :username="ownerName || username"
          />
        </template>

        <!-- Sem sessão: o mesmo botão Seguir, que leva ao login e volta para cá -->
        <router-link
          v-else-if="profile.acceptsFollowers"
          :to="{ name: 'login', query: { redirect: route.fullPath } }"
          class="btn btn-primary"
          :title="t('profile.login_to_follow')"
        >
          <i
            class="pi pi-user-plus"
            aria-hidden="true"
          ></i>
          <span>{{ t('profile.follow') }}</span>
        </router-link>
        <IconButton
          v-if="!viewer"
          icon="pi pi-share-alt"
          :label="t('publicPage.share')"
          class="share-btn"
          @click="share"
        />
      </div>
      </template>
    </PageHeader>

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
      <div
        class="app-tabs public-tabs"
        role="tablist"
        :aria-label="t('publicLibrary.title', { ownerName: displayName })"
      >
        <button
          v-for="tab in tabs"
          :id="`public-tab-${tab.key}`"
          :key="tab.key"
          type="button"
          role="tab"
          class="app-tab"
          :class="{ active: activeTab === tab.key }"
          :aria-selected="activeTab === tab.key"
          :aria-controls="`public-panel-${tab.key}`"
          :tabindex="activeTab === tab.key ? 0 : -1"
          @click="setTab(tab.key)"
          @keydown.right.prevent="moveTab(1)"
          @keydown.left.prevent="moveTab(-1)"
        >
          {{ tab.label }}
          <span
            v-if="tab.count"
            class="app-tab-count"
          >{{ tab.count }}</span>
        </button>
      </div>

      <!-- Estante -->
      <section
        v-if="activeTab === 'shelf'"
        id="public-panel-shelf"
        role="tabpanel"
        aria-labelledby="public-tab-shelf"
        class="tab-panel"
      >
        <FavoriteBooks
          v-if="profile?.favorites?.length && defaultShelf"
          :items="profile.favorites"
          @open="openBook"
        />

        <div class="shelf-toolbar">
          <div
            class="status-pills"
            role="group"
            :aria-label="t('publicPage.statusLabel')"
          >
            <PillButton
              v-for="option in statusOptions"
              :key="option.value"
              :label="option.label"
              :active="shelf.status === option.value"
              @click="setShelf({ status: option.value })"
            />
          </div>
          <div class="shelf-search">
            <SearchField
              id="public-shelf-search"
              v-model="searchInput"
              :placeholder="t('publicPage.searchPlaceholder')"
              :maxlength="100"
              size="sm"
              @clear="setShelf({ search: '' })"
            />
            <AppSelect
              :model-value="shelf.sort"
              :options="sortOptions"
              :aria-label="t('publicPage.sortLabel')"
              class="shelf-sort"
              @update:model-value="value => setShelf({ sort: value })"
            />
          </div>
        </div>

        <div
          v-if="loading && books.length === 0"
          class="books-grid"
          aria-busy="true"
          :aria-label="t('common.loading')"
        >
          <div
            v-for="n in 10"
            :key="n"
            class="book-skeleton"
          >
            <AppSkeleton
              class="cover-skeleton"
              height="auto"
              border-radius="var(--radius-md)"
            />
            <AppSkeleton
              width="85%"
              height="1rem"
            />
            <AppSkeleton
              width="60%"
              height="0.8rem"
            />
          </div>
        </div>

        <EmptyState
          v-else-if="error && books.length === 0"
          variant="error"
          :title="t('publicLibrary.error')"
          @action="loadLibrary()"
        />

        <EmptyState
          v-else-if="books.length === 0 && !defaultShelf"
          icon="pi pi-filter-slash"
          :title="t('publicPage.noResults')"
          compact
        >
          <template #action>
            <AppButton
              :label="t('publicPage.clearFilters')"
              class="btn-outlined btn-secondary"
              @click="clearShelf"
            />
          </template>
        </EmptyState>

        <EmptyState
          v-else-if="books.length === 0"
          icon="pi pi-book"
          :title="t('publicLibrary.empty')"
        />

        <template v-else>
          <p
            v-if="!defaultShelf"
            class="shelf-count"
            role="status"
          >{{ t('publicLibrary.count', { count: total }, total) }}</p>
          <div class="books-grid">
            <BookItem
              v-for="book in books"
              :key="book.book_id"
              :book="book"
              read-only
              :owner-username="username"
            />
          </div>

          <div
            v-if="books.length < total"
            ref="sentinel"
            class="sentinel"
          >
            <i
              v-if="loading"
              class="pi pi-spin pi-spinner loading-more-icon"
              :aria-label="t('common.loading')"
            ></i>
          </div>
        </template>
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
      :redirect="route.fullPath"
    />

    <footer
      v-if="profileSettled"
      class="public-footer"
    >
      <router-link to="/privacy">{{ t('login.privacy') }}</router-link>
      <span aria-hidden="true">·</span>
      <span>{{ t('publicLibrary.poweredBy') }}</span>
    </footer>
  </div>
</template>

<script setup>
import PageHeader from '../components/ui/PageHeader.vue'
import PublicBar from '../components/PublicBar.vue'
import VanguardaBadge from '../components/VanguardaBadge.vue'
import ReviewCard from '../components/review/ReviewCard.vue'
import ListCard from '../components/list/ListCard.vue'
import { slugify } from '../utils/slug.js'
import { ref, computed, watch, onBeforeUnmount, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import AppButton from '../components/ui/AppButton.vue'
import AppSkeleton from '../components/ui/AppSkeleton.vue'
import EmptyState from '../components/ui/EmptyState.vue'
import { useToast } from '../services/toast.js'
import api from '../services/api.js'
import BookItem from '../components/BookItem.vue'
import BookDialog from '../components/BookDialog.vue'
import ReaderAvatar from '../components/ReaderAvatar.vue'
import ReportDialog from '../components/review/ReportDialog.vue'
import IconButton from '../components/form/IconButton.vue'
import PopupMenu from '../components/ui/PopupMenu.vue'
import { useConfirm } from '../services/confirm.js'
import { setRobots } from '../services/pageTitle.js'
import { profileCoverUrl as profileCoverSrc } from '../utils/profileCover.js'
import PillButton from '../components/form/PillButton.vue'
import SearchField from '../components/ui/SearchField.vue'
import AppSelect from '../components/ui/AppSelect.vue'
import PublicStats from '../components/public/PublicStats.vue'
import ReadingNow from '../components/public/ReadingNow.vue'
import FavoriteBooks from '../components/public/FavoriteBooks.vue'
import VisitorInvite from '../components/public/VisitorInvite.vue'
import { shareLink } from '../utils/share.js'
import { setPageTheme } from '../composables/useTheme.js'
import { SHELF_SORTS, SHELF_STATUSES, isDefaultShelf, readPublicQuery, shelfParams, writePublicQuery } from '../utils/publicShelf.js'

/**
 * Biblioteca pública (pacote 33): a página que circula por link.
 *   Topo com quem é, números em linha, seguir e compartilhar; apresentação;
 *   lendo agora; abas Estante · Listas · Resenhas · Números. A estante tem
 *   favoritos, status, busca e ordem, tudo na URL. Visitante sem conta vê o
 *   convite. Com Pro, a paleta e a cor do dono valem aqui para quem visita.
 */
const PAGE_SIZE = 20
const SEARCH_DEBOUNCE = 350

const { t, locale } = useI18n()
const route = useRoute()
const router = useRouter()
const toast = useToast()

const profile = ref(null)
// Capa de fundo escolhida no Pro (continua aparecendo se o Pro acabar)
const profileCoverUrl = computed(() => {
  const cover = profile.value?.profileCover
  return profileCoverSrc(profile.value?.username, cover)
})
const followBusy = ref(false)
const openedBookId = ref(null)
const bookDialogVisible = ref(false)

const stats = computed(() => profile.value?.stats ?? {})
const displayName = computed(() => ownerName.value || profile.value?.username || username.value)
const viewer = computed(() => profile.value?.viewer ?? null)
const reviews = computed(() => profile.value?.reviews ?? { total: 0, items: [] })
const lists = computed(() => profile.value?.lists ?? [])
const followStatus = computed(() => viewer.value?.followStatus ?? null)

function formatAverage(value) {
  return Number(value).toLocaleString(locale.value, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}

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

function moveTab(step) {
  const keys = tabs.value.map(tab => tab.key)
  const next = keys[(keys.indexOf(activeTab.value) + step + keys.length) % keys.length]
  setTab(next)
  nextTick(() => document.getElementById(`public-tab-${next}`)?.focus())
}

const statusOptions = computed(() => SHELF_STATUSES.map(value => ({ value, label: t(`publicPage.status.${value}`) })))
const sortOptions = computed(() => Object.keys(SHELF_SORTS).map(value => ({ value, label: t(`publicPage.sort.${value}`) })))

function setShelf(change) {
  replaceQuery(change)
}

function clearShelf() {
  searchInput.value = ''
  replaceQuery({ status: 'all', search: '', sort: 'recent' })
}

// Busca: digita à vontade, a URL (e a lista) muda depois de uma pausa
const searchInput = ref(urlState.value.search)
let searchTimer = null
watch(searchInput, value => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    if (value.trim() !== shelf.value.search) setShelf({ search: value })
  }, SEARCH_DEBOUNCE)
})
watch(() => shelf.value.search, value => {
  if (value !== searchInput.value.trim()) searchInput.value = value
})

// --- Compartilhar
async function share() {
  const url = `${window.location.origin}/u/${encodeURIComponent(username.value)}`
  const result = await shareLink({ title: t('publicPage.shareText', { name: displayName.value }), text: profile.value?.bio || undefined, url })
  if (result === 'copied') toast.add({ severity: 'success', detail: t('publicPage.copied'), life: 3000 })
  else if (result === 'failed') toast.add({ severity: 'error', detail: t('publicPage.shareFailed'), life: 4000 })
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

async function follow() {
  followBusy.value = true
  try {
    const result = await api.follow(username.value)
    profile.value.viewer.followStatus = result.status
    toast.add({ severity: 'success', detail: t('profile.request_sent'), life: 3000 })
  } catch (error) {
    toast.add({ severity: 'error', detail: error.message, life: 4000 })
  } finally {
    followBusy.value = false
  }
}

// --- Bloquear ---
const confirm = useConfirm()
const moreMenu = ref(null)
const blockBusy = ref(false)

// Denunciar a foto ou a apresentação: só quando aparecem (e não é a minha página)
const reportAvatarOpen = ref(false)
const reportBioOpen = ref(false)
const moreItems = computed(() => [
  ...(profile.value?.avatarVersion ? [{ label: t('avatar.report'), icon: 'pi pi-flag', command: () => { reportAvatarOpen.value = true } }] : []),
  ...(profile.value?.bio ? [{ label: t('publicPage.reportBio'), icon: 'pi pi-flag', command: () => { reportBioOpen.value = true } }] : []),
  { label: t('block.block', { name: username.value }), icon: 'pi pi-ban', command: askBlock }
])

function askBlock() {
  confirm.require({
    header: t('block.confirmTitle', { name: username.value }),
    message: t('block.confirmText'),
    icon: 'pi pi-ban',
    acceptLabel: t('block.confirmButton'),
    rejectLabel: t('common.cancel'),
    acceptClass: 'btn-rounded btn-danger',
    rejectClass: 'btn-text btn-secondary',
    accept: block
  })
}

async function block() {
  blockBusy.value = true
  try {
    await api.block(username.value)
    profile.value.viewer.blockedByMe = true
    profile.value.viewer.followStatus = null
    profile.value.viewer.commonCount = null
    profile.value.viewer.commonBooks = []
    // Bloqueado não aparece mais aqui (e a resenha deixa de ser visível)
    profile.value.reviews = { total: 0, items: [] }
    toast.add({ severity: 'success', detail: t('block.blocked', { name: username.value }), life: 4000 })
  } catch (error) {
    toast.add({ severity: 'error', detail: error.message, life: 4000 })
  } finally {
    blockBusy.value = false
  }
}

async function unblock() {
  blockBusy.value = true
  try {
    await api.unblock(username.value)
    await loadProfile()
    toast.add({ severity: 'success', detail: t('block.unblocked', { name: username.value }), life: 3000 })
  } catch (error) {
    toast.add({ severity: 'error', detail: error.message, life: 4000 })
  } finally {
    blockBusy.value = false
  }
}

async function unfollow() {
  followBusy.value = true
  try {
    await api.unfollow(username.value)
    profile.value.viewer.followStatus = null
  } catch (error) {
    toast.add({ severity: 'error', detail: error.message, life: 4000 })
  } finally {
    followBusy.value = false
  }
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
    observeSentinel()
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

// Rolagem infinita, como na biblioteca do dono. Depois de cada página o
// sentinela é observado de novo: se ainda estiver à vista (tela alta), a
// próxima página vem sem precisar rolar.
const sentinel = ref(null)
let observer = null

async function observeSentinel() {
  await nextTick()
  if (!observer) {
    observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && !loading.value && books.value.length < total.value) {
        loadLibrary({ append: true })
      }
    }, { rootMargin: '400px' })
  }
  observer.disconnect()
  if (sentinel.value) observer.observe(sentinel.value)
}

onBeforeUnmount(() => {
  observer?.disconnect()
  clearTimeout(searchTimer)
})

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

.follow-area {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.owner-note {
  color: var(--text-secondary);
  font-size: var(--fs-md);
}

.owner-link {
  color: var(--main-color);
  font-size: var(--fs-md);
}

.star {
  color: var(--rating);
  font-size: var(--fs-lg);
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

.handle {
  font-weight: 600;
}

.owner-meta {
  margin: 0;
  color: var(--text-secondary);
}

.books-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: var(--space-7);
  justify-content: center;
}

.sentinel {
  height: 80px;
  display: flex;
  justify-content: center;
  align-items: center;
  margin-top: var(--space-4);
}

.loading-more-icon {
  font-size: var(--fs-xl);
  color: var(--main-color);
}

.book-skeleton {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  min-width: 0;
}

.cover-skeleton {
  aspect-ratio: 2 / 3;
  height: auto !important;
  margin-bottom: var(--space-2);
}

.public-footer {
  margin-top: auto;
  padding-top: var(--space-8);
  display: flex;
  gap: var(--space-2);
  justify-content: center;
  color: var(--text-muted);
  font-size: var(--fs-sm);
}

.public-footer a {
  color: inherit;
}

/* Linha de números no topo: "320 livros · 210 lidos · ★ 4,1" */
.owner-counts {
  display: flex;
  flex-wrap: wrap;
  gap: 0 var(--space-2);
  margin: var(--space-1) 0 0;
  color: var(--text-secondary);
  font-size: var(--fs-sm);
}

.owner-counts > span + span::before {
  content: '·';
  margin-right: var(--space-2);
  color: var(--text-muted);
}

.owner-counts .star {
  font-size: var(--fs-xs);
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

.public-tabs {
  margin-top: var(--space-2);
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

.shelf-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}

.status-pills {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.shelf-search {
  display: flex;
  flex: 1 1 22rem;
  gap: var(--space-2);
  max-width: 34rem;
}

.shelf-search > :first-child {
  flex: 1;
  min-width: 0;
}

.shelf-sort {
  flex: 0 0 11rem;
}

.shelf-count {
  margin: 0;
  color: var(--text-secondary);
  font-size: var(--fs-sm);
}

@media (max-width: 639.98px) {
  .books-grid {
    grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
    gap: var(--space-4);
  }

  /* Seguir na largura toda; compartilhar e ⋯ ao lado */
  .public-library-container > .page-header :deep(.page-header-actions),
  .follow-area {
    width: 100%;
    flex-wrap: nowrap;
  }

  .follow-area .btn {
    flex: 1;
  }

  .owner-bio {
    margin-top: calc(-1 * var(--space-2));
    font-size: var(--fs-sm);
  }

  /* Status rolam na horizontal; busca e ordem embaixo, na largura toda */
  .status-pills {
    flex-wrap: nowrap;
    width: calc(100% + 2 * var(--page-pad-x));
    margin: 0 calc(-1 * var(--page-pad-x));
    padding: 0 var(--page-pad-x);
    overflow-x: auto;
    scrollbar-width: none;
  }

  .status-pills::-webkit-scrollbar {
    display: none;
  }

  .shelf-search {
    flex-basis: 100%;
    max-width: none;
  }

  .shelf-sort {
    flex-basis: 9.5rem;
  }
}
</style>