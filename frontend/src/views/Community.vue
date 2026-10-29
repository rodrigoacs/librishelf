<template>
  <div class="community-container">
    <div class="community-content">
      <PageHeader
        :title="t('communityView.title')"
        :subtitle="t('communityView.subtitle')"
        divider
      />

      <div
        v-if="!user?.showActivity"
        class="notice"
        role="note"
      >
        <i
          class="pi pi-info-circle"
          aria-hidden="true"
        ></i>
        <i18n-t
          scope="global"
          keypath="communityView.activity_off"
          tag="span"
        >
          <template #settings>
            <router-link :to="{ name: 'settings' }">{{ t('community.settings_link') }}</router-link>
          </template>
        </i18n-t>
      </div>

      <div
        class="tabs-wrap"
        :class="{ 'fade-start': tabsFade.start, 'fade-end': tabsFade.end }"
      >
        <div
          ref="tabsEl"
          class="tabs"
          role="tablist"
          :aria-label="t('communityView.title')"
          @scroll.passive="updateTabsFade"
        >
          <button
            v-for="tab in tabs"
            :id="`tab-${tab.key}`"
            :key="tab.key"
            type="button"
            role="tab"
            class="tab"
            :class="{ active: activeTab === tab.key }"
            :aria-selected="activeTab === tab.key"
            :aria-controls="`panel-${tab.key}`"
            :tabindex="activeTab === tab.key ? 0 : -1"
            @click="activeTab = tab.key"
            @keydown.right.prevent="moveTab(1)"
            @keydown.left.prevent="moveTab(-1)"
          >
            {{ tab.label }}
            <span
              v-if="tab.count"
              class="tab-count"
            >{{ tab.count }}</span>
          </button>
        </div>
      </div>

      <!-- Feed -->
      <section
        v-show="activeTab === 'feed'"
        id="panel-feed"
        role="tabpanel"
        aria-labelledby="tab-feed"
        class="panel"
      >
        <ul
          v-if="feedLoading && events.length === 0"
          class="feed-list skeleton-list"
          aria-busy="true"
          :aria-label="t('common.loading')"
        >
          <li
            v-for="n in 4"
            :key="n"
            class="feed-item"
          >
            <AppSkeleton
              width="40px"
              height="40px"
              border-radius="50%"
            />
            <div class="feed-body">
              <AppSkeleton
                width="80%"
                height="1rem"
              />
              <AppSkeleton
                width="45%"
                height="0.8rem"
                class="skeleton-gap"
              />
            </div>
            <AppSkeleton
              width="40px"
              height="60px"
              border-radius="var(--radius-sm)"
            />
          </li>
        </ul>
        <EmptyState
          v-else-if="feedError"
          variant="error"
          compact
          :level="3"
          :title="t('communityView.load_error')"
          :loading="feedLoading"
          @action="loadFeed()"
        />
        <EmptyState
          v-else-if="events.length === 0"
          compact
          :level="3"
          icon="pi pi-globe"
          :title="t('communityView.feed_empty_title')"
          :text="t('communityView.feed_empty')"
        />

        <div
          v-else
          class="feed-days"
        >
          <section
            v-for="day in feedDays"
            :key="day.key"
            class="feed-day"
            :aria-label="dayLabel(day.date, { t, locale })"
          >
            <h2 class="day-title">{{ dayLabel(day.date, { t, locale }) }}</h2>
            <ul class="feed-list">
              <li
                v-for="item in day.items"
                :key="item.key"
                class="feed-item"
              >
                <ReaderAvatar
                  :username="item.username"
                  :badge="item.type === 'read' ? 'pi pi-check' : 'pi pi-plus'"
                />
                <div class="feed-body">
                  <p class="feed-text">
                    <ReaderName
                      :username="item.username"
                      :is-public="item.isPublic"
                    />
                    <template v-if="item.books.length === 1">
                      {{ ' ' + (item.type === 'read' ? t(item.books[0].reread ? 'communityView.event_reread' : 'communityView.event_read') : t('communityView.event_added')) + ' ' }}
                      <router-link
                        v-if="item.isPublic"
                        :to="bookLink(item, item.books[0])"
                        class="book-link"
                      >{{ item.books[0].title }}</router-link>
                      <strong v-else>{{ item.books[0].title }}</strong>
                    </template>
                    <template v-else>
                      {{ ' ' + t(item.type === 'read' ? 'communityView.event_read_many' : 'communityView.event_added_many', { n: item.books.length }) }}
                    </template>
                  </p>
                  <p
                    v-if="item.books.length === 1"
                    class="feed-meta"
                  >
                    <span v-if="item.books[0].authors">{{ item.books[0].authors }}</span>
                    <StarRating
                      v-if="item.type === 'read' && item.books[0].rating"
                      :model-value="item.books[0].rating"
                      size="sm"
                      readonly
                      class="feed-rating"
                    />
                  </p>
                  <p
                    v-else
                    class="feed-meta many"
                  >
                    <span
                      v-for="(book, index) in item.books.slice(0, MANY_SHOWN)"
                      :key="book.bookId"
                      class="many-item"
                    ><router-link
                        v-if="item.isPublic"
                        :to="bookLink(item, book)"
                        class="book-link small"
                      >{{ book.title }}</router-link><template v-else>{{ book.title }}</template>{{ index < Math.min(item.books.length, MANY_SHOWN) - 1 ? ', ' : '' }}</span>
                    <span v-if="item.books.length > MANY_SHOWN"> {{ t('communityView.and_more', { n: item.books.length - MANY_SHOWN }) }}</span>
                  </p>
                </div>
                <div
                  class="feed-covers"
                  :class="{ stack: item.books.length > 1 }"
                  aria-hidden="true"
                >
                  <BookCover
                    v-for="book in item.books.slice(0, COVERS_SHOWN)"
                    :key="book.bookId"
                    :book-id="book.bookId"
                    :version="book.coverVersion"
                    :title="book.title"
                    :author="book.authors"
                    class="feed-cover"
                  />
                </div>
              </li>
            </ul>
          </section>
        </div>

        <div
          v-if="hasMore"
          class="load-more"
        >
          <AppButton
            :label="t('publicLibrary.loadMore')"
            icon="pi pi-angle-down"
            class="btn-outlined btn-secondary"
            :loading="feedLoading"
            @click="loadFeed({ append: true })"
          />
        </div>
      </section>

      <!-- Pedidos -->
      <section
        v-show="activeTab === 'requests'"
        id="panel-requests"
        role="tabpanel"
        aria-labelledby="tab-requests"
        class="panel"
      >
        <ul
          v-if="connectionsLoading && !connectionsLoaded"
          class="people-list skeleton-list"
          aria-busy="true"
          :aria-label="t('common.loading')"
        >
          <li
            v-for="n in 3"
            :key="n"
          >
            <span class="person">
              <AppSkeleton
                width="40px"
                height="40px"
                border-radius="50%"
              />
              <AppSkeleton
                width="9rem"
                height="1rem"
              />
            </span>
          </li>
        </ul>
        <EmptyState
          v-else-if="connectionsError"
          variant="error"
          compact
          :level="3"
          :title="t('communityView.load_error')"
          :loading="connectionsLoading"
          @action="loadConnections"
        />
        <EmptyState
          v-else-if="connections.requests.length === 0"
          compact
          :level="3"
          icon="pi pi-user-plus"
          :title="t('communityView.no_requests')"
        />
        <ul
          v-else
          class="people-list"
        >
          <li
            v-for="person in connections.requests"
            :key="person.username"
          >
            <span class="person">
              <ReaderAvatar :username="person.username" />
              <ReaderName
                :username="person.username"
                :is-public="person.isPublic"
              />
            </span>
            <div class="actions">
              <AppButton
                :label="t('communityView.accept')"
                icon="pi pi-check"
                class="btn-sm btn-primary"
                :loading="busy === person.username"
                @click="act(person.username, () => api.acceptRequest(person.username), 'communityView.accepted')"
              />
              <AppButton
                :label="t('communityView.reject')"
                class="btn-sm btn-text btn-secondary"
                :disabled="busy === person.username"
                @click="act(person.username, () => api.rejectRequest(person.username), 'communityView.rejected')"
              />
            </div>
          </li>
        </ul>
      </section>

      <!-- Encontrar leitores -->
      <section
        v-show="activeTab === 'discover'"
        id="panel-discover"
        role="tabpanel"
        aria-labelledby="tab-discover"
        class="panel"
      >
        <div
          class="discover-search"
          role="search"
        >
          <i
            class="pi pi-search"
            aria-hidden="true"
          ></i>
          <label
            for="discover-search"
            class="sr-only"
          >{{ t('discover.search_label') }}</label>
          <input
            id="discover-search"
            v-model="readerQuery"
            type="search"
            class="discover-input"
            :placeholder="t('discover.search_ph')"
            autocomplete="off"
            maxlength="50"
            @input="searchReaders"
          />
        </div>
        <p class="muted small">
          {{ readerQuery.trim() ? t('discover.results_hint') : t('discover.suggest_hint') }}
          <template v-if="!user?.showInCommunity">
            <router-link :to="{ name: 'settings' }">{{ t('discover.join') }}</router-link>
          </template>
        </p>

        <ul
          v-if="readersLoading && readers.length === 0"
          class="people-list skeleton-list"
          aria-busy="true"
          :aria-label="t('common.loading')"
        >
          <li
            v-for="n in 3"
            :key="n"
          >
            <span class="person">
              <AppSkeleton
                width="40px"
                height="40px"
                border-radius="50%"
              />
              <AppSkeleton
                width="9rem"
                height="1rem"
              />
            </span>
          </li>
        </ul>
        <EmptyState
          v-else-if="readersError"
          variant="error"
          compact
          :level="3"
          :title="t('communityView.load_error')"
          @action="loadReaders"
        />
        <EmptyState
          v-else-if="readers.length === 0"
          compact
          :level="3"
          :icon="readerQuery.trim() ? 'pi pi-search' : 'pi pi-users'"
          :title="readerQuery.trim() ? t('discover.none_found') : t('discover.none_yet')"
        />
        <ul
          v-else
          class="people-list"
        >
          <li
            v-for="reader in readers"
            :key="reader.username"
          >
            <span class="person">
              <ReaderAvatar :username="reader.username" />
              <span class="reader-info">
                <ReaderName
                  :username="reader.username"
                  :is-public="true"
                />
                <small class="reader-meta">
                  {{ t('discover.books', { n: reader.totalBooks }, reader.totalBooks) }}
                  <template v-if="reader.commonBooks"> · <strong>{{ t('discover.common', { n: reader.commonBooks }, reader.commonBooks) }}</strong></template>
                </small>
              </span>
            </span>
            <div class="actions">
              <span
                v-if="reader.followStatus === 'accepted'"
                class="status-pill ok"
              >{{ t('discover.following') }}</span>
              <span
                v-else-if="reader.followStatus === 'pending'"
                class="status-pill"
              >{{ t('communityView.pending') }}</span>
              <AppButton
                v-else-if="reader.acceptsFollowers"
                :label="t('discover.follow')"
                icon="pi pi-user-plus"
                class="btn-sm btn-outlined"
                :loading="busy === reader.username"
                @click="followReader(reader)"
              />
              <router-link
                :to="{ name: 'public-library', params: { username: reader.username } }"
                class="see-shelf"
              >{{ t('discover.see_shelf') }}</router-link>
            </div>
          </li>
        </ul>
      </section>

      <!-- Seguindo -->
      <section
        v-show="activeTab === 'following'"
        id="panel-following"
        role="tabpanel"
        aria-labelledby="tab-following"
        class="panel"
      >
        <ul
          v-if="connectionsLoading && !connectionsLoaded"
          class="people-list skeleton-list"
          aria-busy="true"
          :aria-label="t('common.loading')"
        >
          <li
            v-for="n in 3"
            :key="n"
          >
            <span class="person">
              <AppSkeleton
                width="40px"
                height="40px"
                border-radius="50%"
              />
              <AppSkeleton
                width="9rem"
                height="1rem"
              />
            </span>
          </li>
        </ul>
        <EmptyState
          v-else-if="connectionsError"
          variant="error"
          compact
          :level="3"
          :title="t('communityView.load_error')"
          :loading="connectionsLoading"
          @action="loadConnections"
        />
        <EmptyState
          v-else-if="connections.following.length === 0"
          compact
          :level="3"
          icon="pi pi-users"
          :title="t('communityView.no_following')"
        />
        <ul
          v-else
          class="people-list"
        >
          <li
            v-for="person in connections.following"
            :key="person.username"
          >
            <span class="person">
              <ReaderAvatar :username="person.username" />
              <ReaderName
                :username="person.username"
                :is-public="person.isPublic"
              />
            </span>
            <div class="actions">
              <span
                v-if="person.status === 'pending'"
                class="status-pill"
              >{{ t('communityView.pending') }}</span>
              <AppButton
                :label="person.status === 'pending' ? t('profile.cancel_request') : t('communityView.unfollow')"
                class="btn-sm btn-text btn-secondary"
                :loading="busy === person.username"
                @click="act(person.username, () => api.unfollow(person.username))"
              />
            </div>
          </li>
        </ul>
      </section>

      <!-- Seguidores -->
      <section
        v-show="activeTab === 'followers'"
        id="panel-followers"
        role="tabpanel"
        aria-labelledby="tab-followers"
        class="panel"
      >
        <ul
          v-if="connectionsLoading && !connectionsLoaded"
          class="people-list skeleton-list"
          aria-busy="true"
          :aria-label="t('common.loading')"
        >
          <li
            v-for="n in 3"
            :key="n"
          >
            <span class="person">
              <AppSkeleton
                width="40px"
                height="40px"
                border-radius="50%"
              />
              <AppSkeleton
                width="9rem"
                height="1rem"
              />
            </span>
          </li>
        </ul>
        <EmptyState
          v-else-if="connectionsError"
          variant="error"
          compact
          :level="3"
          :title="t('communityView.load_error')"
          :loading="connectionsLoading"
          @action="loadConnections"
        />
        <EmptyState
          v-else-if="connections.followers.length === 0"
          compact
          :level="3"
          icon="pi pi-users"
          :title="t('communityView.no_followers')"
        />
        <ul
          v-else
          class="people-list"
        >
          <li
            v-for="person in connections.followers"
            :key="person.username"
          >
            <span class="person">
              <ReaderAvatar :username="person.username" />
              <ReaderName
                :username="person.username"
                :is-public="person.isPublic"
              />
            </span>
            <div class="actions">
              <AppButton
                :label="t('communityView.remove')"
                class="btn-sm btn-text btn-danger"
                :loading="busy === person.username"
                @click="confirmRemove(person.username)"
              />
            </div>
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>

