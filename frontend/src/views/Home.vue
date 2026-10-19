<template>
  <div class="home-container">
    <header class="home-header">
      <div class="greeting">
        <h1>{{ greeting }}</h1>
        <p
          v-if="summary"
          class="summary"
        >{{ summary }}</p>
      </div>
      <Button
        v-if="!isEmpty"
        :label="t('home.addBook')"
        icon="pi pi-plus"
        class="btn-action-primary add-btn-home"
        @click="addDialogVisible = true"
      />
    </header>

    <router-link
      v-if="pendingRequests > 0"
      :to="{ name: 'community' }"
      class="notice"
    >
      <i
        class="pi pi-user-plus"
        aria-hidden="true"
      ></i>
      <span>{{ t('home.pendingRequests', { n: pendingRequests }, pendingRequests) }}</span>
      <i
        class="pi pi-angle-right notice-arrow"
        aria-hidden="true"
      ></i>
    </router-link>

    <!-- Carregando -->
    <div
      v-if="loading"
      class="shelf-skeleton"
      aria-busy="true"
    >
      <Skeleton
        v-for="n in 6"
        :key="n"
        height="260px"
        border-radius="12px"
      />
    </div>

    <!-- Estante vazia: primeiro passo -->
    <section
      v-else-if="isEmpty"
      class="empty-start"
    >
      <img
        src="/bookshelf.png"
        alt=""
        width="96"
        height="96"
      />
      <h2>{{ t('home.emptyTitle') }}</h2>
      <p>{{ t('home.emptyText') }}</p>
      <Button
        :label="t('home.addFirst')"
        icon="pi pi-plus"
        class="btn-action-primary"
        @click="addDialogVisible = true"
      />
      <ul class="tips">
        <li>
          <i
            class="pi pi-search"
            aria-hidden="true"
          ></i>
          <span>{{ t('home.tipIsbn') }}</span>
        </li>
        <li>
          <i
            class="pi pi-check-circle"
            aria-hidden="true"
          ></i>
          <span>{{ t('home.tipRead') }}</span>
        </li>
        <li>
          <i
            class="pi pi-globe"
            aria-hidden="true"
          ></i>
          <span>{{ t('home.tipShare') }}</span>
        </li>
      </ul>
    </section>

    <template v-else>
      <section
        v-if="readingBooks.length"
        class="shelf reading-shelf"
        aria-labelledby="home-reading-title"
      >
        <div class="shelf-head">
          <h2 id="home-reading-title">{{ t('home.readingNow') }}</h2>
          <router-link
            :to="{ name: 'library', query: { status: 'reading' } }"
            class="see-all"
          >{{ t('home.seeReading') }}</router-link>
        </div>
        <div class="shelf-row">
          <BookItem
            v-for="book in readingBooks"
            :key="book.book_id"
            :book="book"
            quick-actions
            @updated="reload"
            @deleted="reload"
          />
        </div>
      </section>

      <section
        class="shelf"
        aria-labelledby="home-recent-title"
      >
        <div class="shelf-head">
          <h2 id="home-recent-title">{{ t('home.recentlyAdded') }}</h2>
          <router-link
            :to="{ name: 'library' }"
            class="see-all"
          >{{ t('home.seeLibrary') }}</router-link>
        </div>
        <div class="shelf-row">
          <BookItem
            v-for="book in recentBooks"
            :key="book.book_id"
            :book="book"
            @updated="reload"
            @deleted="reload"
          />
        </div>
      </section>

      <section
        v-if="readBooks.length"
        class="shelf"
        aria-labelledby="home-read-title"
      >
        <div class="shelf-head">
          <h2 id="home-read-title">{{ t('home.recentlyRead') }}</h2>
          <router-link
            :to="{ name: 'dashboard' }"
            class="see-all"
          >{{ t('home.seeStats') }}</router-link>
        </div>
        <div class="shelf-row">
          <BookItem
            v-for="book in readBooks"
            :key="book.book_id"
            :book="book"
            @updated="reload"
            @deleted="reload"
          />
        </div>
      </section>

      <section
        v-if="recommendations.length"
        class="shelf"
        aria-labelledby="home-recs-title"
      >
        <div class="shelf-head">
          <h2 id="home-recs-title">{{ t('home.recommended') }}</h2>
          <router-link
            :to="{ name: 'community', query: { tab: 'discover' } }"
            class="see-all"
          >{{ t('home.findReaders') }}</router-link>
        </div>
        <div class="shelf-row">
          <div
            v-for="rec in recommendations"
            :key="rec.bookId"
            class="rec-item"
          >
            <BookItem
              :book="{ book_id: rec.bookId, title: rec.title, authors: rec.authors }"
              read-only
              :owner-username="rec.owner"
            />
            <p
              class="rec-reason"
              :title="recReason(rec)"
            >{{ recReason(rec) }}</p>
            <Button
              :label="rec.added ? t('home.recAdded') : t('status.want')"
              :icon="rec.added ? 'pi pi-check' : 'pi pi-bookmark'"
              class="p-button-sm p-button-outlined rec-btn"
              :disabled="rec.added || rec.adding"
              :loading="rec.adding"
              @click="addRecommendation(rec)"
            />
          </div>
        </div>
      </section>

      <section
        v-if="events.length"
        class="activity"
        aria-labelledby="home-activity-title"
      >
        <div class="shelf-head">
          <h2 id="home-activity-title">{{ t('home.community') }}</h2>
          <router-link
            :to="{ name: 'community' }"
            class="see-all"
          >{{ t('home.seeCommunity') }}</router-link>
        </div>
        <ul class="activity-list">
          <li
            v-for="event in events"
            :key="`${event.type}-${event.bookId}-${event.at}`"
          >
            <ReaderAvatar
              :username="event.username"
              size="sm"
              :badge="event.type === 'read' ? 'pi pi-check' : 'pi pi-plus'"
            />
            <span class="activity-text">
              <ReaderName
                :username="event.username"
                :is-public="event.isPublic"
              />
            {{ event.type === 'read' ? t('communityView.event_read') : t('communityView.event_added') }}
              <strong>{{ event.title }}</strong>
            </span>
          </li>
        </ul>
      </section>
    </template>

    <AddBookDialog
      v-model:visible="addDialogVisible"
      @save="reload"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import Button from 'primevue/button'
