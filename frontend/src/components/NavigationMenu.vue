<template>
  <div class="navigation-container">

    <!-- Barra do topo no celular: landmark próprio para o logo não ficar solto -->
    <header class="mobile-header">
      <AppButton
        ref="menuButton"
        icon="pi pi-bars"
        class="btn-text menu-btn"
        :aria-label="t('menu.openMenu')"
        :aria-expanded="mobileMenuOpen"
        aria-controls="app-sidebar"
        @click="mobileMenuOpen = true"
      />
      <div class="mobile-logo-wrapper">
        <img
          src="/bookshelf.png"
          alt=""
          width="30"
          height="30"
        />
        <div class="logo-text">
          <span class="text-main">LIBRI</span>SHELF
        </div>
      </div>
      <div style="width: 40px"></div>
    </header>

    <Transition name="fade">
      <div
        v-if="mobileMenuOpen"
        class="mobile-overlay"
        @click="mobileMenuOpen = false"
      ></div>
    </Transition>

    <aside
      id="app-sidebar"
      class="sidebar"
      :class="{ 'sidebar-mobile-open': mobileMenuOpen }"
      @keydown.esc="mobileMenuOpen = false"
    >

      <div class="sidebar-header">
        <div class="logo-wrapper">
          <img
            src="/bookshelf.png"
            alt=""
            width="40"
            height="40"
          />
          <div class="logo-text">
            <span class="text-main">LIBRI</span>SHELF
          </div>
        </div>
        <button
          ref="closeButton"
          type="button"
          class="close-sidebar-btn"
          :aria-label="t('menu.closeMenu')"
          @click="mobileMenuOpen = false"
        >
          <i
            class="pi pi-times"
            aria-hidden="true"
          ></i>
        </button>
      </div>

      <nav
        class="nav-links"
        :aria-label="t('menu.library')"
      >
        <router-link
          v-for="item in items"
          :key="item.route"
          :to="item.route"
          class="nav-item"
          :class="{ active: item.route === '/lists' && route.name === 'list' }"
          active-class="active"
          @click="mobileMenuOpen = false"
        >
          <i
            :class="item.icon"
            aria-hidden="true"
          ></i>
          <span>{{ item.label }}</span>
          <span
            v-if="item.badge"
            class="nav-badge"
            :aria-label="t('menu.pending_requests', { n: item.badge }, item.badge)"
          >{{ item.badge }}</span>
        </router-link>

        <div
          class="separator"
          role="separator"
        ></div>

        <button
          type="button"
          class="nav-item action-item"
          @click="handleLogout"
        >
          <i
            class="pi pi-sign-out"
            aria-hidden="true"
          ></i>
          <span>{{ t('menu.logout') }}</span>
        </button>
      </nav>

      <div class="sidebar-footer">

        <Transition name="scale-up">
          <div
            v-if="showSettings"
            id="nav-preferences"
            class="settings-menu"
          >
            <div class="settings-header">{{ $t('menu.configurations') }}</div>

            <div class="settings-row">
              <span class="settings-label">{{ $t('menu.language') }}</span>
              <LanguageSwitcher />
            </div>

            <div class="settings-divider"></div>

            <div class="settings-row">
              <ThemeSwitcher />
            </div>
          </div>
        </Transition>

        <div class="footer-content">
          <div class="user-info">
            <div
              class="avatar-circle"
              aria-hidden="true"
            >{{ userInitial }}</div>
            <div class="user-details">
              <span
                class="username"
                :title="displayName"
              >{{ truncateName(displayName) }}</span>
              <span class="user-role">{{ currentUser?.isAdmin ? $t('menu.adminRole') : $t('menu.role') }}</span>
            </div>
          </div>

          <button
            type="button"
            class="settings-btn"
            :class="{ active: showSettings }"
            :aria-label="t('menu.preferences')"
            :aria-expanded="showSettings"
            aria-controls="nav-preferences"
            v-tooltip.top="t('menu.preferences')"
            @click="showSettings = !showSettings"
          >
            <i
              class="pi pi-cog"
              aria-hidden="true"
            ></i>
          </button>
        </div>
      </div>
    </aside>

  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onBeforeUnmount } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import AppButton from './ui/AppButton.vue'
