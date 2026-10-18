<template>
  <div class="public-library-container">
    <header class="view-header">
      <router-link
        to="/"
        class="brand"
      >
        <img
          src="/bookshelf.png"
          alt=""
          width="28"
          height="28"
        />
        <span>LIBRISHELF</span>
      </router-link>

      <div
        v-if="!notFound"
        class="header-row"
      >
        <div class="header-content">
          <h1>{{ t('publicLibrary.title', { ownerName: ownerName || username }) }}</h1>
          <p>
            {{ t('publicLibrary.subtitle') }}
            <span v-if="total > 0"> · {{ t('publicLibrary.count', { count: total }, total) }}</span>
          </p>
        </div>

        <div
          v-if="profile"
          class="follow-area"
        >
          <template v-if="viewer?.isOwner">
            <span class="owner-note">{{ t('profile.own_page') }}</span>
            <router-link
              :to="{ name: 'settings' }"
              class="owner-link"
            >{{ t('profile.privacy_settings') }}</router-link>
          </template>

          <template v-else-if="viewer">
            <Button
              v-if="followStatus === 'accepted'"
              :label="t('profile.following')"
              icon="pi pi-check"
              class="p-button-outlined p-button-secondary"
              :loading="followBusy"
              @click="unfollow"
            />
            <Button
              v-else-if="followStatus === 'pending'"
              :label="t('profile.cancel_request')"
              icon="pi pi-clock"
              class="p-button-outlined p-button-secondary"
              :loading="followBusy"
              @click="unfollow"
            />
            <Button
              v-else-if="profile.acceptsFollowers"
              :label="t('profile.follow')"
              icon="pi pi-user-plus"
              class="btn-action-primary"
              :loading="followBusy"
              @click="follow"
            />
          </template>

          <router-link
            v-else-if="profile.acceptsFollowers"
            :to="{ name: 'login', query: { redirect: route.fullPath } }"
            class="owner-link"
          >{{ t('profile.login_to_follow') }}</router-link>
        </div>
      </div>
    </header>

    <section
      v-if="profile && !notFound"
      class="profile-section"
      :aria-label="t('profile.title')"
    >
      <div class="stat-row">
        <div
          class="stat"
          style="--stat-color: var(--green)"
        >
          <span class="stat-value">{{ stats.totalBooks }}</span>
          <span class="stat-label">{{ t('profile.books') }}</span>
        </div>
        <div
          class="stat"
          style="--stat-color: var(--red)"
        >
          <span class="stat-value">{{ stats.readBooks }}</span>
          <span class="stat-label">{{ t('profile.read') }}</span>
        </div>
        <div
          v-if="stats.averageRating"
          class="stat"
          style="--stat-color: var(--yellow)"
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
          style="--stat-color: var(--purple)"
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
          <h2>{{ t('profile.by_year') }}</h2>
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
          <h2>{{ t('profile.top_authors') }}</h2>
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
            <h2 class="sub-heading">{{ t('profile.top_tags') }}</h2>
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
          <h2>{{ t('profile.recently_read') }}</h2>
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
          <h2>{{ t('profile.common_books') }}</h2>
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
    </section>

    <div
      v-if="loading && books.length === 0"
      class="loading-state"
      aria-busy="true"
    >
      <i
        class="pi pi-spin pi-spinner"
        aria-hidden="true"
      ></i> {{ t('common.loading') }}
    </div>

    <div
      v-else-if="notFound"
      class="empty-state"
      role="status"
    >
      <i
        class="pi pi-lock state-icon"
        aria-hidden="true"
      ></i>
      <p>{{ t('publicLibrary.notFound') }}</p>
      <router-link
        to="/"
        class="state-link"
      >{{ t('notFound.goHome') }}</router-link>
    </div>

    <div
      v-else-if="error && books.length === 0"
      class="empty-state"
      role="alert"
    >
      <p>{{ t('publicLibrary.error') }}</p>
      <Button
        :label="t('common.retry')"
        icon="pi pi-refresh"
        class="p-button-outlined p-button-secondary"
        @click="loadLibrary()"
      />
    </div>

    <div
      v-else-if="books.length === 0"
      class="empty-state"
    >
      <p>{{ t('publicLibrary.empty') }}</p>
    </div>

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

      <div
        v-if="books.length < total"
        class="load-more"
      >
        <Button
          :label="t('publicLibrary.loadMore')"
          icon="pi pi-angle-down"
          class="p-button-outlined p-button-secondary"
          :loading="loading"
          @click="loadLibrary({ append: true })"
        />
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

    <footer class="public-footer">
      <router-link to="/privacy">{{ t('login.privacy') }}</router-link>
      <span aria-hidden="true">·</span>
      <span>{{ t('publicLibrary.poweredBy') }}</span>
    </footer>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import Button from 'primevue/button'
import { useToast } from 'primevue/usetoast'
import api from '../services/api.js'
import BookItem from '../components/BookItem.vue'
import BookDialog from '../components/BookDialog.vue'
import StarRating from '../components/StarRating.vue'
import { tagColor, colorFor } from '../utils/tagColors.js'
import { fromApiDate } from '../utils/dates.js'

const PAGE_SIZE = 40

