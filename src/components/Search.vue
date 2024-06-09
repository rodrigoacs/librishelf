<template>
  <div class="search-wrapper">
    <AutoComplete
      placeholder="Search"
      :suggestions="filteredTitles"
      v-model="value"
      @complete="search"
      @change="onChange"
    />
  </div>
</template>

<script setup>
import { ref } from 'vue'
import AutoComplete from 'primevue/autocomplete'
import { useRouter } from 'vue-router'

const value = ref('')
const filteredTitles = ref([])
const titles = ref([])
const router = useRouter()

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

const onChange = (event) => {
  router.push(`/library?search=${event.value}`)
}
</script>

<style scoped>
.search-wrapper {
  position: sticky;
  top: 0;
  width: 100%;
  z-index: 1000;
}

.p-autocomplete {
  width: 100%;
}

::v-deep .p-autocomplete input {
  width: 100%;
}

::v-deep .p-autocomplete-panel {
  width: 100px;
}
</style>