<template>
  <div class="page public-library-container">
    <PublicBar />

    <div
      v-if="profileCoverUrl && !notFound"
      class="profile-cover"
      aria-hidden="true"
      :style="{ backgroundImage: `url(${profileCoverUrl})` }"
    ></div>

    <PageHeader
      v-if="!notFound"
      :title="t('publicLibrary.title', { ownerName: ownerName || username })"
    >
      <template #lead>
        <ReaderAvatar
          :username="ownerName || username"
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
          <span v-if="total > 0"> · {{ t('publicLibrary.count', { count: total }, total) }}</span>
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
      </div>
      </template>
    </PageHeader>

    <!-- Perfil ainda carregando: esqueleto no lugar dele, e a grade só entra
         depois (antes a grade aparecia primeiro e era empurrada para baixo) -->
    <div
      v-if="!profileSettled && !notFound"
      class="profile-section profile-skeleton"
      aria-busy="true"
      :aria-label="t('common.loading')"
    >
      <div class="stat-row">
        <AppSkeleton
          v-for="n in 3"
          :key="n"
          class="stat-skeleton"
          width="140px"
          height="78px"
          border-radius="var(--radius-md)"
        />
      </div>
      <div class="profile-grid">
        <AppSkeleton
          v-for="n in 2"
          :key="n"
          height="220px"
          border-radius="var(--radius-md)"
        />
      </div>
    </div>

    <section
      v-else-if="profile && !notFound"
      class="profile-section"
      :aria-label="t('profile.title')"
    >
      <div class="stat-row">
        <div
          class="stat"
        >
          <span class="stat-value">{{ stats.totalBooks }}</span>
          <span class="stat-label">{{ t('profile.books') }}</span>
        </div>
        <div
          class="stat"
        >
          <span class="stat-value">{{ stats.readBooks }}</span>
          <span class="stat-label">{{ t('profile.read') }}</span>
        </div>
        <div
          v-if="stats.averageRating"
          class="stat"
        >
          <span class="stat-value">
            <i
              class="pi pi-star-fill star"
              aria-hidden="true"
            ></i>
            {{ formatAverage(stats.averageRating) }}
          </span>
          <span class="stat-label">{{ t('profile.avg_rating', { n: stats.ratedBooks }, stats.ratedBooks) }}</span>
        </div>
        <div
          v-if="viewer && !viewer.isOwner && viewer.commonCount !== null"
          class="stat"
        >
          <span class="stat-value">{{ viewer.commonCount }}</span>
          <span class="stat-label">{{ t('profile.in_common', viewer.commonCount) }}</span>
        </div>
      </div>

      <div class="profile-grid">
        <div
          v-if="yearBars.length"
          class="panel"
        >
          <h2 class="section-title">{{ t('profile.by_year') }}</h2>
          <ul class="year-bars">
            <li
              v-for="bar in yearBars"
              :key="bar.year"
            >
              <span class="bar-year">{{ bar.year }}</span>
              <span
                class="bar-track"
                aria-hidden="true"
              ><span
                  class="bar-fill"
                  :style="{ width: `${bar.percent}%`, '--bar-color': colorFor(String(bar.year)) }"
                ></span></span>
              <span class="bar-count">{{ bar.count }}</span>
            </li>
          </ul>
        </div>

        <div
          v-if="stats.topAuthors.length"
          class="panel"
        >
          <h2 class="section-title">{{ t('profile.top_authors') }}</h2>
          <ol class="rank-list">
            <li
              v-for="author in stats.topAuthors"
              :key="author.name"
            >
              <span class="ranked-name">
                <span
                  class="dot"
                  :style="{ '--dot-color': colorFor(author.name) }"
                  aria-hidden="true"
                ></span>
                {{ author.name }}
              </span>
              <span class="muted">{{ author.count }}</span>
            </li>
          </ol>
          <template v-if="stats.topTags.length">
            <h2 class="section-title sub-heading">{{ t('profile.top_tags') }}</h2>
            <div class="tag-row">
              <span
                v-for="tag in stats.topTags"
                :key="tag.name"
                class="tag-pill"
                :style="{ '--tag-color': tagColor(tag.name) }"
              >#{{ tag.name }}</span>
            </div>
          </template>
        </div>

        <div
          v-if="stats.recentlyRead.length"
          class="panel"
        >
          <h2 class="section-title">{{ t('profile.recently_read') }}</h2>
          <ul class="recent-list">
            <li
              v-for="item in stats.recentlyRead"
              :key="item.book_id"
            >
              <button
                type="button"
                class="link-button"
                @click="openBook(item.book_id)"
              >
                <span class="recent-title">{{ item.title }}</span>
                <span
                  v-if="item.authors"
                  class="muted"
                >{{ item.authors }}</span>
              </button>
              <span class="recent-meta">
                <StarRating
                  v-if="item.rating"
                  :model-value="item.rating"
                  size="sm"
                  readonly
                />
                <span class="muted">{{ formatDate(item.read_date) }}</span>
              </span>
            </li>
          </ul>
        </div>

        <div
          v-if="viewer && !viewer.isOwner && viewer.commonBooks.length"
          class="panel"
        >
          <h2 class="section-title">{{ t('profile.common_books') }}</h2>
          <ul class="recent-list">
            <li
              v-for="item in viewer.commonBooks"
              :key="item.book_id"
            >
              <button
                type="button"
                class="link-button"
                @click="openBook(item.book_id)"
              >
                <span class="recent-title">{{ item.title }}</span>
                <span
                  v-if="item.authors"
                  class="muted"
                >{{ item.authors }}</span>
              </button>
            </li>
          </ul>
          <p
            v-if="viewer.commonCount > viewer.commonBooks.length"
            class="muted small"
          >{{ t('profile.common_more', {
            n:
              viewer.commonCount - viewer.commonBooks.length }) }}</p>
        </div>
      </div>

      <div
        v-if="lists.length"
        class="panel lists-panel"
      >
        <h2 class="section-title">{{ t('lists.profileTitle', { n: lists.length }, lists.length) }}</h2>
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
      </div>

      <div
        v-if="reviews.items.length"
        class="panel reviews-panel"
      >
        <h2 class="section-title">{{ t('review.profileTitle', { n: reviews.total }, reviews.total) }}</h2>
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
      </div>
    </section>

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

    <div
      v-else-if="(loading && books.length === 0) || !profileSettled"
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
      v-else-if="books.length === 0"
      icon="pi pi-book"
      :title="t('publicLibrary.empty')"
    />

    <template v-else>
      <div class="books-grid">
        <BookItem
          v-for="book in books"
          :key="book.book_id"
          :book="book"
          read-only
          :owner-username="username"
        />
      </div>

      <!-- Mesma paginação da biblioteca do dono: carrega ao chegar perto do fim -->
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

    <BookDialog
      v-if="openedBookId"
      :key="openedBookId"
      v-model="bookDialogVisible"
      :book-id="openedBookId"
      is-read-only
      :owner-username="username"
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
import StarRating from '../components/StarRating.vue'
import ReaderAvatar from '../components/ReaderAvatar.vue'
import ReportDialog from '../components/review/ReportDialog.vue'
import IconButton from '../components/form/IconButton.vue'
import PopupMenu from '../components/ui/PopupMenu.vue'
import { useConfirm } from '../services/confirm.js'
import { tagColor, colorFor } from '../utils/tagColors.js'
import { fromApiDate } from '../utils/dates.js'
import { setRobots } from '../services/pageTitle.js'
import { coverUrl as profileCoverSrc } from '../utils/covers.js'