import ThemeSwitcher from './ThemeSwitcher.vue'
import LanguageSwitcher from './LanguageSwitcher.vue'
import { currentUser, logout } from '../services/session.js'
import { useToast } from '../services/toast.js'
import { pendingRequests, refreshPendingRequests, resetPendingRequests } from '../services/social.js'

const router = useRouter()
const route = useRoute()
const { t } = useI18n()
const toast = useToast()

const mobileMenuOpen = ref(false)
const menuButton = ref(null)
const closeButton = ref(null)

// Menu do celular: trava a rolagem da página, leva o foco para dentro ao abrir
// e devolve ao botão do menu ao fechar (teclado e leitor de tela).
watch(mobileMenuOpen, async (open) => {
  document.body.style.overflow = open ? 'hidden' : ''
  await nextTick()
  if (open) closeButton.value?.focus()
  else if (document.activeElement?.closest?.('#app-sidebar')) menuButton.value?.$el?.focus()
})

onBeforeUnmount(() => { document.body.style.overflow = '' })
const showSettings = ref(false)

const displayName = computed(() => currentUser.value?.name || t('menu.guest'))
const userInitial = computed(() => displayName.value.charAt(0).toUpperCase())

function truncateName(name) {
  return name.length > 15 ? name.substring(0, 12) + '...' : name
}

async function handleLogout() {
  // Mesmo se a chamada falhar, este aparelho sai; o pedido fica guardado e
  // o servidor encerra a sessão quando o app voltar a ter conexão.
  const { serverDone } = await logout()
  resetPendingRequests()
  if (!serverDone) toast.add({ severity: 'warn', detail: t('menu.logoutPending'), life: 10000 })
  router.push('/login')
}

watch(() => route.path, () => {
  showSettings.value = false
  mobileMenuOpen.value = false
  if (currentUser.value) refreshPendingRequests()
}, { immediate: true })

const items = computed(() => [
  { label: t('menu.home'), icon: 'pi pi-home', route: '/' },
  { label: t('menu.library'), icon: 'pi pi-book', route: '/books' },
  { label: t('menu.lists'), icon: 'pi pi-list', route: '/lists' },
  { label: t('menu.authors'), icon: 'pi pi-users', route: '/authors' },
  { label: t('menu.publishers'), icon: 'pi pi-building', route: '/publishers' },
  { label: t('menu.categories'), icon: 'pi pi-tags', route: '/tags' },
  { label: t('menu.dashboard'), icon: 'pi pi-chart-bar', route: '/dashboard' },
  { label: t('menu.community'), icon: 'pi pi-globe', route: '/community', badge: pendingRequests.value },
  { label: t('menu.settings'), icon: 'pi pi-user', route: '/settings' },
  ...(currentUser.value?.isAdmin ? [{ label: t('menu.admin'), icon: 'pi pi-shield', route: '/admin' }] : [])
])
</script>

<style scoped>
.nav-badge {
  margin-left: auto;
  min-width: 1.25rem;
  height: 1.25rem;
  padding: 0 0.35rem;
  border-radius: 999px;
  background: var(--main-solid);
  color: var(--on-main);
  font-size: var(--fs-xs);
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.text-main {
  color: var(--main-color);
}

.navigation-container {
  width: 260px;
  height: 100vh;
  height: 100dvh;
  flex-shrink: 0;
  background-color: var(--bg-panel);
  border-right: 1px solid var(--border-color);
  position: sticky;
  top: 0;
  z-index: 100;
}

.mobile-header {
  display: none;
}

.mobile-overlay {
  display: none;
}

.sidebar {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
}

.sidebar-header {
  padding: 2rem 1.5rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.logo-wrapper {
  display: flex;
  align-items: center;
  gap: 0.8rem;
}

.logo-text {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: var(--fs-xl);
  color: var(--text-primary);
  letter-spacing: -1px;
}

.close-sidebar-btn {
  display: none;
}

.nav-links {
  flex: 1;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  overflow-y: auto;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.8rem 1rem;
  border-radius: 8px;
  color: var(--text-secondary);
  text-decoration: none;
  font-weight: 500;
  transition: all 0.2s;
  font-size: var(--fs-md);
}

button.nav-item {
  background: none;
  border: none;
  width: 100%;
  font: inherit;
  font-weight: 500;
  font-size: var(--fs-md);
  cursor: pointer;
  text-align: left;
}

.nav-item:hover {
  background-color: var(--bg-hover);
  color: var(--text-primary);
}

.nav-item.active {
  background-color: rgba(var(--main-color-rgb), 0.15);
  color: color-mix(in srgb, var(--main-color) var(--tint-text), var(--text-primary));
  font-weight: 600;
}

.nav-item.action-item:hover {
  background-color: rgba(239, 68, 68, 0.1);
  color: #ef4444;
}

.separator {
  height: 1px;
  background-color: var(--border-color);
  margin: 0.5rem 0;
}

.sidebar-footer {
  padding: 1.2rem;
  border-top: 1px solid var(--border-color);
  background-color: var(--bg-app);
  position: relative;
}

.footer-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  overflow: hidden;
}

.avatar-circle {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background-color: var(--main-solid);
  color: var(--on-main);
  font-weight: bold;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--fs-md);
  flex-shrink: 0;
}

