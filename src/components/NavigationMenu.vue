<template>
  <Menu
    class="menu"
    :model="items"
    style="margin-right: 1rem;"
  >
    <template #start>
      <div class="wrapper">
        <img
          width="40"
          height="40"
          src="https://img.icons8.com/external-smashingstocks-isometric-smashing-stocks/440/external-Bookshelf-interior-smashingstocks-isometric-smashing-stocks-3.png"
          alt="external-Bookshelf-interior-smashingstocks-isometric-smashing-stocks-3"
        />
        <div>
          <span style="color: var(--primary-color);">MY</span>
          <span style="font-weight: bold;">LIBRARY</span>
        </div>
      </div>
    </template>


  </Menu>
</template>

<script setup>
import { useRouter } from 'vue-router'

import Menu from 'primevue/menu'

const router = useRouter()

const items = [
  {
    separator: true
  },
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

<style scoped>
.wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  font-size: 1.1rem;
  font-weight: 300;
  margin: .8rem 0;
}
</style>