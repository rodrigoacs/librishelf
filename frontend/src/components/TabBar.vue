<template>
  <!-- Celular: abas embaixo, ao alcance do polegar. Início, Biblioteca,
       adicionar livro (no meio), Comunidade e Menu (abre a gaveta). -->
  <nav
    class="tab-bar"
    :class="{ hidden: tabBarHidden }"
    :aria-label="t('menu.tabsLabel')"
    :inert="tabBarHidden ? true : undefined"
  >
    <router-link
      v-for="tab in leftTabs"
      :key="tab.id"
      v-slot="{ href, navigate }"
      :to="tab.to"
      custom
    >
      <a
        :href="href"
        class="tab"
        :class="[`tab-${tab.id}`, { active: current === tab.id }]"
        :aria-current="current === tab.id ? 'page' : undefined"
        data-press
        @click="event => onTab(event, tab, navigate)"
      >
        <span class="tab-icon">
          <i
            :class="tab.icon"
            aria-hidden="true"
          ></i>
        </span>
        <span class="tab-label">{{ tab.label }}</span>
      </a>
    </router-link>

    <div class="tab-add-slot">
      <button
        type="button"
        class="tab-add"
        data-press
        :aria-label="t('home.addBook')"
        @click="addOpen = true"
      >
        <i
          class="pi pi-plus"
          aria-hidden="true"
        ></i>
      </button>
    </div>

    <router-link
      v-slot="{ href, navigate }"
      to="/community"
      custom
    >
      <a
        :href="href"
        class="tab tab-community"
        :class="{ active: current === 'community' }"
        :aria-current="current === 'community' ? 'page' : undefined"
        data-press
        @click="event => onTab(event, { id: 'community' }, navigate)"
      >
        <span class="tab-icon">
          <i
            class="pi pi-globe"
            aria-hidden="true"
          ></i>
          <span
            v-if="pendingRequests"
            class="tab-badge"
            aria-hidden="true"
          >{{ pendingRequests > 99 ? '99+' : pendingRequests }}</span>
        </span>
        <span class="tab-label">{{ t('menu.community') }}</span>
        <span
          v-if="pendingRequests"
          class="sr-only"
        >, {{ t('menu.pending_requests', { n: pendingRequests }, pendingRequests) }}</span>
      </a>
    </router-link>

    <button
      type="button"
      class="tab tab-menu"
      :class="{ active: current === 'menu' }"
      :aria-expanded="drawerOpen"
      aria-controls="app-sidebar"
      data-press
      @click="drawerOpen = true"
    >
      <span class="tab-icon">
        <i
          class="pi pi-bars"
          aria-hidden="true"
        ></i>
      </span>
      <span class="tab-label">{{ t('menu.menuTab') }}</span>
    </button>
  </nav>

  <AddBookDialog
    v-model:visible="addOpen"
    @save="notifyBookCreated"
  />
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watchEffect } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import AddBookDialog from './AddBookDialog.vue'
import { drawerOpen, notifyBookCreated, setTabBarHidden, tabBarHidden } from '../services/appNav.js'
import { pendingRequests } from '../services/social.js'
import { activeTab, opensKeyboard } from '../utils/tabs.js'
import { scrollBehavior } from '../utils/motion.js'

const { t } = useI18n()
const route = useRoute()
const addOpen = ref(false)

const current = computed(() => activeTab(route.name))

const leftTabs = computed(() => [
  { id: 'home', to: '/', icon: 'pi pi-home', label: t('menu.home') },
  { id: 'library', to: '/books', icon: 'pi pi-book', label: t('menu.library') }
])

// Tocar de novo na aba da tela aberta sobe a página até o topo (como no iOS)
function onTab(event, tab, navigate) {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
  event.preventDefault()
  if (current.value === tab.id) {
    window.scrollTo({ top: 0, behavior: scrollBehavior() })
    return
  }
  navigate()
}

// Teclado aberto (foco num campo de texto fora de janela): a barra sai de cena
function syncKeyboard() {
  const el = document.activeElement
  setTabBarHidden('keyboard', opensKeyboard(el) && !el.closest?.('dialog'))
}

function onFocusOut() {
  // O foco ainda não chegou ao destino no focusout
  requestAnimationFrame(syncKeyboard)
}

onMounted(() => {
  document.addEventListener('focusin', syncKeyboard)
  document.addEventListener('focusout', onFocusOut)
  syncKeyboard()
})