<script setup>
import PageHeader from '../components/ui/PageHeader.vue'
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useToast } from '../services/toast.js'
import { useConfirm } from '../services/confirm.js'
import AppButton from '../components/ui/AppButton.vue'
import AppSkeleton from '../components/ui/AppSkeleton.vue'
import EmptyState from '../components/ui/EmptyState.vue'
import api from '../services/api.js'
import StarRating from '../components/StarRating.vue'
import ReaderName from '../components/ReaderName.vue'
import ReaderAvatar from '../components/ReaderAvatar.vue'
import BookCover from '../components/BookCover.vue'
import { groupFeed, dayLabel } from '../utils/feedGroups.js'
import { currentUser } from '../services/session.js'
import { refreshPendingRequests } from '../services/social.js'

const { t, locale } = useI18n()
const toast = useToast()
const confirm = useConfirm()
const user = currentUser


const route = useRoute()
// ?tab=discover abre direto em "Encontrar leitores" (link do Início).
const activeTab = ref(['feed', 'discover', 'requests', 'following', 'followers'].includes(route.query.tab) ? route.query.tab : 'feed')
const events = ref([])
const feedPage = ref(0)
const hasMore = ref(false)
const feedLoading = ref(false)
const feedError = ref(false)
const connections = ref({ following: [], followers: [], requests: [] })
const connectionsLoading = ref(true)
const connectionsLoaded = ref(false)
const connectionsError = ref(false)
const busy = ref('')

