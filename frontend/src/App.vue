<template>
  <div class="wrapper">
    <NavigationMenu v-if="showNavigationMenu" />
    <RouterView />
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import NavigationMenu from './components/NavigationMenu.vue'

const route = useRoute()

const showNavigationMenu = computed(() => {
  return !['/login', '/register'].includes(route.path)
})
</script>

<style scoped>
.wrapper {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  height: 100vh;
  width: 100vw;
  margin: 0 6rem;
}

@media (max-width: 768px) {
  .wrapper {
    flex-direction: column;
    margin: 0;
  }

  .wrapper > * {
    width: 100%;
  }
}
</style>
