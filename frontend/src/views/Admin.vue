<template>
  <div class="admin-container">
    <div class="header-section">
      <div class="welcome-text">
        <h1>{{ t('admin.title') }}</h1>
        <p>{{ t('admin.subtitle') }}</p>
      </div>
      <AppButton
        v-if="state === 'unlocked'"
        :label="t('admin.lock')"
        icon="pi pi-lock"
        class="btn-outlined btn-secondary btn-sm"
        :loading="locking"
        @click="lock"
      />
    </div>

    <div
      v-if="state === 'loading'"
      class="loading"
      role="status"
    >
      <i
        class="pi pi-spinner pi-spin"
        aria-hidden="true"
      ></i>
      {{ t('common.loading') }}
    </div>

    <section
      v-else-if="state === 'locked'"
      class="unlock-card"
      aria-labelledby="admin-unlock-title"
    >
      <div
        class="unlock-icon"
        aria-hidden="true"
      ><i class="pi pi-shield"></i></div>
      <h2 id="admin-unlock-title">{{ t('admin.unlock.title') }}</h2>
      <p class="muted">{{ t('admin.unlock.description', { minutes }) }}</p>
      <form
        class="stack"
        novalidate
        @submit.prevent="unlock"
      >
        <PasswordField
          id="admin-unlock-password"
          ref="passwordField"
          v-model="password"
          :label="t('admin.unlock.password')"
          autocomplete="current-password"
          :error="unlockError"
        />
        <AppButton
          type="submit"
          :label="t('admin.unlock.submit')"
          icon="pi pi-unlock"
          class="w-full"
          :loading="unlocking"
        />
      </form>
    </section>

    <template v-else>
      <div
        class="tabs"
        role="tablist"
        :aria-label="t('admin.title')"
      >
        <button
          v-for="tab in tabs"
          :id="`admin-tab-${tab.key}`"
          :key="tab.key"
          type="button"
          role="tab"
          class="tab"
          :class="{ active: activeTab === tab.key }"
          :aria-selected="activeTab === tab.key"
          :aria-controls="`admin-panel-${tab.key}`"
          :tabindex="activeTab === tab.key ? 0 : -1"
          @click="selectTab(tab.key)"
          @keydown.right.prevent="moveTab(1)"
          @keydown.left.prevent="moveTab(-1)"
        >
          <i
            :class="tab.icon"
            aria-hidden="true"
          ></i>
          {{ tab.label }}
          <span
            v-if="tab.count"
            class="tab-count"
          >{{ tab.count }}</span>
        </button>
      </div>

      <section
        :id="`admin-panel-${activeTab}`"
        role="tabpanel"
        :aria-labelledby="`admin-tab-${activeTab}`"
        class="panel"
      >
        <AdminOverview
          v-if="activeTab === 'overview'"
          @open-tab="selectTab"
          @loaded="stats => openReports = stats.moderation.openReports"
        />
        <AdminUsage v-else-if="activeTab === 'usage'" />
        <AdminModeration
          v-else-if="activeTab === 'moderation'"
          @open-user="openUser"
          @changed="refreshCount"
        />
        <AdminAccounts
          v-else-if="activeTab === 'accounts'"
          :initial-status="accountStatus"
          :version="accountsVersion"
          @open-user="openUser"
        />
        <AdminSystem v-else-if="activeTab === 'system'" />
        <AdminLog v-else-if="activeTab === 'log'" />
      </section>

      <AdminUserDrawer
        :user-id="drawerUserId"
        @close="drawerUserId = null"
        @changed="onUserChanged"
      />
    </template>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, provide, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import AppButton from '../components/ui/AppButton.vue'
import PasswordField from '../components/form/PasswordField.vue'
import AdminOverview from '../components/admin/AdminOverview.vue'
import AdminModeration from '../components/admin/AdminModeration.vue'
import AdminAccounts from '../components/admin/AdminAccounts.vue'
import AdminLog from '../components/admin/AdminLog.vue'
import AdminUsage from '../components/admin/AdminUsage.vue'
import AdminSystem from '../components/admin/AdminSystem.vue'
import AdminUserDrawer from '../components/admin/AdminUserDrawer.vue'
import api from '../services/api.js'
import { useToast } from '../services/toast.js'
import { ADMIN_CALL, LockedError } from '../components/admin/adminCall.js'

/**
 * Área administrativa (só para quem tem role = 'admin' no banco). Pede a
 * senha de novo e fica liberada por 30 minutos sem uso; qualquer chamada que
 * volte ADMIN_LOCKED traz de volta a tela da senha. Pensada para o computador.
 */
const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const toast = useToast()

const TAB_KEYS = ['overview', 'usage', 'moderation', 'accounts', 'system', 'log']
const state = ref('loading') // loading | locked | unlocked
const minutes = ref(30)
const password = ref('')
const unlockError = ref('')
const unlocking = ref(false)
const locking = ref(false)
const passwordField = ref(null)
const openReports = ref(0)
const accountStatus = ref(['all', 'suspended', 'unverified'].includes(route.query.status) ? route.query.status : 'all')
const accountsVersion = ref(0)
const drawerUserId = ref(null)
const activeTab = ref(TAB_KEYS.includes(route.query.tab) ? route.query.tab : 'overview')