const MAX_YEARS = 10

const { t, locale } = useI18n()
const route = useRoute()
const router = useRouter()
const toast = useToast()

const profile = ref(null)
const followBusy = ref(false)
const openedBookId = ref(null)
const bookDialogVisible = ref(false)

const stats = computed(() => profile.value?.stats ?? {})
const viewer = computed(() => profile.value?.viewer ?? null)
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

async function loadProfile() {
  const requestedFor = username.value
  try {
    const result = await api.getPublicProfile(requestedFor)
    if (requestedFor === username.value) profile.value = result
  } catch {
    if (requestedFor === username.value) profile.value = null
  }
}

async function follow() {
  followBusy.value = true
  try {
    const result = await api.follow(username.value)
    profile.value.viewer.followStatus = result.status
    toast.add({ severity: 'success', summary: t('common.success'), detail: t('profile.request_sent'), life: 3000 })
  } catch (error) {
    toast.add({ severity: 'error', summary: t('common.error'), detail: error.message, life: 4000 })
  } finally {
    followBusy.value = false
  }
}

async function unfollow() {
  followBusy.value = true
  try {
    await api.unfollow(username.value)
    profile.value.viewer.followStatus = null
  } catch (error) {
    toast.add({ severity: 'error', summary: t('common.error'), detail: error.message, life: 4000 })
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

// /u/a → /u/b reaproveita o componente; recarrega quando o usuário da URL muda.
watch(username, () => {
  books.value = []
  total.value = 0
  page.value = 0
  profile.value = null
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
.public-library-container {
  padding: 2rem;
  min-height: 100vh;
  width: 100%;
  background-color: var(--bg-app);
  display: flex;
  flex-direction: column;
}

.view-header {
  margin-bottom: 2rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.brand {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--text-secondary);
  text-decoration: none;
  font-weight: 700;
  letter-spacing: 0.05em;
  font-size: 0.85rem;
  width: fit-content;
}

.brand:hover {
  color: var(--text-primary);
}

.header-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 1rem;
  flex-wrap: wrap;
}

.follow-area {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.owner-note {
  color: var(--text-secondary);
  font-size: 0.9rem;
}

.owner-link {
  color: var(--main-color);
  font-size: 0.9rem;
}

.profile-section {
  margin-bottom: 2.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.stat-row {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
}

.stat {
  background: var(--bg-panel);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 0.9rem 1.25rem;
  display: flex;
  flex-direction: column;
  min-width: 120px;
  border-top: 3px solid var(--stat-color, var(--border-color));
}

.stat-value {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--text-primary);
}

.stat-label {
  font-size: 0.8rem;
  color: var(--text-secondary);
}

.star {
  color: #f5b301;
  font-size: 1.1rem;
}

.profile-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 1rem;
}

.panel {
  background: var(--bg-panel);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 1.1rem 1.25rem;
  min-width: 0;
}

.panel h2 {
  margin: 0 0 0.75rem;
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
  font-weight: 600;
}

.panel .sub-heading {
  margin-top: 1rem;
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
  gap: 0.5rem;
  font-size: 0.85rem;
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
  border-radius: 999px;
  overflow: hidden;
}

.bar-fill {
  display: block;
  height: 100%;
  background: var(--main-color);
  border-radius: 999px;
  background: var(--bar-color, var(--main-color));
}

.rank-list li {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.3rem 0;
  color: var(--text-primary);
  font-size: 0.9rem;
}

.ranked-name {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
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
  gap: 0.4rem;
}

.tag-pill {
  border-radius: 999px;
  padding: 0.2rem 0.65rem;
  font-size: 0.8rem;
  font-weight: 500;
  color: var(--tag-color);
  background: color-mix(in srgb, var(--tag-color) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--tag-color) 35%, transparent);
}

.recent-list li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
  padding: 0.4rem 0;
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
  outline: 2px solid var(--main-color);
  outline-offset: 2px;
  border-radius: 4px;
}

.recent-title {
  color: var(--text-primary);
  font-size: 0.9rem;
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
  font-size: 0.8rem;
}

.small {
  margin: 0.5rem 0 0;
}

.header-content h1 {
  font-family: 'Georgia', serif;
  font-size: 2rem;
  color: var(--text-primary);
  margin: 0;
}

.header-content p {
  color: var(--text-secondary);
  margin-top: 0.5rem;
}

.books-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 2rem;
  justify-content: center;
}

.load-more {
  display: flex;
  justify-content: center;
  margin-top: 2rem;
}

.loading-state,
.empty-state {
  text-align: center;
  padding: 4rem;
  color: var(--text-muted);
  font-size: 1.1rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
}

.state-icon {
  font-size: 2rem;
}

.state-link {
  color: var(--main-color);
}

.public-footer {
  margin-top: auto;
  padding-top: 3rem;
  display: flex;
  gap: 0.5rem;
  justify-content: center;
  color: var(--text-muted);
  font-size: 0.85rem;
}

.public-footer a {
  color: inherit;
}

@media (max-width: 640px) {
  .public-library-container {
    padding: 1.25rem;
  }

  .books-grid {
    grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
    gap: 1.25rem;
  }
}
</style>