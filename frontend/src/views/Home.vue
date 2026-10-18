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

const SHELF_SIZE = 6
const ACTIVITY_SIZE = 4

const { t } = useI18n()

const loading = ref(true)
const recentBooks = ref([])
const readBooks = ref([])
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
  return `${t('home.totalBooks', { n: total.value }, total.value)} · ${t('home.readThisYear', { n: readThisYear.value }, readThisYear.value)}`
})

async function reload() {
  try {
    const [recent, read, stats] = await Promise.all([
      api.getBooks({ page: 1, limit: SHELF_SIZE, sort: 'recent', order: 'desc' }),
      api.getBooks({ page: 1, limit: SHELF_SIZE, sort: 'readDate', order: 'desc', readState: 'true' }),
      api.getDashboardStats()
    ])
    recentBooks.value = recent.result || []
    total.value = recent.total || 0
    readBooks.value = read.result || []
    const year = new Date().getFullYear()
    readThisYear.value = stats.readingByYear?.find(entry => Number(entry.year) === year)?.count ?? 0
  } catch {
    recentBooks.value = []
    readBooks.value = []
  } finally {
    loading.value = false
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
})
</script>

<style scoped>
.home-container {
  width: 100%;
  min-width: 0;
  min-height: 100vh;
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
  font-family: 'Georgia', serif;
  font-size: 2.4rem;
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
  font-size: 1.25rem;
  font-weight: 600;
}

.see-all {
  color: var(--main-color);
  text-decoration: none;
  font-size: 0.9rem;
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
  font-family: 'Georgia', serif;
  font-size: 1.8rem;
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
    font-size: 1.8rem;
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
