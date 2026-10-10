<template>
  <div class="public-library-container">
    <header class="view-header">
      <router-link
        to="/"
        class="brand"
      >
        <img
          src="/bookshelf.png"
          alt=""
          width="28"
          height="28"
        />
        <span>LIBRISHELF</span>
      </router-link>

      <div
        v-if="!notFound"
        class="header-content"
      >
        <h1>{{ t('publicLibrary.title', { ownerName: ownerName || username }) }}</h1>
        <p>
          {{ t('publicLibrary.subtitle') }}
          <span v-if="total > 0"> · {{ t('publicLibrary.count', { count: total }, total) }}</span>
        </p>
      </div>
    </header>

    <div
      v-if="loading && books.length === 0"
      class="loading-state"
      aria-busy="true"
    >
      <i
        class="pi pi-spin pi-spinner"
        aria-hidden="true"
      ></i> {{ t('common.loading') }}
    </div>

    <div
      v-else-if="notFound"
      class="empty-state"
      role="status"
    >
      <i
        class="pi pi-lock state-icon"
        aria-hidden="true"
      ></i>
      <p>{{ t('publicLibrary.notFound') }}</p>
      <router-link
        to="/"
        class="state-link"
      >{{ t('notFound.goHome') }}</router-link>
    </div>

    <div
      v-else-if="error && books.length === 0"
      class="empty-state"
      role="alert"
    >
      <p>{{ t('publicLibrary.error') }}</p>
      <Button
        :label="t('common.retry')"
        icon="pi pi-refresh"
        class="p-button-outlined p-button-secondary"
        @click="loadLibrary()"
      />
    </div>

    <div
      v-else-if="books.length === 0"
      class="empty-state"
    >
      <p>{{ t('publicLibrary.empty') }}</p>
    </div>

    <template v-else>
      <div class="books-grid">
        <BookItem
          v-for="book in books"
          :key="book.book_id"
          :book="book"
          read-only
          :owner-username="username"
        />
      </div>

      <div
        v-if="books.length < total"
        class="load-more"
      >
        <Button
          :label="t('publicLibrary.loadMore')"
          icon="pi pi-angle-down"
          class="p-button-outlined p-button-secondary"
          :loading="loading"
          @click="loadLibrary({ append: true })"
        />
      </div>
    </template>

    <footer class="public-footer">
      <router-link to="/privacy">{{ t('login.privacy') }}</router-link>
      <span aria-hidden="true">·</span>
      <span>{{ t('publicLibrary.poweredBy') }}</span>
    </footer>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import Button from 'primevue/button'
import api from '../services/api.js'
import BookItem from '../components/BookItem.vue'

const PAGE_SIZE = 40

const { t } = useI18n()
const route = useRoute()

const books = ref([])
const ownerName = ref('')
const total = ref(0)
const page = ref(0)
const loading = ref(false)
const error = ref(false)
const notFound = ref(false)

const username = computed(() => String(route.params.username || ''))

async function loadLibrary({ append = false } = {}) {
  const nextPage = append ? page.value + 1 : 1
  const requestedFor = username.value

  loading.value = true
  error.value = false
  if (!append) notFound.value = false

  try {
    const response = await api.getPublicLibrary(requestedFor, { page: nextPage, limit: PAGE_SIZE, sort: 'title', order: 'asc' })

    // Navegou para outro usuário enquanto carregava: descarta.
    if (requestedFor !== username.value) return

    books.value = append ? [...books.value, ...response.result] : response.result
    ownerName.value = response.owner || requestedFor
    total.value = response.total || 0
    page.value = nextPage
  } catch (err) {
    if (requestedFor !== username.value) return
    if (err.status === 404) {
      notFound.value = true
      books.value = []
    } else {
      error.value = true
    }
  } finally {
    loading.value = false
  }
}

// /u/a → /u/b reaproveita o componente; recarrega quando o usuário da URL muda.
watch(username, () => {
  books.value = []
  total.value = 0
  page.value = 0
  loadLibrary()
}, { immediate: true })
</script>

<style scoped>
.public-library-container {
  padding: 2rem;
  min-height: 100vh;
  width: 100%;
  background-color: var(--bg-app);
  display: flex;
  flex-direction: column;
}

.view-header {
  margin-bottom: 2rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.brand {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--text-secondary);
  text-decoration: none;
  font-weight: 700;
  letter-spacing: 0.05em;
  font-size: 0.85rem;
  width: fit-content;
}

.brand:hover {
  color: var(--text-primary);
}

.header-content h1 {
  font-family: 'Georgia', serif;
  font-size: 2rem;
  color: var(--text-primary);
  margin: 0;
}

.header-content p {
  color: var(--text-secondary);
  margin-top: 0.5rem;
}

.books-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 2rem;
  justify-content: center;
}

.load-more {
  display: flex;
  justify-content: center;
  margin-top: 2rem;
}

.loading-state,
.empty-state {
  text-align: center;
  padding: 4rem;
  color: var(--text-muted);
  font-size: 1.1rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
}

.state-icon {
  font-size: 2rem;
}

.state-link {
  color: var(--main-color);
}

.public-footer {
  margin-top: auto;
  padding-top: 3rem;
  display: flex;
  gap: 0.5rem;
  justify-content: center;
  color: var(--text-muted);
  font-size: 0.85rem;
}

.public-footer a {
  color: inherit;
}

@media (max-width: 640px) {
  .public-library-container {
    padding: 1.25rem;
  }

  .books-grid {
    grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
    gap: 1.25rem;
  }
}
</style>
