<template>
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
        @click="event => onItemClick(event, navigate)"
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
</template>

<script setup>
import { computed, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { currentUser, logout } from '../../services/session.js'
import { useToast } from '../../services/toast.js'
import { pendingRequests, refreshPendingRequests, resetPendingRequests } from '../../services/social.js'

/**
 * Itens do menu lateral (gaveta no celular e no tablet) e o "Sair".
 * Clique simples num item: emite `navigate` com a função de navegar do
 * router-link; quem tem a gaveta fecha antes e só então navega.
 */
const emit = defineEmits(['navigate'])

const router = useRouter()
const route = useRoute()
const { t } = useI18n()
const toast = useToast()

const items = computed(() => [
  { label: t('menu.home'), icon: 'pi pi-home', route: '/' },
  { label: t('menu.library'), icon: 'pi pi-book', route: '/books' },
  { label: t('menu.lists'), icon: 'pi pi-list', route: '/lists' },
  { label: t('menu.authors'), icon: 'pi pi-users', route: '/authors' },
  { label: t('menu.publishers'), icon: 'pi pi-building', route: '/publishers' },
  { label: t('menu.categories'), icon: 'pi pi-tags', route: '/tags' },
  { label: t('menu.loans'), icon: 'pi pi-arrow-up-right', route: '/loans' },
  { label: t('menu.dashboard'), icon: 'pi pi-chart-bar', route: '/dashboard' },
  { label: t('menu.community'), icon: 'pi pi-globe', route: '/community', badge: pendingRequests.value },
  { label: t('menu.settings'), icon: 'pi pi-user', route: '/settings' },
  ...(currentUser.value?.isAdmin ? [{ label: t('menu.admin'), icon: 'pi pi-shield', route: '/admin' }] : [])
])

// Selo da Comunidade: confere os pedidos ao trocar de tela (no máximo 1×/min)
watch(() => route.path, () => {
  if (currentUser.value) refreshPendingRequests()
}, { immediate: true })

// Ctrl/⌘/Shift/botão do meio continuam com o comportamento do navegador
function onItemClick(event, navigate) {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
  event.preventDefault()
  emit('navigate', navigate)
}

async function handleLogout() {
  // Mesmo se a chamada falhar, este aparelho sai; o pedido fica guardado e
  // o servidor encerra a sessão quando o app voltar a ter conexão.
  const { serverDone } = await logout()
  resetPendingRequests()
  if (!serverDone) toast.add({ severity: 'warn', detail: t('menu.logoutPending'), life: 10000 })
  router.push('/login')
}
</script>

<style scoped>
.nav-links {
  flex: 1;
  padding: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  overflow-y: auto;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-3) var(--space-4);
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

.nav-badge {
  margin-left: auto;
  min-width: 1.25rem;
  height: 1.25rem;
  padding: 0 var(--space-1);
  border-radius: var(--radius-pill);
  background: var(--main-solid);
  color: var(--on-main);
  font-size: var(--fs-xs);
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.separator {
  height: 1px;
  background-color: var(--border-color);
  margin: var(--space-2) 0;
}

@media (max-width: 639.98px) {
  /* A lista rola na vertical; o lado é do gesto de fechar a gaveta (sem
     pan-y aqui o navegador toma o toque e cancela o arrasto) */
  .nav-links {
    overscroll-behavior: contain;
    touch-action: pan-y;
  }

  /* Itens entram em cascata quando a gaveta termina de abrir */
  .sidebar-mobile-open .nav-item,
  .sidebar-mobile-open .separator {
    animation: nav-item-in var(--dur-medium) var(--ease-enter) both;
    animation-delay: calc(min(var(--i, 10), 10) * var(--stagger));
  }
}

@keyframes nav-item-in {
  from {
    opacity: 0;
    /* Entram vindo da direita, como a gaveta (só no celular) */
    transform: translate3d(16px, 0, 0);
  }
}
</style>
