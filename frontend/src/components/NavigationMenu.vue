<template>
  <div class="navigation-container">

    <!-- Barra do topo no celular: landmark próprio para o logo não ficar solto -->
    <header
      ref="mobileHeader"
      class="mobile-header"
    >
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
        <!-- Celular: o nome como no ícone do app, ao lado do ☰ -->
        <span class="logo-word">Librishelf</span>
      </div>
      <!-- Contrapeso do botão do menu, para o logo ficar no centro (tablet) -->
      <div
        class="header-spacer"
        aria-hidden="true"
      ></div>

      <!-- Celular: busca, tema/cor e conta à direita -->
      <div
        v-if="phone"
        class="bar-actions"
      >
        <button
          type="button"
          class="bar-btn"
          data-press
          :aria-label="t('menu.search')"
          @click="openSearch"
        >
          <i
            class="pi pi-search"
            aria-hidden="true"
          ></i>
        </button>
        <button
          type="button"
          class="bar-btn theme-btn"
          data-press
          popovertarget="accent-popover"
          :aria-label="t('menu.appearance')"
        >
          <i
            class="pi"
            :class="currentTheme === 'dark' ? 'pi-sun' : 'pi-moon'"
            aria-hidden="true"
          ></i>
        </button>
        <router-link
          to="/settings"
          class="bar-avatar"
          :aria-label="t('menu.settings')"
          data-press
        >{{ userInitials }}</router-link>
      </div>
    </header>

    <!-- Balão do botão de tema: cor de destaque e claro/escuro -->
    <div
      v-if="phone"
      id="accent-popover"
      ref="accentPopover"
      popover="auto"
      class="accent-pop"
      role="dialog"
      aria-labelledby="accent-pop-title"
    >
      <p
        id="accent-pop-title"
        class="accent-pop-title"
      >{{ t('theme.accentGroup') }}</p>
      <div
        class="accent-dots"
        role="group"
        :aria-label="t('theme.accentGroup')"
      >
        <button
          v-for="color in ACCENT_COLORS"
          :key="color"
          type="button"
          class="accent-dot"
          :class="{ active: accentColor === color }"
          :style="{ '--dot': `rgb(var(--${color}-solid-rgb))` }"
          :aria-label="t('theme.accent', { color: t(`theme.colors.${color}`) })"
          :aria-pressed="accentColor === color"
          @click="setAccent(color)"
        ></button>
      </div>
      <button
        type="button"
        class="accent-theme"
        @click="toggleTheme"
      >
        <i
          class="pi"
          :class="currentTheme === 'dark' ? 'pi-sun' : 'pi-moon'"
          aria-hidden="true"
        ></i>
        {{ currentTheme === 'dark' ? t('theme.toLight') : t('theme.toDark') }}
      </button>
    </div>

    <!-- Celular: faixa da borda esquerda que abre o menu arrastando -->
    <div
      v-if="phone && !mobileMenuOpen"
      class="drawer-edge"
      aria-hidden="true"
      @pointerdown="edgeDrag.onPointerDown"
    ></div>

    <Transition name="fade">
      <div
        v-if="mobileMenuOpen || dragging"
        ref="overlayEl"
        class="mobile-overlay"
        @click="mobileMenuOpen = false"
        @pointerdown="phone && mobileMenuOpen && closeDrag.onPointerDown($event)"
      ></div>
    </Transition>

    <aside
      id="app-sidebar"
      ref="sidebarEl"
      class="sidebar"
      :class="{ 'sidebar-mobile-open': mobileMenuOpen, 'is-dragging': dragging }"
      @pointerdown="phone && mobileMenuOpen && closeDrag.onPointerDown($event)"
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
          v-for="(item, index) in items"
          :key="item.route"
          v-slot="{ href, navigate, isActive, isExactActive }"
          :to="item.route"
          custom
        >
          <a
            :href="href"
            class="nav-item"
            :class="{ active: isActive || (item.route === '/lists' && route.name === 'list') }"
            :aria-current="isExactActive ? 'page' : undefined"
            :style="{ '--i': index }"
            @click="event => goTo(event, navigate)"
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
          </a>
        </router-link>

        <div
          class="separator"
          role="separator"
          :style="{ '--i': items.length }"
        ></div>

        <button
          type="button"
          class="nav-item action-item"
          :style="{ '--i': items.length + 1 }"
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
import { useIsPhone } from '../composables/useIsPhone.js'
import { useDrag } from '../composables/useDrag.js'
import { useTheme, ACCENT_COLORS } from '../composables/useTheme.js'
import { pushOverlay } from '../services/backStack.js'
import { requestLibrarySearch } from '../services/librarySearch.js'
import { shouldComplete } from '../utils/motion.js'

