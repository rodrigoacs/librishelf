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
      <label
        for="not-found-search"
        class="sr-only"
      >{{ t('notFound.searchLabel') }}</label>
      <i
        class="pi pi-search search-icon"
        aria-hidden="true"
      ></i>
      <input
        id="not-found-search"
        v-model="query"
        type="search"
        :placeholder="t('notFound.searchPh')"
        autocomplete="off"
        enterkeyhint="search"
      />
      <AppButton
        type="submit"
        :label="t('notFound.searchButton')"
        class="btn-sm"
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
  padding: 2rem 1.25rem;
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
  margin: 1rem 0 0.5rem 0;
  font-size: var(--fs-xl);
}

.message {
  color: var(--text-secondary);
  margin: 0 0 2rem 0;
}

.search-form {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: min(100%, 26rem);
  margin-bottom: 1.5rem;
  padding: 0.3rem 0.3rem 0.3rem 2.5rem;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-pill);
  background: var(--bg-panel);
}

.search-form:focus-within {
  border-color: var(--main-color);
  box-shadow: var(--focus-glow);
}

.search-icon {
  position: absolute;
  left: 1rem;
  color: var(--text-muted);
}

.search-form input {
  flex: 1;
  min-width: 0;
  border: none;
  background: transparent;
  color: var(--text-primary);
  font: inherit;
  font-size: var(--fs-md);
  padding: 0.45rem 0;
  outline: none;
}

.search-form .btn {
  border-radius: var(--radius-pill);
}

.links {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.75rem;
}

.links .btn {
  border-radius: var(--radius-pill);
}
</style>