const PAGE_SIZE = 20

const MAX_YEARS = 10

const { t, locale } = useI18n()
const route = useRoute()
const router = useRouter()
const toast = useToast()

const profile = ref(null)
// Capa de fundo escolhida no Pro (continua aparecendo se o Pro acabar)
const profileCoverUrl = computed(() => {
  const cover = profile.value?.profileCover
  return cover ? profileCoverSrc(cover.bookId, cover.version) : null
})
const followBusy = ref(false)
const openedBookId = ref(null)
const bookDialogVisible = ref(false)

const stats = computed(() => profile.value?.stats ?? {})
const viewer = computed(() => profile.value?.viewer ?? null)
const reviews = computed(() => profile.value?.reviews ?? { total: 0, items: [] })
const lists = computed(() => profile.value?.lists ?? [])
const followStatus = computed(() => viewer.value?.followStatus ?? null)

// Barras dos últimos anos com leitura, proporcionais ao ano com mais livros.
const yearBars = computed(() => {
  const years = (stats.value.readingByYear || []).slice(-MAX_YEARS)
  const max = Math.max(1, ...years.map(y => y.count))
  return years.map(y => ({ ...y, percent: Math.max(4, Math.round((y.count / max) * 100)) }))
})

function formatAverage(value) {
  return Number(value).toLocaleString(locale.value, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}

function formatDate(value) {
  const date = fromApiDate(value)
  return date ? date.toLocaleDateString(locale.value) : ''
}

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

// Denunciar a foto: só quando ela aparece (e não é a minha página)
const reportAvatarOpen = ref(false)
const moreItems = computed(() => [
  ...(profile.value?.avatarVersion ? [{ label: t('avatar.report'), icon: 'pi pi-flag', command: () => { reportAvatarOpen.value = true } }] : []),
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
    const response = await api.getPublicLibrary(requestedFor, { page: nextPage, limit: PAGE_SIZE, sort: 'title', order: 'asc' })

    // Navegou para outro usuário enquanto carregava: descarta.
    if (requestedFor !== username.value) return

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

onBeforeUnmount(() => observer?.disconnect())

// /u/a → /u/b reaproveita o componente; recarrega quando o usuário da URL muda.
watch(username, () => {
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
/* Faixa com a capa escolhida, desfocada e esmaecida até o fundo da página */
.profile-cover {
  position: relative;
  height: clamp(6rem, 18vw, 11rem);
  margin-bottom: var(--space-2);
  overflow: hidden;
  border-radius: var(--card-radius);
  background-position: center 30%;
  background-size: cover;
}

.profile-cover::after {
  content: '';
  position: absolute;
  inset: 0;
  backdrop-filter: blur(6px) saturate(1.1);
  background: linear-gradient(to bottom, rgba(0, 0, 0, 0.05), var(--bg-app));
}

.public-library-container {
  /* Casca e recuo em .page (main.css) */
  display: flex;
  flex-direction: column;
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

.profile-section {
  margin-bottom: 2.5rem;
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
}

.stat-row {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--space-4);
}

.stat {
  background: var(--bg-panel);
  border: 1px solid var(--border-color);
  border-radius: var(--card-radius);
  padding: var(--card-pad);
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.star {
  color: var(--rating);
  font-size: var(--fs-lg);
}

.profile-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: var(--space-4);
}

.panel {
  background: var(--bg-panel);
  border: 1px solid var(--border-color);
  border-radius: var(--card-radius);
  padding: var(--card-pad);
  min-width: 0;
}

.panel h2 {
  margin: 0 0 var(--space-3);
}

.reviews-panel,
.lists-panel {
  margin-top: var(--space-4);
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

.reviews-panel .small {
  margin: var(--space-3) 0 0;
}

.panel .sub-heading {
  margin-top: var(--space-4);
}

.year-bars,
.rank-list,
.recent-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.year-bars li {
  display: grid;
  grid-template-columns: 3rem 1fr 2rem;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--fs-sm);
  padding: 0.15rem 0;
}

.bar-year,
.bar-count {
  color: var(--text-secondary);
}

.bar-count {
  text-align: right;
}

.bar-track {
  height: 8px;
  background: var(--bg-input);
  border-radius: var(--radius-pill);
  overflow: hidden;
}

.bar-fill {
  display: block;
  height: 100%;
  background: var(--main-color);
  border-radius: var(--radius-pill);
  background: var(--bar-color, var(--main-color));
}

.rank-list li {
  display: flex;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-1) 0;
  color: var(--text-primary);
  font-size: var(--fs-md);
}

.ranked-name {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}

.dot {
  width: 0.55rem;
  height: 0.55rem;
  border-radius: 50%;
  background: var(--dot-color);
  flex-shrink: 0;
}

.tag-row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.tag-pill {
  border-radius: var(--radius-pill);
  padding: 0.2rem var(--space-3);
  font-size: var(--fs-sm);
  font-weight: 500;
  color: color-mix(in srgb, var(--tag-color) var(--tint-text), var(--text-primary));
  background: color-mix(in srgb, var(--tag-color) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--tag-color) 35%, transparent);
}

.recent-list li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) 0;
  border-bottom: 1px solid var(--border-color);
}

.recent-list li:last-child {
  border-bottom: none;
}

.link-button {
  background: none;
  border: none;
  padding: 0;
  text-align: left;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  min-width: 0;
  color: inherit;
  font: inherit;
}

.link-button:hover .recent-title {
  color: var(--main-color);
}

.link-button:focus-visible {
  outline: var(--focus-ring);
  outline-offset: var(--focus-offset);
  border-radius: var(--radius-sm);
}

.recent-title {
  color: var(--text-primary);
  font-size: var(--fs-md);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.recent-meta {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.15rem;
  flex-shrink: 0;
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

.stat-skeleton {
  flex: 0 0 auto;
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

@media (max-width: 639.98px) {
  .stat-row {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-3);
  }

  .books-grid {
    grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
    gap: var(--space-4);
  }

  /* Botão Seguir na largura toda, embaixo do nome (o ⋯ fica ao lado) */
  .public-library-container > .page-header :deep(.page-header-actions),
  .follow-area {
    width: 100%;
    flex-wrap: nowrap;
  }

  .follow-area .btn {
    flex: 1;
  }
}
</style>