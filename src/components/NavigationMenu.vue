<template>
  <div class="wrapper">
    <Menu :model="items">
      <template #end>
        <AutoComplete
          placeholder="Search"
          :suggestions="filteredTitles"
          v-model="value"
          @complete="search"
        />
      </template>
    </Menu>
    <RouterView class="content" />
  </div>
</template>

<script setup>
import { useRouter, RouterView } from 'vue-router'
import { ref } from 'vue'

import Menu from 'primevue/menu'
import AutoComplete from 'primevue/autocomplete'

const value = ref('')
const filteredTitles = ref([])

const router = useRouter()

const titles = ref([])

fetch('http://localhost:3000/library?fields=title')
  .then(response => {
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`)
    }
    return response.json()
  }).then(data => {
    titles.value = data.map(item => item.title)
  })
  .catch(error => console.error('Error fetching data:', error))

const search = (event) => {
  filteredTitles.value = titles.value.filter(title =>
    title.toLowerCase().includes(event.query.toLowerCase())
  )
}

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

<style scoped>
.wrapper {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20px;
  width: 80vw;
}

.content {
  height: 80vh;
  width: 100%;
  overflow-y: scroll;
}

.p-menu {
  background-color: #333;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 20px;
}

.p-autocomplete {
  max-width: 100px;
}
</style>