import Skeleton from 'primevue/skeleton'
import api from '../services/api.js'
import BookItem from '../components/BookItem.vue'
import AddBookDialog from '../components/AddBookDialog.vue'
import ReaderName from '../components/ReaderName.vue'
import ReaderAvatar from '../components/ReaderAvatar.vue'
import { currentUser } from '../services/session.js'
import { pendingRequests } from '../services/social.js'
import { useToast } from 'primevue/usetoast'

const SHELF_SIZE = 6
const ACTIVITY_SIZE = 4

const { t } = useI18n()
const toast = useToast()

const loading = ref(true)
const recentBooks = ref([])
const readBooks = ref([])
const readingBooks = ref([])
const goal = ref(null)
const recommendations = ref([])
const total = ref(0)
const readThisYear = ref(0)
const events = ref([])
const addDialogVisible = ref(false)

const isEmpty = computed(() => !loading.value && total.value === 0)

const greeting = computed(() => {
  const hour = new Date().getHours()
  const key = hour < 5 ? 'home.evening' : hour < 12 ? 'home.morning' : hour < 18 ? 'home.afternoon' : 'home.evening'
  return t(key, { name: currentUser.value?.name ?? '' })
})

const summary = computed(() => {
  if (loading.value || total.value === 0) return ''
  const read = goal.value
    ? t('home.readOfGoal', { n: readThisYear.value, goal: goal.value })
    : t('home.readThisYear', { n: readThisYear.value }, readThisYear.value)
  return `${t('home.totalBooks', { n: total.value }, total.value)} · ${read}`
})

async function reload() {
  try {
    const [recent, read, reading, stats] = await Promise.all([
      api.getBooks({ page: 1, limit: SHELF_SIZE, sort: 'recent', order: 'desc' }),
      api.getBooks({ page: 1, limit: SHELF_SIZE, sort: 'readDate', order: 'desc', readState: 'true' }),
      api.getBooks({ page: 1, limit: SHELF_SIZE, sort: 'recent', order: 'desc', readState: 'reading' }),
      api.getDashboardStats()
    ])
    readingBooks.value = reading.result || []
    goal.value = stats.goal ?? null
    recentBooks.value = recent.result || []
    total.value = recent.total || 0
    readBooks.value = read.result || []
    const year = new Date().getFullYear()
    readThisYear.value = stats.readingByYear?.find(entry => Number(entry.year) === year)?.count ?? 0
  } catch {
    recentBooks.value = []
    readBooks.value = []
    readingBooks.value = []
  } finally {
    loading.value = false
  }
}

async function loadRecommendations() {
  try {
    recommendations.value = (await api.getRecommendations()).map(rec => ({ ...rec, adding: false, added: false }))
  } catch {
    recommendations.value = []
  }
}

function recReason(rec) {
  if (rec.similarReaders > 0) return t('home.recSimilar', { n: rec.similarReaders }, rec.similarReaders)
  return t('home.recPopular', { n: rec.readers }, rec.readers)
}

async function addRecommendation(rec) {
  rec.adding = true
  try {
    await api.wantFromCommunity(rec.bookId)
    rec.added = true
    toast.add({ severity: 'success', summary: t('common.success'), detail: t('home.recAddedToast', { title: rec.title }), life: 3000 })
    reload()
  } catch (error) {
    toast.add({ severity: 'error', summary: t('common.error'), detail: error.message, life: 4000 })
  } finally {
    rec.adding = false
  }
}

