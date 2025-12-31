<template>
  <div class="app-layout">
    <NavigationMenu v-if="!isAuthRoute" />

    <main class="main-content">
      <Toast position="bottom-right" />
      <ConfirmDialog />
      <router-view />
    </main>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import NavigationMenu from './components/NavigationMenu.vue'
import Toast from 'primevue/toast'
import ConfirmDialog from 'primevue/confirmdialog'

const route = useRoute()
const isAuthRoute = computed(() => {
  return ['/login', '/register'].includes(route.path)
})
</script>

<style>
body {
  margin: 0;
  padding: 0;
  font-family: var(--font-family);
  background-color: #121212;
  overflow-x: hidden;
}

.app-layout {
  display: flex;
  min-height: 100vh;
  width: 100%;
  flex-direction: row;
}

.main-content {
  flex: 1;
  min-width: 0;
  min-height: 100vh;
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
