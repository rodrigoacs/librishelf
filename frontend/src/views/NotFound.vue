<template>
  <div class="not-found">
    <p
      class="code"
      aria-hidden="true"
    >404</p>
    <h1>{{ t('notFound.title') }}</h1>
    <p class="message">{{ t('notFound.message') }}</p>

    <!-- Quem está logado procura direto na biblioteca, sem voltar ao início -->
    <form
      v-if="isAuthenticated"
      class="search-form"
      role="search"
      @submit.prevent="search"
    >
      <SearchField
        id="not-found-search"
        v-model="query"
        :region="false"
        :label="t('notFound.searchLabel')"
        :placeholder="t('notFound.searchPh')"
      />
      <AppButton
        type="submit"
        :label="t('notFound.searchButton')"
        class="btn-primary"
        :disabled="!query.trim()"
      />
    </form>

    <nav
      class="links"
      :aria-label="t('notFound.linksLabel')"
    >
      <router-link
        to="/"
        class="btn btn-primary"
      >
        <i
          class="pi pi-home"
          aria-hidden="true"
        ></i>
        <span>{{ t('notFound.goHome') }}</span>
      </router-link>
      <router-link
        :to="{ name: 'library' }"
        class="btn btn-outlined btn-secondary"
      >
        <i
          class="pi pi-book"
          aria-hidden="true"
        ></i>
        <span>{{ t('notFound.goLibrary') }}</span>
      </router-link>
    </nav>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import AppButton from '../components/ui/AppButton.vue'
import { isAuthenticated } from '../services/session.js'
import SearchField from '../components/ui/SearchField.vue'

const { t } = useI18n()
const router = useRouter()
const query = ref('')

function search() {
  const q = query.value.trim()
  if (q) router.push({ name: 'library', query: { q } })
}
</script>

<style scoped>
.not-found {
  min-height: 100vh;
  min-height: 100dvh;
  width: 100%;
  padding: var(--space-7) var(--space-5);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  background-color: var(--bg-app);
  color: var(--text-primary);
}

.code {
  font-family: var(--font-display);
  font-size: 6rem;
  font-weight: 700;
  margin: 0;
  color: var(--main-color);
  line-height: 1;
}

h1 {
  margin: var(--space-4) 0 var(--space-2) 0;
  font-size: var(--fs-xl);
}

.message {
  color: var(--text-secondary);
  margin: 0 0 var(--space-7) 0;
}

.search-form {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: min(100%, 26rem);
  margin-bottom: var(--space-6);
}

.search-form .btn {
  height: 2.75rem;
  border-radius: var(--radius-pill);
  flex-shrink: 0;
}

.links {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--space-3);
}

.links .btn {
  border-radius: var(--radius-pill);
}
</style>