async function loadActivity() {
  try {
    const feed = await api.getFeed(1)
    events.value = (feed.events || []).slice(0, ACTIVITY_SIZE)
  } catch {
    events.value = []
  }
}

onMounted(() => {
  reload()
  loadActivity()
  loadRecommendations()
})
</script>

<style scoped>
.home-container {
  width: 100%;
  min-width: 0;
  min-height: 100vh;
  min-height: 100dvh;
  background-color: var(--bg-app);
  color: var(--text-primary);
  padding: 2.5rem 2rem 3rem;
  max-width: 1200px;
  margin: 0 auto;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 2.25rem;
}

.home-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 1rem;
  flex-wrap: wrap;
}

.greeting h1 {
  font-family: var(--font-display);
  font-size: var(--fs-3xl);
  margin: 0;
  line-height: 1.15;
}

.summary {
  margin: 0.5rem 0 0;
  color: var(--text-secondary);
}

.notice {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.85rem 1.1rem;
  border-radius: 10px;
  border: 1px solid rgba(var(--main-color-rgb), 0.35);
  background: rgba(var(--main-color-rgb), 0.08);
  color: var(--text-primary);
  text-decoration: none;
  margin-top: -1rem;
}

.notice .pi-user-plus {
  color: var(--main-color);
}

.notice-arrow {
  margin-left: auto;
  color: var(--text-secondary);
}

.notice:hover {
  background: rgba(var(--main-color-rgb), 0.14);
}

.shelf-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 1rem;
  margin-bottom: 1rem;
}

.shelf-head h2 {
  margin: 0;
  font-size: var(--fs-lg);
  font-weight: 600;
}

.see-all {
  color: var(--main-color);
  text-decoration: none;
  font-size: var(--fs-md);
  white-space: nowrap;
}

.see-all:hover {
  text-decoration: underline;
}

.shelf-row,
.shelf-skeleton {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 1.25rem;
}

.rec-item {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  min-width: 0;
}

.rec-reason {
  margin: 0;
  font-size: var(--fs-xs);
  color: var(--text-secondary);
  line-height: 1.35;
  /* No máximo 2 linhas: os botões das recomendações ficam na mesma altura */
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  overflow: hidden;
}

.rec-btn.p-button {
  margin-top: auto;
  border-radius: 999px;
  justify-content: center;
}

.activity-list {
  list-style: none;
  margin: 0;
  padding: 0;
  background: var(--bg-panel);
  border: 1px solid var(--border-color);
  border-radius: 12px;
}

.activity-list li {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.85rem 1.1rem;
  border-bottom: 1px solid var(--border-color);
  color: var(--text-secondary);
  line-height: 1.45;
}

.activity-list li:last-child {
  border-bottom: none;
}

.activity-list strong {
  color: var(--text-primary);
  font-weight: 600;
}

.empty-start {
  text-align: center;
  max-width: 560px;
  margin: 1rem auto 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
}

.empty-start h2 {
  font-family: var(--font-display);
  font-size: var(--fs-2xl);
  margin: 0.5rem 0 0;
}

.empty-start p {
  margin: 0;
  color: var(--text-secondary);
  line-height: 1.55;
}

.tips {
  list-style: none;
  margin: 1.5rem 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  text-align: left;
  width: 100%;
}

.tips li {
  display: flex;
  gap: 0.85rem;
  align-items: flex-start;
  background: var(--bg-panel);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 0.9rem 1rem;
  color: var(--text-secondary);
  line-height: 1.45;
}

.tips .pi {
  color: var(--main-color);
  margin-top: 0.15rem;
}

@media (max-width: 1100px) {
  .shelf-row,
  .shelf-skeleton {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .shelf-row > :nth-child(n + 5),
  .shelf-skeleton > :nth-child(n + 5) {
    display: none;
  }
}

@media (max-width: 640px) {
  .home-container {
    padding: 1.5rem 1rem 2.5rem;
    gap: 1.75rem;
  }

  .greeting h1 {
    font-size: var(--fs-2xl);
  }

  .add-btn-home {
    width: 100%;
  }

  /* Celular: a estante rola para o lado, como uma prateleira. O contain
     impede que a largura dos livros estique a página inteira. */
  .shelf-row {
    contain: inline-size;
    display: flex;
    overflow-x: auto;
    scroll-snap-type: x mandatory;
    /* Sem isto o snap encosta o primeiro livro na borda da tela */
    scroll-padding-inline: 1rem;
    gap: 0.85rem;
    margin: 0 -1rem;
    padding: 0 1rem 0.5rem;
  }

  .shelf-row > * {
    flex: 0 0 42%;
    scroll-snap-align: start;
  }

  .shelf-row > :nth-child(n + 5) {
    display: flex;
  }

  .shelf-skeleton {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .shelf-skeleton > :nth-child(n + 3) {
    display: none;
  }
}
</style>
