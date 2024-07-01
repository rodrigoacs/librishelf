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
          <span style="color: var(--main-color);">LIBRI</span>
          <span style="font-weight: bold;">SHELF</span>
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
  {
    label: 'Read Books',
    icon: 'pi pi-fw pi-check',
    command: () => { router.push('/read') }
  },
  {
    label: 'Unread Books',
    icon: 'pi pi-fw pi-times',
    command: () => { router.push('/unread') }
  },
  {
    label: 'Publishers',
    icon: 'pi pi-fw pi-users',
    command: () => { router.push('/publishers') }
  },
  {
    label: 'Authors',
    icon: 'pi pi-fw pi-user',
    command: () => { router.push('/authors') }
  },
  {
    label: 'Categories',
    icon: 'pi pi-fw pi-tags',
    command: () => { router.push('/categories') }
  },
  {
    label: 'Series',
    icon: 'pi pi-fw pi-list',
    command: () => { router.push('/series') }
  },
  {
    separator: true
  },
  {
    label: 'Settings',
    icon: 'pi pi-fw pi-cog',
    command: () => { router.push('/settings') }
  },
  {
    label: 'About',
    icon: 'pi pi-fw pi-info',
    command: () => { router.push('/about') }
  }
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