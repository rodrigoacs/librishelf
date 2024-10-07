<template>
  <div class="card">
    <h1>Authors</h1>
    <DataView
      :value="authors"
      layout="grid"
    >
      <template #grid="slotProps">
        <div class="author-grid">
          <div
            v-for="(author, index) in slotProps.items"
            :key="index"
            class="author-item"
          >
            <div class="author-id">ID: {{ author.id }}</div>
            <div class="author-name">{{ author.name }}</div>
          </div>
        </div>
      </template>
    </DataView>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import DataView from 'primevue/dataview'
import { fetchAuthors } from '../../../backend/src/services/api.js'

const authors = ref([])

onMounted(() => {
  fetchAuthors()
    .then(data => {
      let id = 1
      authors.value = data.map(author => ({
        id: id++,
        name: author.name
      }))
    })
    .catch(error => {
      console.error("Error fetching authors:", error)
    })
})
</script>

<style scoped>
.card {
  padding: 0 1rem;
  height: 95vh;
  width: 85vw;
  overflow-y: auto;
  background-color: #121212;
  color: #ffffff;
}

.card h1 {
  font-size: 1.5rem;
  margin-bottom: 1rem;
  text-align: center;
  color: #ffffff;
}

.author-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 1rem;
  padding: 1rem;
  background-color: #121212;
}

.author-item {
  background-color: #1e1e1e;
  padding: 1rem;
  border-radius: 8px;
  text-align: center;
  color: #ffffff;
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.15);
}

.author-id {
  font-weight: bold;
}

.author-name {
  margin-top: 0.5rem;
  font-size: 1.2rem;
}

@media screen and (max-width: 1200px) {
  .author-grid {
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  }
}

@media screen and (max-width: 768px) {
  .card {
    width: 100vw;
    padding: 0.5rem;
  }

  .author-grid {
    grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
  }

  .card h1 {
    font-size: 1.2rem;
  }
}
</style>
