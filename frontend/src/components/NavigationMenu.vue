<template>
  <div>
    <div class="popup-wrapper">
      <Button
        v-if="showButton"
        type="button"
        icon="pi pi-bars"
        @click="toggleMenu"
        aria-haspopup="true"
        aria-controls="overlay_menu"
      />
      <div>
        <span style="color: var(--main-color);">LIBRI</span>
        <span style="font-weight: bold;">SHELF</span>
      </div>
    </div>

    <Menu
      ref="menu"
      id="overlay_menu"
      class="menu"
      :model="items"
      :popup="popup"
    >
      <template #start>
        <div class="wrapper">
          <img
            width="40"
            height="40"
            src="https://img.icons8.com/external-smashingstocks-isometric-smashing-stocks/440/external-Bookshelf-interior-smashingstocks-isometric-smashing-stocks-3.png"
            alt="Librishelf logo"
          />
          <div>
            <span style="color: var(--main-color);">LIBRI</span>
            <span style="font-weight: bold;">SHELF</span>
          </div>
        </div>
      </template>
    </Menu>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import Menu from 'primevue/menu'
import Button from 'primevue/button'

const menu = ref(null)
const popup = ref(true)
const showButton = ref(true)
const router = useRouter()

const items = [
  { separator: true },
  { label: 'Home', icon: 'pi pi-fw pi-home', command: () => router.push('/') },
  { label: 'Library', icon: 'pi pi-fw pi-book', command: () => router.push('/library') },
  { label: 'Read Books', icon: 'pi pi-fw pi-check', command: () => router.push('/read') },
  { label: 'Unread Books', icon: 'pi pi-fw pi-times', command: () => router.push('/unread') },
  { label: 'Publishers', icon: 'pi pi-fw pi-users', command: () => router.push('/publishers') },
  { label: 'Authors', icon: 'pi pi-fw pi-user', command: () => router.push('/authors') },
  { label: 'Categories', icon: 'pi pi-fw pi-tags', command: () => router.push('/categories') },
  { label: 'Series', icon: 'pi pi-fw pi-list', command: () => router.push('/series') },
  { separator: true },
  { label: 'Settings', icon: 'pi pi-fw pi-cog', command: () => router.push('/settings') },
  { label: 'About', icon: 'pi pi-fw pi-info', command: () => router.push('/about') }
]

function toggleMenu(event) {
  menu.value.toggle(event)
}

function handleResize() {
  const isMobile = window.innerWidth <= 768
  popup.value = isMobile
  showButton.value = isMobile
}

onMounted(() => {
  handleResize()
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
})
</script>

<style scoped>
.popup-wrapper {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem 1rem;
  gap: 0.5rem;
}

.wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  font-size: 1.1rem;
  font-weight: 300;
}

.p-button {
  background-color: var(--main-color);
  color: var(--text-color);
  border: 1px solid var(--main-color);
}

@media screen and (min-width: 768px) {
  .popup-wrapper {
    display: none;
  }

}
</style>
