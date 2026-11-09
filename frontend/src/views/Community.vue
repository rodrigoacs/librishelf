<template>
  <div class="page community-container">
    <PullRefresh :state="pull" />
    <PageHeader
      :title="t('communityView.title')"
      :subtitle="t('communityView.subtitle')"
      divider
    />
    <div class="community-content">

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

      <AppTabs
        v-model="activeTab"
        :tabs="tabs"
        :label="t('communityView.title')"
      />

      <section
        v-show="activeTab === 'feed'"
        id="panel-feed"
        role="tabpanel"
        aria-labelledby="tab-feed"
        class="panel"
      >
        <CommunityFeed ref="feed" />
      </section>

      <section
        v-show="activeTab === 'requests'"
        id="panel-requests"
        role="tabpanel"
        aria-labelledby="tab-requests"
        class="panel"
      >
        <PeopleList
          v-bind="connectionsState"
          :people="connections.requests"
          empty-icon="pi pi-user-plus"
          :empty-title="t('communityView.no_requests')"
          @retry="loadConnections"
        >
          <template #actions="{ person }">
            <AppButton
              :label="t('communityView.accept')"
              icon="pi pi-check"
              class="btn-sm btn-primary"
              :loading="busy === person.username"
              @click="act(person.username, () => api.acceptRequest(person.username), 'communityView.accepted')"
            />
            <AppButton
              :label="t('communityView.reject')"
              class="btn-sm btn-outlined btn-secondary"
              :disabled="busy === person.username"
              @click="act(person.username, () => api.rejectRequest(person.username), 'communityView.rejected')"
            />
          </template>
        </PeopleList>
      </section>

      <section
        v-show="activeTab === 'discover'"
        id="panel-discover"
        role="tabpanel"
        aria-labelledby="tab-discover"
        class="panel"
      >
        <CommunityDiscover
          :active="activeTab === 'discover'"
          @followed="loadConnections"
        />
      </section>

      <section
        v-show="activeTab === 'following'"
        id="panel-following"
        role="tabpanel"
        aria-labelledby="tab-following"
        class="panel"
      >
        <PeopleList
          v-bind="connectionsState"
          :people="connections.following"
          empty-icon="pi pi-users"
          :empty-title="t('communityView.no_following')"
          @retry="loadConnections"
        >
          <template #actions="{ person }">
            <span
              v-if="person.status === 'pending'"
              class="status-pill"
            >{{ t('communityView.pending') }}</span>
            <AppButton
              :label="person.status === 'pending' ? t('profile.cancel_request') : t('communityView.unfollow')"
              class="btn-sm btn-outlined btn-secondary"
              :loading="busy === person.username"
              @click="act(person.username, () => api.unfollow(person.username))"
            />
          </template>
        </PeopleList>
      </section>

      <section
        v-show="activeTab === 'followers'"
        id="panel-followers"
        role="tabpanel"
        aria-labelledby="tab-followers"
        class="panel"
      >
        <PeopleList
          v-bind="connectionsState"
          :people="connections.followers"
          empty-icon="pi pi-users"
          :empty-title="t('communityView.no_followers')"
          @retry="loadConnections"
        >
          <template #actions="{ person }">
            <AppButton
              :label="t('communityView.remove')"
              class="btn-sm btn-outlined btn-danger"
              :loading="busy === person.username"
              @click="confirmRemove(person.username)"
            />
          </template>
        </PeopleList>
      </section>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useToast } from '../services/toast.js'
import { useConfirm } from '../services/confirm.js'
import api from '../services/api.js'
import { currentUser as user } from '../services/session.js'
import { refreshPendingRequests } from '../services/social.js'
import { usePullToRefresh } from '../composables/usePullToRefresh.js'
import PageHeader from '../components/ui/PageHeader.vue'
import PullRefresh from '../components/ui/PullRefresh.vue'
import AppTabs from '../components/ui/AppTabs.vue'
import AppButton from '../components/ui/AppButton.vue'
import CommunityFeed from '../components/community/CommunityFeed.vue'
import CommunityDiscover from '../components/community/CommunityDiscover.vue'
import PeopleList from '../components/community/PeopleList.vue'

const { t } = useI18n()
const toast = useToast()
const confirm = useConfirm()

const route = useRoute()
// ?tab=discover abre direto em "Encontrar leitores" (link do Início).
const activeTab = ref(['feed', 'discover', 'requests', 'following', 'followers'].includes(route.query.tab) ? route.query.tab : 'feed')
const feed = ref(null)
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

// As três abas de conexões carregam juntas (uma chamada só)
const connectionsState = computed(() => ({
  skeleton: connectionsLoading.value && !connectionsLoaded.value,
  error: connectionsError.value,
  retrying: connectionsLoading.value
}))

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
    feed.value.load()
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

// Puxar para atualizar (celular): feed, pedidos e quem segue
const pull = usePullToRefresh(async () => {
  await Promise.all([feed.value.load(), loadConnections()])
  refreshPendingRequests({ force: true })
})

onMounted(async () => {
  await Promise.all([feed.value.load(), loadConnections()])
  refreshPendingRequests({ force: true })
  if (activeTab.value !== 'discover' && connections.value.requests.length > 0 && feed.value.isEmpty) activeTab.value = 'requests'
})
</script>

<style scoped>
/* Visual do aviso em main.css (.notice) */
.notice {
  margin: 0 0 var(--space-5);
}

.panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}
</style>
