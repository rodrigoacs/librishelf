<template>
  <div class="community-container">
    <div class="community-content">
      <div class="view-header">
        <h1>{{ t('communityView.title') }}</h1>
        <p>{{ t('communityView.subtitle') }}</p>
      </div>

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
        class="tabs"
        role="tablist"
        :aria-label="t('communityView.title')"
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

      <!-- Feed -->
      <section
        v-show="activeTab === 'feed'"
        id="panel-feed"
        role="tabpanel"
        aria-labelledby="tab-feed"
        class="panel"
      >
        <p
          v-if="feedLoading && events.length === 0"
          class="muted"
        >{{ t('common.loading') }}</p>
        <p
          v-else-if="feedError"
          class="muted"
        >{{ t('communityView.load_error') }}</p>
        <div
          v-else-if="events.length === 0"
          class="empty"
        >
          <i
            class="pi pi-globe"
            aria-hidden="true"
          ></i>
          <p>{{ t('communityView.feed_empty') }}</p>
        </div>

        <ul
          v-else
          class="feed-list"
        >
          <li
            v-for="event in events"
            :key="`${event.type}-${event.bookId}-${event.at}`"
            class="feed-item"
          >
            <span
              class="feed-icon"
              :class="event.type"
              aria-hidden="true"
            >
              <i :class="event.type === 'read' ? 'pi pi-check' : 'pi pi-plus'"></i>
            </span>
            <div class="feed-body">
              <p class="feed-text">
                <ReaderName
                  :username="event.username"
                  :is-public="event.isPublic"
                />
                {{ event.type === 'read' ? t('communityView.event_read') : t('communityView.event_added') }}
                <router-link
                  v-if="event.isPublic"
                  :to="{ name: 'public-library', params: { username: event.username }, query: { book: event.bookId } }"
                  class="book-link"
                >{{ event.title }}</router-link>
                <strong v-else>{{ event.title }}</strong>
              </p>
              <p class="feed-meta">
                <span v-if="event.authors">{{ event.authors }} · </span>
                <span>{{ formatDate(event.at) }}</span>
                <StarRating
                  v-if="event.type === 'read' && event.rating"
                  :model-value="event.rating"
                  size="sm"
                  readonly
                  class="feed-rating"
                />
              </p>
            </div>
          </li>
        </ul>

        <div
          v-if="hasMore"
          class="load-more"
        >
          <Button
            :label="t('publicLibrary.loadMore')"
            icon="pi pi-angle-down"
            class="p-button-outlined p-button-secondary"
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
        <p
          v-if="connections.requests.length === 0"
          class="muted"
        >{{ t('communityView.no_requests') }}</p>
        <ul
          v-else
          class="people-list"
        >
          <li
            v-for="person in connections.requests"
            :key="person.username"
          >
            <ReaderName
              :username="person.username"
              :is-public="person.isPublic"
            />
            <div class="actions">
              <Button
                :label="t('communityView.accept')"
                icon="pi pi-check"
                class="p-button-sm btn-action-primary"
                :loading="busy === person.username"
                @click="act(person.username, () => api.acceptRequest(person.username), 'communityView.accepted')"
              />
              <Button
                :label="t('communityView.reject')"
                class="p-button-sm p-button-text p-button-secondary"
                :disabled="busy === person.username"
                @click="act(person.username, () => api.rejectRequest(person.username), 'communityView.rejected')"
              />
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
        <p
          v-if="connections.following.length === 0"
          class="muted"
        >{{ t('communityView.no_following') }}</p>
        <ul
          v-else
          class="people-list"
        >
          <li
            v-for="person in connections.following"
            :key="person.username"
          >
            <ReaderName
              :username="person.username"
              :is-public="person.isPublic"
            />
            <div class="actions">
              <span
                v-if="person.status === 'pending'"
                class="status-pill"
              >{{ t('communityView.pending') }}</span>
              <Button
                :label="person.status === 'pending' ? t('profile.cancel_request') : t('communityView.unfollow')"
                class="p-button-sm p-button-text p-button-secondary"
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
        <p
          v-if="connections.followers.length === 0"
          class="muted"
        >{{ t('communityView.no_followers') }}</p>
        <ul
          v-else
          class="people-list"
        >
          <li
            v-for="person in connections.followers"
            :key="person.username"
          >
            <ReaderName
              :username="person.username"
              :is-public="person.isPublic"
            />
            <div class="actions">
              <Button
                :label="t('communityView.remove')"
                class="p-button-sm p-button-text p-button-danger"
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
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'
import Button from 'primevue/button'
import api from '../services/api.js'
import StarRating from '../components/StarRating.vue'
import ReaderName from '../components/ReaderName.vue'
import { currentUser } from '../services/session.js'
import { refreshPendingRequests } from '../services/social.js'

const { t, locale } = useI18n()
const toast = useToast()
const confirm = useConfirm()
const user = currentUser


const activeTab = ref('feed')
const events = ref([])
const feedPage = ref(0)
const hasMore = ref(false)
const feedLoading = ref(false)
const feedError = ref(false)
const connections = ref({ following: [], followers: [], requests: [] })
const busy = ref('')

