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
      <AppButton
        v-if="!isEmpty && !loadError"
        :label="t('home.addBook')"
        icon="pi pi-plus"
        class="btn-primary add-btn-home"
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

    <router-link
      v-if="readThisYear > 0"
      :to="{ name: 'year' }"
      class="notice year-notice"
    >
      <i
        class="pi pi-sparkles"
        aria-hidden="true"
      ></i>
      <span>{{ t('home.yearInBooks', { year: new Date().getFullYear(), n: readThisYear }, readThisYear) }}</span>
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
      <AppSkeleton
        v-for="n in 6"
        :key="n"
        height="260px"
        border-radius="12px"
      />
    </div>

    <!-- Falha ao carregar: não confundir com estante vazia -->
    <div
      v-else-if="loadError"
      class="error-state"
      role="alert"
    >
      <i
        class="pi pi-exclamation-triangle"
        aria-hidden="true"
      ></i>
      <p>{{ t('home.loadError') }}</p>
      <AppButton
        :label="t('common.retry')"
        icon="pi pi-refresh"
        class="btn-outlined btn-secondary"
        :loading="retrying"
        @click="retry"
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
      <AppButton
        :label="t('home.addFirst')"
        icon="pi pi-plus"
        class="btn-primary"
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
        class="shelf reading-shelf"
        aria-labelledby="home-reading-title"
      >
        <div class="shelf-head">
          <h2 id="home-reading-title">{{ t('home.readingNow') }}</h2>
          <router-link
            v-if="readingTotal > READING_SHOWN"
            :to="{ name: 'library', query: { status: 'reading' } }"
            class="see-all"
          >{{ t('home.seeReading') }}</router-link>
        </div>

        <div
          v-if="readingBooks.length"
          class="reading-grid"
        >
          <ReadingNowCard
            v-for="book in readingBooks.slice(0, READING_SHOWN)"
            :key="book.book_id"
            :book="book"
            @updated="reload"
          />
        </div>

        <!-- Nada em "Lendo": um convite em vez da seção sumir -->
        <form
          v-else
          class="reading-invite"
          role="search"
          @submit.prevent="searchLibrary"
        >
          <i
            class="pi pi-book invite-icon"
            aria-hidden="true"
          ></i>
          <div class="invite-body">
            <h3>{{ t('home.inviteTitle') }}</h3>
            <p>{{ t('home.inviteText') }}</p>
            <div class="invite-search">
              <label
                for="home-invite-search"
                class="sr-only"
              >{{ t('library.search_label') }}</label>
              <input
                id="home-invite-search"
                v-model="inviteSearch"
                type="search"
                class="invite-input"
                :placeholder="t('library.search_ph')"
                autocomplete="off"
              />
              <AppButton
                type="submit"
                :label="t('common.search')"
                icon="pi pi-search"
                :aria-label="t('common.search')"
                class="btn-primary invite-btn"
              />
            </div>
            <router-link
              :to="{ name: 'library', query: { status: 'want' } }"
              class="invite-link"
            >{{ t('home.inviteWant') }}</router-link>
          </div>
        </form>
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
              :book="{ book_id: rec.bookId, title: rec.title, authors: rec.authors, cover_version: rec.coverVersion }"
              read-only
              :owner-username="rec.owner"
            />
            <p
              class="rec-reason"
              :title="recReason(rec)"
            >{{ recReason(rec) }}</p>
            <AppButton
              :label="rec.added ? t('home.recAdded') : t('status.want')"
              :icon="rec.added ? 'pi pi-check' : 'pi pi-bookmark'"
              class="btn-sm btn-outlined rec-btn"
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
            {{ event.type === 'read' ? t(event.reread ? 'communityView.event_reread' : 'communityView.event_read') : t('communityView.event_added') }}
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
import AppButton from '../components/ui/AppButton.vue'
import AppSkeleton from '../components/ui/AppSkeleton.vue'
import api from '../services/api.js'
import BookItem from '../components/BookItem.vue'
import ReadingNowCard from '../components/ReadingNowCard.vue'
import AddBookDialog from '../components/AddBookDialog.vue'
import ReaderName from '../components/ReaderName.vue'
import ReaderAvatar from '../components/ReaderAvatar.vue'
import { currentUser } from '../services/session.js'
import { pendingRequests } from '../services/social.js'
import { useToast } from '../services/toast.js'
import { useRouter } from 'vue-router'
import { holdScroll } from '../services/scrollRestore.js'

const SHELF_SIZE = 6
// "Lendo agora" em destaque: até 3 cards grandes
const READING_SHOWN = 3
const ACTIVITY_SIZE = 4

const { t } = useI18n()
const toast = useToast()
const router = useRouter()

