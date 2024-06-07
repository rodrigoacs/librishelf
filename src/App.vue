<template>
  <div class="wrapper">
    <div class="h-wrapper">
      <Button>
        <RouterLink
          to="/"
          class="routerlink"
        >
          Home
        </RouterLink>
      </Button>
      <Button>
        <RouterLink
          to="/library"
          class="routerlink"
        >
          Library
        </RouterLink>
      </Button>
    </div>
    <RouterView />
  </div>
</template>

<script setup>
import { RouterView } from 'vue-router'
import { RouterLink } from 'vue-router'

import Button from 'primevue/button'

</script>

<style scoped>
.p-button {
  padding: 10px 20px;
  margin-right: 10px;
}

.routerlink {
  text-decoration: none;
  color: #fff;
}
</style>
