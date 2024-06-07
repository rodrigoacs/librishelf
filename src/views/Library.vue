<template>
  <div class="card">
    <DataView
      :value="books"
      layout="grid"
    >
      <template #grid="slotProps">
        <div
          v-for="(item, index) in slotProps.items"
          :key="index"
          class="book-item"
        >
          <img
            :src="item.path"
            alt="Book Cover"
          />
          <div class="book-info">
            <span>{{ item.title }}</span>
            <span>{{ item.authors }}</span>
          </div>
        </div>
      </template>
    </DataView>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import DataView from 'primevue/dataview'
import 'primevue/resources/themes/saga-blue/theme.css'
import 'primevue/resources/primevue.min.css'
import 'primeicons/primeicons.css'

const books = ref([])

onMounted(() => {
  fetch('http://localhost:3000/library')
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`)
      }
      return response.json()
    })
    .then(data => {
      books.value = data
    })
    .catch(error => console.error('Error fetching data:', error))
})
</script>

<style scoped>
.p-dataview {
  background-color: #250d0d !important;
}

.card {
  padding: 20px;
}

.book-item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  margin-bottom: 20px;
  border-bottom: 1px solid #ddd;
  padding-bottom: 10px;
  gap: 10px;
}

.book-item img {
  width: 140px;
  height: 220px;
  object-fit: cover;
  margin-right: 20px;
}

.book-info {
  display: flex;
  flex-direction: column;
}

.book-info span {
  margin-bottom: 5px;
}
</style>