// Espaço reservado embaixo (conteúdo, faixa de arrasto da borda) segue a barra
watchEffect(() => {
  const root = document.documentElement
  root.classList.add('has-tab-bar')
  root.classList.toggle('tab-bar-hidden', tabBarHidden.value)
})

onBeforeUnmount(() => {
  document.removeEventListener('focusin', syncKeyboard)
  document.removeEventListener('focusout', onFocusOut)
  setTabBarHidden('keyboard', false)
  document.documentElement.classList.remove('has-tab-bar', 'tab-bar-hidden')
})
</script>

<style scoped>
.tab-bar {
  position: fixed;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 140;
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  align-items: stretch;
  height: var(--tab-bar-height);
  padding: 0 var(--safe-right, 0px) var(--safe-bottom, 0px) var(--safe-left, 0px);
  border-top: 1px solid var(--border-color);
  background: color-mix(in srgb, var(--bg-panel) 94%, transparent);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  view-transition-name: tab-bar;
  transition: transform var(--dur-medium) var(--ease-enter);
}

.tab-bar.hidden {
  transform: translate3d(0, 110%, 0);
  transition: transform var(--dur-short) var(--ease-exit);
}

.tab {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  min-width: 0;
  padding: 6px 2px 4px;
  border: none;
  background: none;
  color: var(--text-secondary);
  font: inherit;
  text-decoration: none;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

/* Pílula atrás do ícone da aba acesa (cresce do centro ao trocar de aba) */
.tab-icon {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 30px;
  border-radius: 999px;
}

.tab-icon::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: rgba(var(--main-color-rgb), 0.16);
  opacity: 0;
  transform: scaleX(0.4);
  transition: transform var(--dur-short) var(--ease-exit), opacity var(--dur-short) linear;
}

.tab.active .tab-icon::before {
  opacity: 1;
  transform: none;
  transition: transform var(--dur-spring) var(--ease-spring), opacity var(--dur-short) linear;
}

.tab-icon .pi {
  position: relative;
  font-size: 1.15rem;
}

.tab-label {
  max-width: 100%;
  overflow: hidden;
  font-size: 0.6875rem;
  font-weight: 500;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tab.active {
  color: color-mix(in srgb, var(--main-color) var(--tint-text), var(--text-primary));
}

.tab.active .tab-label {
  font-weight: 700;
}

.tab:focus-visible,
.tab-add:focus-visible {
  outline: var(--focus-ring);
  outline-offset: -2px;
  border-radius: var(--radius-md);
}

.tab-add:focus-visible {
  outline-offset: 3px;
  border-radius: 50%;
}

.tab-badge {
  position: absolute;
  top: -2px;
  left: calc(50% + 6px);
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border: 2px solid var(--bg-panel);
  border-radius: 999px;
  background: var(--main-solid);
  color: var(--on-main);
  font-size: 0.625rem;
  font-weight: 700;
  line-height: 14px;
  text-align: center;
  box-sizing: border-box;
}

/* Adicionar: o círculo do meio, um pouco acima da linha das abas */
.tab-add-slot {
  display: flex;
  align-items: center;
  justify-content: center;
}

.tab-add {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  /* Círculo de 60 px com o anel de 4 px incluído (sem o padding padrão de
     botão, que deixava 72 × 62, oval) */
  flex: none;
  width: 60px;
  height: 60px;
  padding: 0;
  margin-top: -14px;
  border: 4px solid var(--bg-app);
  border-radius: 50%;
  aspect-ratio: 1;
  background: var(--main-solid);
  color: var(--on-main);
  box-shadow: var(--shadow-2);
  box-sizing: border-box;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.tab-add .pi {
  font-size: 1.35rem;
}

/* Telas estreitas (320 px): rótulos de 10 px, como os do iOS, para
   "Comunidade" caber inteiro */
@media (max-width: 359.98px) {
  .tab {
    padding-inline: 0;
  }

  .tab-label {
    font-size: 0.625rem;
    letter-spacing: -0.01em;
  }
}

@media (prefers-reduced-motion: reduce) {
  .tab-bar,
  .tab-bar.hidden,
  .tab-icon::before,
  .tab.active .tab-icon::before {
    transition: none;
  }
}
</style>

<style>
/* Livro abrindo/fechando em tela cheia: a barra vai junto com a página */
html[data-nav^="book"] .tab-bar {
  view-transition-name: none;
}
</style>
