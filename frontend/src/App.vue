<template>
  <div
    class="app-layout"
    :class="{ 'is-standalone': !showNavigation }"
  >
    <a
      class="skip-link"
      href="#main-content"
    >{{ t('common.skipToContent') }}</a>

    <NavigationMenu v-if="showNavigation" />

    <main
      class="main-content"
      id="main-content"
      tabindex="-1"
    >
      <Toast
        position="bottom-right"
        :breakpoints="{ '640px': { width: 'calc(100vw - 2rem)', left: '1rem', right: '1rem' } }"
      />
      <ConfirmDialog />
      <EmailBanner
        v-if="showNavigation && currentUser && currentUser.emailVerified === false"
        :email="currentUser.email"
      />
      <router-view />
    </main>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import NavigationMenu from './components/NavigationMenu.vue'
import Toast from 'primevue/toast'
import ConfirmDialog from 'primevue/confirmdialog'
import { isAuthenticated, currentUser } from './services/session.js'
import EmailBanner from './components/EmailBanner.vue'

const route = useRoute()
const { t } = useI18n()

// Menu só para quem está logado e fora das telas cheias (login, cadastro,
// biblioteca pública). Privacidade e 404 mostram o menu se houver sessão.
const showNavigation = computed(() => {
  if (route.meta.standalone) return false
  if (route.meta.public) return isAuthenticated.value
  return Boolean(route.meta.requiresAuth)
})
</script>

<style>
body {
  margin: 0;
  padding: 0;
  font-family: var(--font-family);
  background-color: var(--bg-app);
  overflow-x: hidden;
}

.app-layout {
  display: flex;
  min-height: 100vh;
  min-height: 100dvh;
  width: 100%;
  flex-direction: row;
}

.main-content {
  flex: 1;
  min-width: 0;
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
}

@media (max-width: 768px) {
  .app-layout {
    flex-direction: column;
  }

  .main-content {
    width: 100%;
  }
}
</style>
