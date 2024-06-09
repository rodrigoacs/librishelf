<template>
  <Menu
    class="menu"
    :model="items"
    style="margin-right: 1rem;"
  />
</template>

<script setup>
import { useRouter } from 'vue-router'

import Menu from 'primevue/menu'

const router = useRouter()

const items = [
  {
    label: 'Home',
    icon: 'pi pi-fw pi-home',
    command: () => { router.push('/') }
  },
  {
    label: 'Library',
    icon: 'pi pi-fw pi-book',
    command: () => { router.push('/library') }
  },
]
</script>

<style scoped></style>