const tabs = computed(() => [
  { key: 'feed', label: t('communityView.tab_feed') },
  { key: 'discover', label: t('discover.tab') },
  { key: 'requests', label: t('communityView.tab_requests'), count: connections.value.requests.length },
  { key: 'following', label: t('communityView.tab_following'), count: connections.value.following.length },
  { key: 'followers', label: t('communityView.tab_followers'), count: connections.value.followers.length }
])

// Abas que não cabem (celular): degradê na borda que tem mais abas e a aba
// ativa rola para o meio, para "Seguidores" não ficar escondida.
const tabsEl = ref(null)
const tabsFade = ref({ start: false, end: false })

function updateTabsFade() {
  const el = tabsEl.value
  if (!el) return
  const max = el.scrollWidth - el.clientWidth
  tabsFade.value = { start: el.scrollLeft > 4, end: el.scrollLeft < max - 4 }
}

function centerActiveTab(smooth = true) {
  const el = tabsEl.value
  const tab = el?.querySelector('[aria-selected="true"]')
  if (!el || !tab) return
  const left = tab.offsetLeft - (el.clientWidth - tab.offsetWidth) / 2
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  el.scrollTo({ left: Math.max(0, left), behavior: smooth && !reduce ? 'smooth' : 'auto' })
}

watch(activeTab, () => nextTick(() => centerActiveTab()))
// As contagens chegam depois e mudam a largura das abas
watch(connections, () => nextTick(() => {
  centerActiveTab(false)
  updateTabsFade()
}))

