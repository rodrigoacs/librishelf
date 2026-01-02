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
        <div class="user-info">
          <div class="avatar-circle">{{ userInitial }}</div>
          <div class="user-details">
            <span
              class="username"
              :title="displayName"
            >{{ truncateName(displayName) }}</span>
            <span class="user-role">Leitor</span>
          </div>
        </div>
      </div>
    </aside>

  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import Button from 'primevue/button'

const router = useRouter()
const route = useRoute()
const mobileMenuOpen = ref(false)
const currentUser = ref(null)

function updateUser() {
  const userStr = localStorage.getItem('user')
  if (userStr) {
    try { currentUser.value = JSON.parse(userStr) } catch { currentUser.value = null }
  } else { currentUser.value = null }
}

const displayName = computed(() => {
  const user = currentUser.value
  return user?.name || user?.username || user?.email || 'Visitante'
})

const userInitial = computed(() => displayName.value.charAt(0).toUpperCase())

function truncateName(name) {
  return name.length > 15 ? name.substring(0, 12) + '...' : name
}

onMounted(() => updateUser())
watch(() => route.path, () => updateUser())

const items = [
  { label: 'Home', icon: 'pi pi-home', route: '/' },
  { label: 'Biblioteca', icon: 'pi pi-book', route: '/books' },
  { label: 'Autores', icon: 'pi pi-users', route: '/authors' },
  { label: 'Editoras', icon: 'pi pi-building', route: '/publishers' },
  { label: 'Categorias', icon: 'pi pi-tags', route: '/tags' },
  { label: 'Dashboard', icon: 'pi pi-chart-bar', route: '/dashboard' },
  { separator: true },
  { label: 'Sair', icon: 'pi pi-sign-out', command: () => { localStorage.clear(); router.push('/login') } },
]
</script>

<style scoped>
.text-main {
  color: var(--main-color, #4caf50);
}

.navigation-container {
  width: 260px;
  height: 100vh;
  flex-shrink: 0;
  background-color: #18181b;
  border-right: 1px solid rgba(255, 255, 255, 0.05);
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
  color: #fff;
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
  color: #a1a1aa;
  text-decoration: none;
  font-weight: 500;
  transition: all 0.2s;
  font-size: 0.95rem;
}

.nav-item:hover {
  background-color: rgba(255, 255, 255, 0.05);
  color: #fff;
}

.nav-item.active {
  background-color: rgba(var(--main-color-rgb), 0.15);
  color: var(--main-color, #4caf50);
  font-weight: 600;
}

.nav-item.action-item:hover {
  background-color: rgba(239, 68, 68, 0.1);
  color: #ef4444;
}

.separator {
  height: 1px;
  background-color: rgba(255, 255, 255, 0.1);
  margin: 0.5rem 0;
}

.sidebar-footer {
  padding: 1.5rem;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
  background-color: #131315;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.avatar-circle {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background-color: var(--main-color, #4caf50);
  color: #000;
  font-weight: bold;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.1rem;
}

.user-details {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.username {
  color: #fff;
  font-weight: 600;
  font-size: 0.95rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.user-role {
  color: #71717a;
  font-size: 0.75rem;
}

@media (max-width: 768px) {
  .navigation-container {
    width: 100%;
    height: auto;
    position: sticky;
    top: 0;
    border-right: none;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    z-index: 200;
  }

  .mobile-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.8rem 1rem;
    background-color: #121212;
    height: 60px;
  }

  .menu-btn {
    color: #fff !important;
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
    color: #fff;
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
    background-color: #18181b;
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
    background: rgba(255, 255, 255, 0.1);
    border: none;
    color: #fff;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    cursor: pointer;
  }

  .mobile-overlay {
    display: block;
    position: fixed;
    inset: 0;
    background-color: rgba(0, 0, 0, 0.7);
    backdrop-filter: blur(4px);
    z-index: 900;
  }
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