const tabs = computed(() => [
  { key: 'overview', label: t('admin.tabs.overview'), icon: 'pi pi-chart-line' },
  { key: 'usage', label: t('admin.tabs.usage'), icon: 'pi pi-th-large' },
  { key: 'moderation', label: t('admin.tabs.moderation'), icon: 'pi pi-flag', count: openReports.value },
  { key: 'accounts', label: t('admin.tabs.accounts'), icon: 'pi pi-users' },
  { key: 'system', label: t('admin.tabs.system'), icon: 'pi pi-server' },
  { key: 'log', label: t('admin.tabs.log'), icon: 'pi pi-history' }
])

async function showLocked() {
  state.value = 'locked'
  password.value = ''
  await nextTick()
  passwordField.value?.focus()
}

// Embrulho para as chamadas das abas: liberação vencida → tela da senha
provide(ADMIN_CALL, async (fn) => {
  try {
    return await fn()
  } catch (error) {
    if (error?.code === 'ADMIN_LOCKED') {
      showLocked()
      throw new LockedError()
    }
    throw error
  }
})

// options.status: abre Contas já filtrada (ex.: cadastros parados)
function selectTab(key, options = {}) {
  if (key === 'accounts' && options.status) accountStatus.value = options.status
  activeTab.value = key
  router.replace({ query: { tab: key === 'overview' ? undefined : key } })
}

function moveTab(step) {
  const next = TAB_KEYS[(TAB_KEYS.indexOf(activeTab.value) + step + TAB_KEYS.length) % TAB_KEYS.length]
  selectTab(next)
  document.getElementById(`admin-tab-${next}`)?.focus()
}

function openUser(id) {
  drawerUserId.value = id
}

function onUserChanged() {
  accountsVersion.value++
  refreshCount()
}

async function refreshCount() {
  try {
    openReports.value = (await api.adminStats()).moderation.openReports
  } catch {
    // o contador da aba é só um extra
  }
}

async function unlock() {
  unlockError.value = ''
  if (!password.value) {
    unlockError.value = t('errors.CURRENT_PASSWORD_REQUIRED')
    passwordField.value?.focus()
    return
  }
  unlocking.value = true
  try {
    await api.adminUnlock(password.value)
    password.value = ''
    state.value = 'unlocked'
    refreshCount()
  } catch (error) {
    unlockError.value = error.message
    passwordField.value?.focus()
  } finally {
    unlocking.value = false
  }
}

async function lock() {
  locking.value = true
  try {
    await api.adminLock()
  } catch (error) {
    toast.add({ severity: 'error', detail: error.message })
  } finally {
    locking.value = false
    showLocked()
  }
}

onMounted(async () => {
  try {
    const session = await api.adminSession()
    minutes.value = session.minutes
    if (session.unlocked) {
      state.value = 'unlocked'
      refreshCount()
    } else {
      showLocked()
    }
  } catch (error) {
    toast.add({ severity: 'error', detail: error.message })
    showLocked()
  }
})
</script>

<style scoped>
.admin-container {
  min-width: 0;
  width: 100%;
  padding: 2rem;
  min-height: 100vh;
  min-height: 100dvh;
  background-color: var(--bg-app);
  max-width: 1280px;
  margin: 0 auto;
  box-sizing: border-box;
}

.header-section {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.welcome-text h1 {
  margin: 0;
  font-size: var(--fs-2xl);
  color: var(--text-primary);
  font-family: var(--font-display);
}

.welcome-text p {
  margin: 0.35rem 0 0;
  color: var(--text-secondary);
}

.loading {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--text-secondary);
  padding: 2rem 0;
}

.unlock-card {
  max-width: 420px;
  margin: 3rem auto;
  background: var(--bg-panel);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  padding: 2rem;
  text-align: center;
}

.unlock-card h2 {
  margin: 0.75rem 0 0.5rem;
  font-size: var(--fs-xl);
  color: var(--text-primary);
}

.unlock-card .stack {
  margin-top: 1.5rem;
  text-align: left;
}

.unlock-icon {
  width: 3.25rem;
  height: 3.25rem;
  margin: 0 auto;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: rgba(var(--main-color-rgb), 0.14);
  color: var(--main-color);
  font-size: var(--fs-xl);
}

.muted {
  color: var(--text-secondary);
  margin: 0;
}

.stack {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.tabs {
  display: flex;
  gap: 0.25rem;
  border-bottom: 1px solid var(--border-color);
  margin-bottom: 1.5rem;
  overflow-x: auto;
  scrollbar-width: none;
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
  gap: 0.45rem;
  white-space: nowrap;
}

.tab:hover {
  color: var(--text-primary);
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
  background: rgba(var(--orange-rgb), 0.18);
  color: var(--text-primary);
  border-radius: 999px;
  padding: 0 0.45rem;
  font-size: var(--fs-xs);
  font-weight: 600;
}
.panel {
  min-width: 0;
}
</style>