onMounted(() => {
  nextTick(() => {
    centerActiveTab(false)
    updateTabsFade()
  })
  window.addEventListener('resize', updateTabsFade)
})

onBeforeUnmount(() => window.removeEventListener('resize', updateTabsFade))

function moveTab(step) {
  const keys = tabs.value.map(tab => tab.key)
  const next = keys[(keys.indexOf(activeTab.value) + step + keys.length) % keys.length]
  activeTab.value = next
  document.getElementById(`tab-${next}`)?.focus()
}

// Feed agrupado por dia, com eventos repetidos juntos
const MANY_SHOWN = 3
const COVERS_SHOWN = 3
const feedDays = computed(() => groupFeed(events.value))

function bookLink(item, book) {
  return { name: 'public-library', params: { username: item.username }, query: { book: book.bookId } }
}

async function loadFeed({ append = false } = {}) {
  feedLoading.value = true
  feedError.value = false
  try {
    const page = append ? feedPage.value + 1 : 1
    const result = await api.getFeed(page)
    events.value = append ? [...events.value, ...result.events] : result.events
    feedPage.value = page
    hasMore.value = result.hasMore
  } catch {
    feedError.value = true
  } finally {
    feedLoading.value = false
  }
}

// --- Encontrar leitores ---
const readerQuery = ref('')
const readers = ref([])
const readersLoading = ref(false)
const readersError = ref(false)
let readersLoaded = false
let searchTimer = null
let searchRequest = 0