const router = useRouter()
const route = useRoute()
const { t } = useI18n()
const toast = useToast()

const mobileMenuOpen = ref(false)
const menuButton = ref(null)
const closeButton = ref(null)
const phone = useIsPhone()
const { currentTheme, accentColor, toggleTheme, setAccent } = useTheme()

// Menu do celular: trava a rolagem da página, leva o foco para dentro ao abrir
// e devolve ao botão do menu ao fechar (teclado e leitor de tela). Aberto, o
// resto da tela fica inert (o Tab não sai do menu) e o Esc fecha de qualquer
// lugar, não só com o foco dentro dele.
const mobileHeader = ref(null)

function outsideMenu() {
  return [document.getElementById('main-content'), mobileHeader.value, document.querySelector('.skip-link')].filter(Boolean)
}

function setInert(on) {
  for (const el of outsideMenu()) {
    if (on) el.setAttribute('inert', '')
    else el.removeAttribute('inert')
  }
}

function onDocumentKeydown(event) {
  if (event.key !== 'Escape' || event.defaultPrevented) return
  // Uma janela aberta por cima do menu (confirmação) tem a vez
  if (document.querySelector('dialog[open]')) return
  mobileMenuOpen.value = false
}

watch(mobileMenuOpen, async (open) => {
  document.body.style.overflow = open ? 'hidden' : ''
  document.documentElement.classList.toggle('menu-open', open)
  setInert(open)
  if (open) watchBack()
  else forgetBack()
  if (open) document.addEventListener('keydown', onDocumentKeydown)
  else document.removeEventListener('keydown', onDocumentKeydown)
  await nextTick()
  if (open) closeButton.value?.focus()
  else if (!document.activeElement || document.activeElement === document.body || document.activeElement.closest?.('#app-sidebar')) menuButton.value?.$el?.focus()
})

onBeforeUnmount(() => {
  document.body.style.overflow = ''
  document.documentElement.classList.remove('menu-open')
  forgetBack()
  setInert(false)
  document.removeEventListener('keydown', onDocumentKeydown)
})
const showSettings = ref(false)

const displayName = computed(() => currentUser.value?.name || t('menu.guest'))
const userInitial = computed(() => displayName.value.charAt(0).toUpperCase())
// Avatar da barra: até duas iniciais ("maria_souza" → MS)
const userInitials = computed(() => {
  const parts = displayName.value.split(/[\s._-]+/).filter(Boolean)
  const letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : displayName.value.slice(0, 1)
  return letters.toUpperCase()
})

// ---------------------------------------------------------------------------
// Celular: voltar do aparelho fecha o menu antes de sair da tela
// ---------------------------------------------------------------------------
let releaseBack = null

function watchBack() {
  if (!phone.value || releaseBack) return
  releaseBack = pushOverlay(() => {
    releaseBack = null
    mobileMenuOpen.value = false
  })
}

function forgetBack() {
  const release = releaseBack
  releaseBack = null
  return release ? release() : Promise.resolve()
}

// Item do menu: fecha (consumindo a posição extra do histórico) e só então
// navega; assim o voltar da tela nova vem direto para a de antes.
async function goTo(event, navigate) {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
  event.preventDefault()
  const wasOpen = mobileMenuOpen.value
  mobileMenuOpen.value = false
  if (wasOpen) await forgetBack()
  navigate()
}

// ---------------------------------------------------------------------------
// Celular: gaveta arrastável (da borda para abrir, no menu/fundo para fechar)
// ---------------------------------------------------------------------------
const sidebarEl = ref(null)
const overlayEl = ref(null)
const dragging = ref(false)
const DRAWER_WIDTH = 280

