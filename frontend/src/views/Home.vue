<template>
  <div class="home-container">
    <PageHeader :title="greeting">
      <template #subtitle>
        <p
          v-if="summary"
          class="summary"
        >{{ summary }}</p>
        <!-- Linha do resumo reservada enquanto carrega (sem empurrar a página) -->
        <AppSkeleton
          v-else-if="loading"
          class="summary summary-skeleton"
          width="16rem"
          height="1.1rem"
        />
      </template>
      <template
        v-if="!isEmpty && !loadError"
        #actions
      >
        <AppButton
          :label="t('home.addBook')"
          icon="pi pi-plus"
          class="btn-primary add-btn-home"
          @click="addDialogVisible = true"
        />
      </template>
    </PageHeader>

    <!-- Avisos entram junto com o conteúdo, não por cima do esqueleto -->
    <router-link
      v-if="!loading && pendingRequests > 0"
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

    <!-- Carregando: o mesmo desenho das seções (Lendo agora + estante) -->
    <div
      v-if="loading"
      class="home-skeleton"
      aria-busy="true"
      :aria-label="t('common.loading')"
    >
      <div class="shelf">
        <div class="shelf-head">
          <AppSkeleton
            width="9rem"
            height="1.4rem"
          />
        </div>
        <AppSkeleton
          class="reading-skeleton"
          height="auto"
          border-radius="var(--radius-md)"
        />
      </div>
      <div class="shelf">
        <div class="shelf-head">
          <AppSkeleton
            width="11rem"
            height="1.4rem"
          />
        </div>
        <div class="shelf-skeleton">
          <div
            v-for="n in 6"
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
      </div>
    </div>

    <!-- Falha ao carregar: não confundir com estante vazia -->
    <EmptyState
      v-else-if="loadError"
      variant="error"
      :title="t('home.loadErrorTitle')"
      :text="t('home.loadError')"
      :loading="retrying"
      @action="retry"
    />

    <!-- Estante vazia: primeiro passo -->
    <EmptyState
      v-else-if="isEmpty"
      class="empty-start"
      :title="t('home.emptyTitle')"
      :text="t('home.emptyText')"
      :action-label="t('home.addFirst')"
      action-icon="pi pi-plus"
      @action="addDialogVisible = true"
    >
      <template #media>
        <img
          src="/bookshelf.png"
          alt=""
          width="96"
          height="96"
        />
      </template>
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
    </EmptyState>

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
import PageHeader from '../components/ui/PageHeader.vue'
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import AppButton from '../components/ui/AppButton.vue'
import AppSkeleton from '../components/ui/AppSkeleton.vue'
import EmptyState from '../components/ui/EmptyState.vue'
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
    toast.add({ severity: 'success', detail: t('home.recAddedToast', { title: rec.title }), life: 3000 })
    reload()
  } catch (error) {
    toast.add({ severity: 'error', detail: error.message, life: 4000 })
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

.summary {
  margin: 0;
  color: var(--text-secondary);
}

/* O espaço até o conteúdo já vem do gap do .home-container */
.home-container > .page-header {
  margin-bottom: 0;
}

.notice {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.85rem 1.1rem;
  border-radius: var(--radius-md);
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

/* Esqueleto com as medidas das seções reais: card de "Lendo agora" e livros
   com capa 2:3 + título e autor (antes, blocos de 260px que trocavam de altura) */
.home-skeleton {
  display: flex;
  flex-direction: column;
  gap: 2.25rem;
}

.reading-skeleton {
  height: 219px !important;
  max-width: 560px;
}

.book-skeleton {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  min-width: 0;
}

.cover-skeleton {
  aspect-ratio: 2 / 3;
  height: auto !important;
  margin-bottom: 0.4rem;
}

.summary-skeleton {
  max-width: 100%;
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
  border-radius: var(--radius-lg);
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
  border-radius: var(--radius-md);
  background: var(--bg-input);
  color: var(--text-primary);
  font: inherit;
  font-size: var(--fs-md);
}

.invite-input:focus {
  outline: none;
  border-color: var(--main-color);
  box-shadow: var(--focus-glow);
}

.invite-input::placeholder {
  color: var(--text-muted);
}

.invite-btn.btn {
  height: 2.75rem;
  border-radius: var(--radius-md);
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
  border-radius: var(--radius-pill);
  justify-content: center;
}

.activity-list {
  list-style: none;
  margin: 0;
  padding: 0;
  background: var(--bg-panel);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
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
  max-width: 560px;
  width: 100%;
  margin: 0 auto;
  min-height: 0;
  padding-top: 1rem;
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
  border-radius: var(--radius-md);
  padding: 0.9rem 1rem;
  color: var(--text-secondary);
  line-height: 1.45;
}

.tips .pi {
  color: var(--main-color);
  margin-top: 0.15rem;
}

@media (max-width: 1279.98px) {
  .shelf-row,
  .shelf-skeleton {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .shelf-row > :nth-child(n + 5),
  .shelf-skeleton > :nth-child(n + 5) {
    display: none;
  }
}

@media (max-width: 639.98px) {
  .home-container {
    padding: 1.5rem 1rem 2.5rem;
    gap: 1.75rem;
  }

  .home-container > .page-header :deep(.page-header-actions),
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

  /* Como a estante do celular: uma fileira que continua para o lado */
  .shelf-skeleton {
    display: flex;
    overflow: hidden;
    gap: 0.85rem;
  }

  .shelf-skeleton > * {
    flex: 0 0 42%;
  }

  .shelf-skeleton > :nth-child(n + 5) {
    display: flex;
  }

  .home-skeleton {
    gap: 1.75rem;
  }

  .reading-skeleton {
    height: 239px !important;
  }

  .shelf-skeleton > :nth-child(n + 3) {
    display: none;
  }
}
</style>