async function loadReaders() {
  const current = ++searchRequest
  readersLoading.value = true
  readersError.value = false
  try {
    const result = await api.findReaders(readerQuery.value.trim())
    if (current === searchRequest) readers.value = result
  } catch {
    // Falha não é "ninguém encontrado": mostra o erro com "Tentar de novo"
    if (current === searchRequest) {
      readers.value = []
      readersError.value = true
    }
  } finally {
    if (current === searchRequest) readersLoading.value = false
    readersLoaded = true
  }
}

function searchReaders() {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(loadReaders, 300)
}

async function followReader(reader) {
  busy.value = reader.username
  try {
    const result = await api.follow(reader.username)
    reader.followStatus = result?.status ?? 'pending'
    toast.add({ severity: 'success', detail: t('discover.requested', { name: reader.username }), life: 3000 })
    loadConnections()
  } catch (error) {
    toast.add({ severity: 'error', detail: error.message, life: 4000 })
  } finally {
    busy.value = ''
  }
}

watch(activeTab, tab => {
  if (tab === 'discover' && !readersLoaded) loadReaders()
})

async function loadConnections() {
  connectionsLoading.value = true
  try {
    connections.value = await api.getConnections()
    connectionsLoaded.value = true
    connectionsError.value = false
  } catch {
    // Sem nada carregado: erro na própria aba (antes, só um toast e a aba
    // dizia "ninguém"); com dados na tela, mantém e avisa
    if (connectionsLoaded.value) toast.add({ severity: 'error', detail: t('communityView.load_error'), life: 4000 })
    else connectionsError.value = true
  } finally {
    connectionsLoading.value = false
  }
}

