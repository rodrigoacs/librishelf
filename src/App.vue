<template>
  <div class="wrapper">
    <NavigationMenu />
    <RouterView />
  </div>
</template>

<script setup>
import NavigationMenu from './components/NavigationMenu.vue'
import { RouterView } from 'vue-router'
</script>

<style scoped>
.wrapper {
  display: flex;
  flex-direction: row;
  align-items: center;
  height: 100vh;
  margin: 0 6rem;
}
</style>
