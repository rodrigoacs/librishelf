<template>
  <div class="navigation-container">

    <div class="mobile-header">
      <Button
        icon="pi pi-bars"
        class="p-button-text menu-btn"
        @click="mobileMenuOpen = true"
      />
      <div class="mobile-logo-wrapper">
        <img
          src="https://img.icons8.com/external-smashingstocks-isometric-smashing-stocks/440/external-Bookshelf-interior-smashingstocks-isometric-smashing-stocks-3.png"
          alt="Logo"
          width="30"
        />
        <div class="logo-text">
          <span class="text-main">LIBRI</span>SHELF
        </div>
      </div>
      <div style="width: 40px"></div>
    </div>

    <Transition name="fade">
      <div
        v-if="mobileMenuOpen"
        class="mobile-overlay"
        @click="mobileMenuOpen = false"
      ></div>
    </Transition>

    <aside
      class="sidebar"
      :class="{ 'sidebar-mobile-open': mobileMenuOpen }"
    >

      <div class="sidebar-header">
        <div class="logo-wrapper">
          <img
            src="https://img.icons8.com/external-smashingstocks-isometric-smashing-stocks/440/external-Bookshelf-interior-smashingstocks-isometric-smashing-stocks-3.png"
            alt="Logo"
            width="40"
            height="40"
          />
          <div class="logo-text">
            <span class="text-main">LIBRI</span>SHELF
          </div>
        </div>
        <button
          class="close-sidebar-btn"
          @click="mobileMenuOpen = false"
        >
          <i class="pi pi-times"></i>
        </button>
      </div>

      <nav class="nav-links">
        <template
          v-for="item in items"
          :key="item.label"
        >
          <div
            v-if="item.separator"
            class="separator"
          ></div>

          <router-link
            v-else-if="!item.command"
            :to="item.route"
            class="nav-item"
            active-class="active"
            @click="mobileMenuOpen = false"
          >
            <i :class="item.icon"></i>
            <span>{{ item.label }}</span>
          </router-link>

          <a
            v-else
            href="#"
            class="nav-item action-item"
            @click.prevent="item.command"
          >
            <i :class="item.icon"></i>
            <span>{{ item.label }}</span>
          </a>
        </template>
      </nav>

      <div class="sidebar-footer">

        <Transition name="scale-up">
          <div
            v-if="showSettings"
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
            <div class="avatar-circle">{{ userInitial }}</div>
            <div class="user-details">
              <span
                class="username"
                :title="displayName"
              >{{ truncateName(displayName) }}</span>
              <span class="user-role">{{ $t('menu.role') }}</span>
            </div>
          </div>

          <button
            class="settings-btn"
            :class="{ active: showSettings }"
            @click="showSettings = !showSettings"
            title="Configurações"
          >
            <i class="pi pi-cog"></i>
          </button>
        </div>
      </div>
    </aside>

  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import Button from 'primevue/button'
import ThemeSwitcher from './ThemeSwitcher.vue'
import LanguageSwitcher from './LanguageSwitcher.vue'

const router = useRouter()
const route = useRoute()
const { t } = useI18n()

const mobileMenuOpen = ref(false)
const showSettings = ref(false)
const currentUser = ref(null)

function updateUser() {
  const userStr = localStorage.getItem('user')
  if (userStr) {
    try { currentUser.value = JSON.parse(userStr) } catch { currentUser.value = null }
  } else { currentUser.value = null }
}

const displayName = computed(() => {
  const user = currentUser.value
  return user?.name || user?.username || user?.email || t('menu.guest')
})

const userInitial = computed(() => displayName.value.charAt(0).toUpperCase())

function truncateName(name) {
  return name.length > 15 ? name.substring(0, 12) + '...' : name
}

watch(() => route.path, () => {
  updateUser()
  showSettings.value = false
  mobileMenuOpen.value = false
})

onMounted(() => updateUser())

const items = computed(() => [
  { label: t('menu.home'), icon: 'pi pi-home', route: '/' },
  { label: t('menu.library'), icon: 'pi pi-book', route: '/books' },
  { label: t('menu.authors'), icon: 'pi pi-users', route: '/authors' },
  { label: t('menu.publishers'), icon: 'pi pi-building', route: '/publishers' },
  { label: t('menu.categories'), icon: 'pi pi-tags', route: '/tags' },
  { label: t('menu.dashboard'), icon: 'pi pi-chart-bar', route: '/dashboard' },
  { separator: true },
  {
    label: t('menu.logout'),
    icon: 'pi pi-sign-out',
    command: () => { localStorage.clear(); router.push('/login') }
  },
])
</script>

<style scoped>
.text-main {
  color: var(--main-color);
}

.navigation-container {
  width: 260px;
  height: 100vh;
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
  font-family: 'Georgia', serif;
  font-weight: 700;
  font-size: 1.4rem;
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
  font-size: 0.95rem;
}

.nav-item:hover {
  background-color: var(--bg-hover);
  color: var(--text-primary);
}

.nav-item.active {
  background-color: rgba(var(--main-color-rgb), 0.15);
  color: var(--main-color);
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
  background-color: var(--main-color);
  color: var(--text-inverse);
  font-weight: bold;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1rem;
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
  font-size: 0.9rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.user-role {
  color: var(--text-muted);
  font-size: 0.75rem;
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
  font-size: 1.1rem;
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
  font-size: 0.8rem;
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
  font-size: 0.9rem;
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

  .menu-btn {
    color: var(--text-primary) !important;
    padding: 0;
    width: 40px;
  }

  .mobile-logo-wrapper {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .mobile-header .logo-text {
    font-size: 1.1rem;
    color: var(--text-primary);
    font-weight: 700;
    font-family: 'Georgia', serif;
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
    transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .sidebar.sidebar-mobile-open {
    transform: translateX(0);
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