async function act(username, request, successKey) {
  busy.value = username
  try {
    await request()
    if (successKey) toast.add({ severity: 'success', detail: t(successKey, { name: username }), life: 3000 })
    await loadConnections()
    refreshPendingRequests({ force: true })
    loadFeed()
  } catch (error) {
    toast.add({ severity: 'error', detail: error.message, life: 4000 })
  } finally {
    busy.value = ''
  }
}

function confirmRemove(username) {
  confirm.require({
    message: t('communityView.remove_confirm', { name: username }),
    header: t('bookDialog.confirm'),
    icon: 'pi pi-exclamation-triangle',
    acceptClass: 'btn-danger',
    rejectClass: 'btn-text btn-secondary',
    acceptLabel: t('communityView.remove'),
    rejectLabel: t('common.cancel'),
    accept: () => act(username, () => api.removeFollower(username))
  })
}

onMounted(async () => {
  await Promise.all([loadFeed(), loadConnections()])
  refreshPendingRequests({ force: true })
  if (activeTab.value === 'discover') loadReaders()
  else if (connections.value.requests.length > 0 && events.value.length === 0) activeTab.value = 'requests'
})
</script>

<style scoped>
.community-container {
  padding: 2rem;
  min-height: 100vh;
  min-height: 100dvh;
  background-color: var(--bg-app);
}

.community-content {
  max-width: 760px;
  margin: 0 auto;
}

.notice {
  display: flex;
  gap: 0.6rem;
  align-items: flex-start;
  background: var(--bg-panel);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: 0.85rem 1rem;
  margin-bottom: 1.25rem;
  color: var(--text-secondary);
  font-size: var(--fs-md);
  line-height: 1.45;
}

.notice a {
  color: var(--main-color);
}

.tabs-wrap {
  position: relative;
  margin-bottom: 1.25rem;
}

.tabs-wrap::before,
.tabs-wrap::after {
  content: '';
  position: absolute;
  top: 0;
  bottom: 1px;
  width: 2.5rem;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.15s ease;
  z-index: 1;
}

.tabs-wrap::before {
  left: 0;
  background: linear-gradient(to right, var(--bg-app), transparent);
}

.tabs-wrap::after {
  right: 0;
  background: linear-gradient(to left, var(--bg-app), transparent);
}

.tabs-wrap.fade-start::before,
.tabs-wrap.fade-end::after {
  opacity: 1;
}

.tabs {
  display: flex;
  gap: 0.25rem;
  border-bottom: 1px solid var(--border-color);
  overflow-x: auto;
  scrollbar-width: none;
}

.tabs::-webkit-scrollbar {
  display: none;
}

.tab {
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  padding: 0.7rem 1rem;
  color: var(--text-secondary);
  font: inherit;
  font-weight: 500;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  white-space: nowrap;
}

.tab.active {
  color: var(--text-primary);
  border-bottom-color: var(--main-color);
}

.tab:focus-visible {
  outline: var(--focus-ring);
  outline-offset: -2px;
}

.tab-count {
  background: var(--bg-input);
  border-radius: var(--radius-pill);
  padding: 0 0.45rem;
  font-size: var(--fs-xs);
}