.user-details {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.username {
  color: var(--text-primary);
  font-weight: 600;
  font-size: var(--fs-md);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.user-role {
  color: var(--text-muted);
  font-size: var(--fs-xs);
}

.settings-btn {
  background: transparent;
  border: none;
  color: var(--text-secondary);
  width: 36px;
  height: 36px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
}

.settings-btn:hover,
.settings-btn.active {
  background-color: var(--bg-hover);
  color: var(--text-primary);
}

.settings-btn.active i {
  transform: rotate(45deg);
}

.settings-btn i {
  font-size: var(--fs-lg);
  transition: transform 0.3s ease;
}

.settings-menu {
  position: absolute;
  bottom: 80px;
  left: 1rem;
  right: 1rem;
  background-color: var(--bg-panel);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 1rem;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
  z-index: 50;
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
}

.settings-header {
  font-size: var(--fs-sm);
  text-transform: uppercase;
  color: var(--text-muted);
  font-weight: 600;
  margin-bottom: 0.2rem;
}

.settings-row {
  display: flex;
  justify-content: space-around;
  align-items: center;
}

.settings-label {
  font-size: var(--fs-md);
  color: var(--text-primary);
}

.settings-divider {
  height: 1px;
  background-color: var(--border-color);
  margin: 0.2rem 0;
}

@media (max-width: 768px) {
  .navigation-container {
    width: 100%;
    height: auto;
    position: sticky;
    top: 0;
    border-right: none;
    border-bottom: 1px solid var(--border-color);
    z-index: 200;
  }

  .mobile-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.8rem 1rem;
    background-color: var(--bg-app);
    height: 60px;
  }

  .menu-btn.btn {
    --btn-fg: var(--text-primary);
    padding: 0;
    width: 40px;
  }

  .mobile-logo-wrapper {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .mobile-header .logo-text {
    font-size: var(--fs-lg);
    color: var(--text-primary);
    font-weight: 700;
    font-family: var(--font-display);
  }

  .sidebar {
    position: fixed;
    top: 0;
    left: 0;
    width: 280px;
    height: 100dvh;
    z-index: 1000;
    background-color: var(--bg-panel);
    box-shadow: none;
    transform: translateX(-100%);
    /* Fechado também fica invisível para teclado e leitor de tela; o
       visibility espera a animação terminar antes de esconder. */
    visibility: hidden;
    transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), visibility 0s linear 0.3s;
  }

  .sidebar.sidebar-mobile-open {
    transform: translateX(0);
    visibility: visible;
    transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), visibility 0s;
    box-shadow: 10px 0 30px rgba(0, 0, 0, 0.5);
  }

  .close-sidebar-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--bg-hover);
    border: none;
    color: var(--text-primary);
    width: 32px;
    height: 32px;
    border-radius: 50%;
    cursor: pointer;
  }

  .mobile-overlay {
    display: block;
    position: fixed;
    inset: 0;
    background-color: var(--bg-overlay);
    backdrop-filter: blur(4px);
    z-index: 900;
  }
}

.scale-up-enter-active,
.scale-up-leave-active {
  transition: all 0.2s ease-out;
}

.scale-up-enter-from,
.scale-up-leave-to {
  opacity: 0;
  transform: translateY(10px) scale(0.95);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>