function setProgress(progress) {
  const p = Math.min(1, Math.max(0, progress))
  if (sidebarEl.value) sidebarEl.value.style.transform = `translate3d(${(p - 1) * DRAWER_WIDTH}px, 0, 0)`
  if (overlayEl.value) overlayEl.value.style.opacity = String(p)
  const main = document.getElementById('main-content')
  if (main) main.style.transform = p ? `translate3d(${p * 12}px, 0, 0) scale(${1 - p * 0.03})` : ''
}

function clearProgress() {
  for (const el of [sidebarEl.value, overlayEl.value, document.getElementById('main-content')]) {
    if (!el) continue
    el.style.transform = ''
    el.style.opacity = ''
  }
}

// Solta: classe nova e estilo do dedo saem no mesmo quadro; a transição do
// CSS (mola para abrir, saída para fechar) parte de onde o dedo deixou.
function settle(open) {
  dragging.value = false
  clearProgress()
  mobileMenuOpen.value = open
}

const edgeDrag = useDrag({
  axis: 'x',
  onStart: () => { dragging.value = true; nextTick(() => setProgress(0)) },
  onMove: distance => setProgress(distance / DRAWER_WIDTH),
  onEnd: ({ distance, velocity }) => settle(shouldComplete({ distance, velocity, size: DRAWER_WIDTH }))
})

const closeDrag = useDrag({
  axis: 'x',
  canStart: event => !event.target.closest?.('.settings-menu, input, select'),
  onStart: () => { dragging.value = true },
  onMove: distance => setProgress(1 + Math.min(0, distance) / DRAWER_WIDTH),
  onEnd: ({ distance, velocity }) => settle(!shouldComplete({ distance: -distance, velocity: -velocity, size: DRAWER_WIDTH }))
})

// ---------------------------------------------------------------------------
// Celular: barra do topo
// ---------------------------------------------------------------------------
async function openSearch() {
  if (route.name !== 'library') await router.push({ name: 'library' })
  requestLibrarySearch()
}

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
.header-spacer {
  width: 40px;
  flex-shrink: 0;
}