.panel {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.muted {
  color: var(--text-secondary);
}

.skeleton-gap {
  margin-top: 0.45rem;
}

.feed-list,
.people-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.feed-days {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.day-title {
  margin: 0 0 0.25rem;
  font-size: var(--fs-xs);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-muted);
}

.feed-item {
  display: flex;
  align-items: flex-start;
  gap: 0.85rem;
  padding: 0.85rem 0;
  border-bottom: 1px solid var(--border-color);
}

.feed-item:last-child {
  border-bottom: none;
}

.feed-body {
  flex: 1;
}

.feed-covers {
  display: flex;
  flex-shrink: 0;
}

.feed-cover {
  width: 40px;
  box-shadow: var(--shadow-2);
}

/* Vários livros: capas sobrepostas, como uma pilha */
.feed-covers.stack .feed-cover + .feed-cover {
  margin-left: -22px;
}

.feed-covers.stack .feed-cover {
  border: 2px solid var(--bg-app);
}

.feed-cover :deep(.title) {
  font-size: 0;
}

.person {
  display: inline-flex;
  align-items: center;
  gap: 0.7rem;
  min-width: 0;
}

.feed-body {
  min-width: 0;
}

.feed-text {
  margin: 0;
  color: var(--text-primary);
  line-height: 1.45;
}

.feed-meta {
  margin: 0.2rem 0 0;
  color: var(--text-secondary);
  font-size: var(--fs-sm);
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.25rem;
}

.feed-rating {
  margin-left: 0.4rem;
}

/* Título do livro em texto forte (o @nome já é o link colorido) */
.book-link {
  color: var(--text-primary);
  text-decoration: none;
  font-weight: 600;
}

.book-link:hover {
  color: var(--main-color);
  text-decoration: underline;
}

.feed-meta.many {
  display: block;
}

.many-item {
  white-space: normal;
}

.book-link.small {
  font-weight: 500;
  color: var(--text-secondary);
}

.people-list li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  padding: 0.75rem 0;
  border-bottom: 1px solid var(--border-color);
}

.actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.status-pill.ok {
  color: var(--main-color);
  background: rgba(var(--main-color-rgb), 0.12);
}

.discover-search {
  position: relative;
  margin-bottom: 0.5rem;
}

.discover-search .pi {
  position: absolute;
  left: 1rem;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-muted);
}

.discover-input {
  width: 100%;
  box-sizing: border-box;
  background-color: var(--bg-input);
  border: 1px solid var(--border-color);
  padding: 0.8rem 1rem 0.8rem 2.6rem;
  border-radius: var(--radius-md);
  color: var(--text-primary);
  font: inherit;
}

.discover-input:focus {
  border-color: var(--main-color);
  outline: none;
}

.muted.small {
  font-size: var(--fs-sm);
  margin: 0 0 1rem;
}

.reader-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.reader-meta {
  color: var(--text-secondary);
  font-size: var(--fs-sm);
}

.reader-meta strong {
  color: var(--main-color);
  font-weight: 600;
}

.see-shelf {
  color: var(--text-secondary);
  font-size: var(--fs-sm);
  white-space: nowrap;
}

.see-shelf:hover {
  color: var(--text-primary);
}

.status-pill {
  font-size: var(--fs-xs);
  color: var(--text-secondary);
  background: var(--bg-input);
  border-radius: var(--radius-pill);
  padding: 0.15rem 0.6rem;
}

.load-more {
  display: flex;
  justify-content: center;
}

@media (max-width: 639.98px) {
  /* Cinco abas: no celular a fileira rola para o lado (sem esticar a página). */
  .tabs {
    contain: inline-size;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .tabs::-webkit-scrollbar {
    display: none;
  }

  .tab {
    flex: 0 0 auto;
    justify-content: center;
    padding: 0.7rem 0.6rem;
    font-size: var(--fs-md);
  }

  .community-container {
    padding: 1.25rem;
  }

  .people-list li {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.5rem;
  }
}
</style>