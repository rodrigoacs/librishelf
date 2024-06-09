<template>
  <div class="wrapper">
    <NavigationMenu />
  </div>
</template>

<script setup>
import NavigationMenu from './components/NavigationMenu.vue'

</script>

<style scoped>
.wrapper {
  display: flex;
  flex-direction: row;
  align-items: center;
  padding: 20px;
}
</style>