.nav-badge {
  margin-left: auto;
  min-width: 1.25rem;
  height: 1.25rem;
  padding: 0 0.35rem;
  border-radius: var(--radius-pill);
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
  border-radius: var(--radius-md);
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
  background-color: color-mix(in srgb, var(--danger) 10%, transparent);
  color: var(--danger);
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
  border-radius: var(--radius-md);
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
  border-radius: var(--radius-md);
  padding: 1rem;
  box-shadow: var(--shadow-3);
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

@media (max-width: 1023.98px) {
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

.logo-word,
.bar-actions,
.drawer-edge {
  display: none;
}

/* ---------------------------------------------------------------- celular
 * Barra do topo de app (☰ + logo à esquerda; busca, tema e conta à direita),
 * gaveta arrastável e balão de cor. Só abaixo de 640 px; o tablet continua
 * com o logo no centro.
 */
@media (max-width: 639.98px) {
  .mobile-header {
    justify-content: flex-start;
    gap: var(--space-1);
    height: calc(56px + var(--safe-top));
    padding: var(--safe-top) var(--space-2) 0 var(--space-1);
    view-transition-name: app-bar;
  }

  .menu-btn.btn {
    width: 44px;
    min-height: 44px;
  }

  .mobile-logo-wrapper {
    gap: var(--space-2);
    min-width: 0;
  }

  .mobile-logo-wrapper img {
    width: 26px;
    height: 26px;
  }

  .mobile-header .logo-text,
  .header-spacer {
    display: none;
  }

  .logo-word {
    display: block;
    font-family: var(--font-display);
    font-weight: 700;
    font-size: var(--fs-lg);
    letter-spacing: -0.02em;
    color: var(--text-primary);
  }

  .bar-actions {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    margin-left: auto;
  }

  .bar-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    border: none;
    border-radius: 50%;
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    font-size: var(--fs-lg);
  }

  .bar-btn .pi {
    font-size: 1.15rem;
  }

  .bar-btn:focus-visible,
  .bar-avatar:focus-visible {
    outline: var(--focus-ring);
    outline-offset: -2px;
  }

  .bar-avatar {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    border-radius: 50%;
    color: var(--on-main);
    font-size: var(--fs-xs);
    font-weight: 700;
    text-decoration: none;
    letter-spacing: 0.02em;
    /* Círculo de 32 px desenhado dentro do alvo de 44 px */
    background: radial-gradient(circle closest-side, var(--main-solid) 15.5px, transparent 16px);
  }

  /* Faixa invisível na borda esquerda: arrastar dali abre o menu. pan-y
     deixa a página rolar na vertical; o lado fica com o gesto. */
  .drawer-edge {
    display: block;
    position: fixed;
    top: var(--app-bar-height);
    bottom: 0;
    left: 0;
    width: 16px;
    z-index: 150;
    touch-action: pan-y;
  }

  /* Gaveta: 32 px a mais escondidos à esquerda para a sobra da mola não
     mostrar um vão na borda */
  .sidebar {
    left: -32px;
    width: calc(280px + 32px);
    padding: var(--safe-top) 0 var(--safe-bottom) 32px;
    touch-action: pan-y;
    transition: transform var(--dur-medium) var(--ease-exit), visibility 0s linear var(--dur-medium);
  }

  .sidebar.sidebar-mobile-open {
    transition: transform var(--dur-spring) var(--ease-spring), visibility 0s;
  }

  .sidebar.is-dragging {
    visibility: visible;
    transition: none;
  }

  .mobile-overlay {
    backdrop-filter: none;
    touch-action: none;
  }

  /* A lista rola na vertical; o lado é do gesto de fechar (sem pan-y aqui o
     navegador toma o toque e cancela o arrasto) */
  .nav-links,
  .sidebar-footer {
    overscroll-behavior: contain;
    touch-action: pan-y;
  }

  /* Itens entram em cascata quando o menu termina de abrir */
  .sidebar-mobile-open .nav-item,
  .sidebar-mobile-open .separator {
    animation: nav-item-in var(--dur-medium) var(--ease-enter) both;
    animation-delay: calc(min(var(--i, 10), 10) * var(--stagger));
  }

  .accent-pop {
    position: fixed;
    inset: auto;
    top: calc(var(--app-bar-height) + var(--space-1));
    right: var(--space-2);
    margin: 0;
    padding: var(--space-3) var(--space-4) var(--space-2);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-lg);
    background: var(--bg-panel);
    color: var(--text-primary);
    box-shadow: var(--shadow-3);
    transform-origin: calc(100% - 60px) 0;
  }

  .accent-pop:popover-open {
    animation: accent-pop-in var(--dur-spring) var(--ease-spring);
  }

  .accent-pop-title {
    margin: 0 0 var(--space-2);
    font-size: var(--fs-sm);
    font-weight: 600;
    color: var(--text-secondary);
  }

  .accent-dots {
    display: flex;
    gap: 2px;
  }

  .accent-dot {
    width: 44px;
    height: 44px;
    border: none;
    border-radius: 50%;
    cursor: pointer;
    /* Bolinha de 28 px; selecionada ganha um anel */
    background: radial-gradient(circle closest-side, var(--dot) 13px, transparent 14px);
  }

  .accent-dot.active {
    background:
      radial-gradient(circle closest-side, var(--dot) 11px, transparent 11.5px, transparent 13px, var(--text-primary) 13.5px, var(--text-primary) 15px, transparent 15.5px);
  }

  .accent-dot:focus-visible,
  .accent-theme:focus-visible {
    outline: var(--focus-ring);
    outline-offset: -2px;
  }

  .accent-theme {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    width: 100%;
    min-height: 44px;
    margin-top: var(--space-1);
    padding: 0 var(--space-1);
    border: none;
    border-top: 1px solid var(--border-color);
    background: transparent;
    color: var(--text-primary);
    font: inherit;
    font-size: var(--fs-sm);
    cursor: pointer;
  }
}

/* Conteúdo recua um pouco com o menu aberto (o arrasto faz o mesmo à mão) */
@media (max-width: 639.98px) {
  :global(#main-content) {
    transition: transform var(--dur-medium) var(--ease-exit);
  }

  :global(html.menu-open #main-content) {
    transform: translate3d(12px, 0, 0) scale(0.97);
    transition: transform var(--dur-spring) var(--ease-spring);
  }
}

@keyframes nav-item-in {
  from {
    opacity: 0;
    transform: translate3d(-16px, 0, 0);
  }
}

@keyframes accent-pop-in {
  from {
    opacity: 0;
    transform: scale(0.85);
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