const tabs = computed(() => [
  { key: 'feed', label: t('communityView.tab_feed') },
  { key: 'requests', label: t('communityView.tab_requests'), count: connections.value.requests.length },
  { key: 'following', label: t('communityView.tab_following'), count: connections.value.following.length },
  { key: 'followers', label: t('communityView.tab_followers'), count: connections.value.followers.length }
])

function moveTab(step) {
  const keys = tabs.value.map(tab => tab.key)
  const next = keys[(keys.indexOf(activeTab.value) + step + keys.length) % keys.length]
  activeTab.value = next
  document.getElementById(`tab-${next}`)?.focus()
}

function formatDate(value) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(locale.value, { timeZone: 'UTC' })
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

async function loadConnections() {
  try {
    connections.value = await api.getConnections()
  } catch {
    toast.add({ severity: 'error', summary: t('common.error'), detail: t('communityView.load_error'), life: 4000 })
  }
}

async function act(username, request, successKey) {
  busy.value = username
  try {
    await request()
    if (successKey) toast.add({ severity: 'success', summary: t('common.success'), detail: t(successKey, { name: username }), life: 3000 })
    await loadConnections()
    refreshPendingRequests({ force: true })
    loadFeed()
  } catch (error) {
    toast.add({ severity: 'error', summary: t('common.error'), detail: error.message, life: 4000 })
  } finally {
    busy.value = ''
  }
}

function confirmRemove(username) {
  confirm.require({
    message: t('communityView.remove_confirm', { name: username }),
    header: t('bookDialog.confirm'),
    icon: 'pi pi-exclamation-triangle',
    acceptClass: 'p-button-danger',
    rejectClass: 'p-button-text p-button-secondary',
    acceptLabel: t('communityView.remove'),
    rejectLabel: t('common.cancel'),
    accept: () => act(username, () => api.removeFollower(username))
  })
}

onMounted(async () => {
  await Promise.all([loadFeed(), loadConnections()])
  refreshPendingRequests({ force: true })
  if (connections.value.requests.length > 0 && events.value.length === 0) activeTab.value = 'requests'
})
</script>

<style scoped>
.community-container {
  padding: 2rem;
  min-height: 100vh;
  background-color: var(--bg-app);
}

.community-content {
  max-width: 760px;
  margin: 0 auto;
}

.view-header {
  margin-bottom: 1.5rem;
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 1.5rem;
}

.view-header h1 {
  font-family: 'Georgia', serif;
  font-size: 2.5rem;
  color: var(--text-primary);
  margin: 0;
}

.view-header p {
  color: var(--text-secondary);
  margin: 0.5rem 0 0 0;
}

.notice {
  display: flex;
  gap: 0.6rem;
  align-items: flex-start;
  background: var(--bg-panel);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 0.85rem 1rem;
  margin-bottom: 1.25rem;
  color: var(--text-secondary);
  font-size: 0.9rem;
  line-height: 1.45;
}

.notice a {
  color: var(--main-color);
}

.tabs {
  display: flex;
  gap: 0.25rem;
  border-bottom: 1px solid var(--border-color);
  margin-bottom: 1.25rem;
  overflow-x: auto;
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
  outline: 2px solid var(--main-color);
  outline-offset: -2px;
}

.tab-count {
  background: var(--bg-input);
  border-radius: 999px;
  padding: 0 0.45rem;
  font-size: 0.75rem;
}

.panel {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.muted {
  color: var(--text-secondary);
}

.empty {
  text-align: center;
  color: var(--text-secondary);
  padding: 2rem 1rem;
}

.empty .pi {
  font-size: 2rem;
  color: var(--text-muted);
}

.feed-list,
.people-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.feed-item {
  display: flex;
  gap: 0.85rem;
  padding: 0.85rem 0;
  border-bottom: 1px solid var(--border-color);
}

.feed-icon {
  width: 2rem;
  height: 2rem;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background: var(--bg-input);
  color: var(--text-secondary);
}

.feed-icon.read {
  background: rgba(var(--main-color-rgb), 0.15);
  color: var(--main-color);
}

.feed-icon .pi {
  font-size: 0.8rem;
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
  font-size: 0.82rem;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.25rem;
}

.feed-rating {
  margin-left: 0.4rem;
}

.book-link {
  color: var(--main-color);
  text-decoration: none;
  font-weight: 600;
}

.book-link:hover {
  text-decoration: underline;
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

.status-pill {
  font-size: 0.75rem;
  color: var(--text-secondary);
  background: var(--bg-input);
  border-radius: 999px;
  padding: 0.15rem 0.6rem;
}

.load-more {
  display: flex;
  justify-content: center;
}

@media (max-width: 640px) {
  /* As quatro abas cabem na largura do celular, sem rolagem lateral. */
  .tab {
    flex: 1;
    justify-content: center;
    padding: 0.7rem 0.35rem;
    font-size: 0.9rem;
  }

  .community-container {
    padding: 1.25rem;
  }

  .view-header h1 {
    font-size: 2rem;
  }

  .people-list li {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.5rem;
  }
}
</style>