<template>
  <!-- Barra do topo no celular: landmark próprio para o logo não ficar solto -->
  <header class="mobile-header">
    <!-- No celular o menu fica na aba "Menu" da barra de baixo -->
    <AppButton
      v-if="!phone"
      ref="menuButton"
      icon="pi pi-bars"
      class="btn-text menu-btn"
      :aria-label="t('menu.openMenu')"
      :aria-expanded="drawerOpen"
      aria-controls="app-sidebar"
      @click="drawerOpen = true"
    />
    <div class="mobile-logo-wrapper">
      <img
        src="/bookshelf.png"
        alt=""
        width="30"
        height="30"
      />
      <BrandWordmark class="logo-text" />
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
      <!-- Abre o AccentPopover (cor de destaque e claro/escuro) -->
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
        :class="{ 'has-photo': photo }"
        :aria-label="t('menu.settings')"
        data-press
      >
        <img
          v-if="photo"
          :src="photo"
          alt=""
          class="bar-photo"
          draggable="false"
          @error="photoFailed = true"
        />
        <template v-else>{{ userInitials(displayName) }}</template>
      </router-link>
    </div>
  </header>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import AppButton from '../ui/AppButton.vue'
import BrandWordmark from '../BrandWordmark.vue'
import { useIsPhone } from '../../composables/useIsPhone.js'
import { useTheme } from '../../composables/useTheme.js'
import { useMyAvatar } from '../../composables/useMyAvatar.js'
import { drawerOpen } from '../../services/appNav.js'
import { requestLibrarySearch } from '../../services/librarySearch.js'
import { userInitials } from '../../utils/userName.js'

const router = useRouter()
const route = useRoute()
const { t } = useI18n()
const phone = useIsPhone()
const { currentTheme } = useTheme()
const { displayName, photo, photoFailed } = useMyAvatar()

const menuButton = ref(null)

async function openSearch() {
  if (route.name !== 'library') await router.push({ name: 'library' })
  requestLibrarySearch()
}

defineExpose({
  /** Foco no ☰ (tablet). false quando ele não existe (celular: aba "Menu"). */
  focusMenuButton() {
    if (!menuButton.value) return false
    menuButton.value.$el?.focus()
    return true
  }
})
</script>

<style scoped>
.header-spacer {
  width: 40px;
  flex-shrink: 0;
}

.mobile-header {
  display: none;
}

@media (max-width: 1023.98px) {
  .mobile-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-3) var(--space-4);
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
    gap: var(--space-2);
  }

  .mobile-header .logo-text {
    font-size: var(--fs-lg);
  }
}

.bar-actions {
  display: none;
}

/* ---------------------------------------------------------------- celular
 * Barra do topo de app (logo à esquerda; busca, tema e conta à direita).
 * Só abaixo de 640 px; o tablet continua com o ☰ e o logo no centro.
 */
@media (max-width: 639.98px) {
  .mobile-header {
    justify-content: flex-start;
    gap: var(--space-1);
    height: calc(56px + var(--safe-top));
    padding: var(--safe-top) var(--space-2) 0 var(--space-4);
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

  .header-spacer {
    display: none;
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

  .bar-avatar.has-photo {
    background: none;
  }

  .bar-photo {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    object-fit: cover;
    box-shadow: 0 0 0 1px var(--border-color);
  }

  /* Livro abrindo/fechando em tela cheia: a barra entra na troca junto com a
     página (senão ficaria por cima do livro até a animação acabar) */
  :global(html[data-nav^="book"] .mobile-header) {
    view-transition-name: none;
  }
}
</style>