const loading = ref(true)
const recentBooks = ref([])
const readingBooks = ref([])
const readingTotal = ref(0)
const inviteSearch = ref('')
const goal = ref(null)
const recommendations = ref([])
const total = ref(0)
const readThisYear = ref(0)
const events = ref([])
const addDialogVisible = ref(false)
const loadError = ref(false)
const retrying = ref(false)

// Só é "vazia" se a estante carregou; falha de rede ou 500 mostra o erro
const isEmpty = computed(() => !loading.value && !loadError.value && total.value === 0)

const greeting = computed(() => {
  const hour = new Date().getHours()
  const key = hour < 5 ? 'home.evening' : hour < 12 ? 'home.morning' : hour < 18 ? 'home.afternoon' : 'home.evening'
  return t(key, { name: currentUser.value?.name ?? '' })
})

const summary = computed(() => {
  if (loading.value || loadError.value || total.value === 0) return ''
  let read
  if (!goal.value) read = t('home.readThisYear', { n: readThisYear.value }, readThisYear.value)
  else if (readThisYear.value >= goal.value) read = t('home.goalDone', { n: readThisYear.value, goal: goal.value })
  else read = t('home.readOfGoal', { n: readThisYear.value, goal: goal.value })
  return `${t('home.totalBooks', { n: total.value }, total.value)} · ${read}`
})

async function reload() {
  try {
    const [recent, reading, stats] = await Promise.all([
      api.getBooks({ page: 1, limit: SHELF_SIZE, sort: 'recent', order: 'desc' }),
      api.getBooks({ page: 1, limit: READING_SHOWN, sort: 'recent', order: 'desc', readState: 'reading' }),
      api.getDashboardStats()
    ])
    readingBooks.value = reading.result || []
    readingTotal.value = reading.total || 0
    goal.value = stats.goal ?? null
    recentBooks.value = recent.result || []
    total.value = recent.total || 0
    const year = new Date().getFullYear()
    readThisYear.value = stats.readingByYear?.find(entry => Number(entry.year) === year)?.count ?? 0
    loadError.value = false
  } catch {
    // Mantém o que já estava na tela; sem nada carregado, mostra o erro
    if (!recentBooks.value.length && !readingBooks.value.length) loadError.value = true
  } finally {
    loading.value = false
  }
}

async function retry() {
  retrying.value = true
  await reload()
  retrying.value = false
}

function searchLibrary() {
  const q = inviteSearch.value.trim()
  router.push({ name: 'library', query: q ? { q } : {} })
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

onMounted(async () => {
  // Voltar para o Início devolve a rolagem só depois de tudo carregar
  // (services/scrollRestore.js); antes parava perto do topo.
  const release = holdScroll()
  try {
    await Promise.all([reload(), loadActivity(), loadRecommendations()])
  } finally {
    release()
  }
})
</script>

<style scoped>
.error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  padding: 4rem 1rem;
  color: var(--text-muted);
  text-align: center;
}

.error-state > i {
  font-size: var(--fs-3xl);
}

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

.notice .pi-user-plus,
.notice .pi-sparkles {
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

.reading-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 1rem;
}

.reading-invite {
  display: flex;
  gap: 1.25rem;
  align-items: flex-start;
  padding: 1.5rem;
  background: var(--bg-panel);
  border: 1px dashed var(--border-hover);
  border-radius: 14px;
}

.invite-icon {
  font-size: var(--fs-2xl);
  color: var(--main-color);
  margin-top: 0.15rem;
}

.invite-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.invite-body h3 {
  margin: 0;
  font-family: var(--font-display);
  font-size: var(--fs-lg);
}

.invite-body p {
  margin: 0;
  color: var(--text-secondary);
  font-size: var(--fs-sm);
}

.invite-search {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.35rem;
  max-width: 520px;
}

.invite-input {
  flex: 1;
  min-width: 0;
  height: 2.75rem;
  padding: 0 1rem;
  border: 1px solid transparent;
  border-radius: 10px;
  background: var(--bg-input);
  color: var(--text-primary);
  font: inherit;
  font-size: var(--fs-md);
}

.invite-input:focus {
  outline: none;
  border-color: var(--main-color);
  box-shadow: 0 0 0 3px rgba(var(--main-color-rgb), 0.18);
}

.invite-input::placeholder {
  color: var(--text-muted);
}

.invite-btn.btn {
  height: 2.75rem;
  border-radius: 10px;
  flex-shrink: 0;
}

.invite-link {
  align-self: flex-start;
  color: var(--main-color);
  font-size: var(--fs-sm);
  font-weight: 600;
  text-decoration: none;
}

.invite-link:hover {
  text-decoration: underline;
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

.rec-btn.btn {
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

  .reading-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .reading-invite {
    flex-direction: column;
    gap: 0.75rem;
    padding: 1.25rem;
  }

  .invite-btn :deep(.btn-label) {
    display: none;
  }

  .invite-btn.btn {
    width: 2.75rem;
    padding: 0;
    justify-content: center;
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
