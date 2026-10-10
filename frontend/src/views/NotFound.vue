<template>
  <div class="not-found">
    <p
      class="code"
      aria-hidden="true"
    >404</p>
    <h1>{{ t('notFound.title') }}</h1>
    <p class="message">{{ t('notFound.message') }}</p>
    <router-link
      to="/"
      class="home-link"
    >
      <i
        class="pi pi-home"
        aria-hidden="true"
      ></i>
      {{ t('notFound.goHome') }}
    </router-link>
  </div>
</template>

<script setup>
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
</script>

<style scoped>
.not-found {
  min-height: 100vh;
  width: 100%;
  padding: 2rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  background-color: var(--bg-app);
  color: var(--text-primary);
}

.code {
  font-family: 'Georgia', serif;
  font-size: 6rem;
  font-weight: 700;
  margin: 0;
  color: var(--main-color);
  line-height: 1;
}

h1 {
  margin: 1rem 0 0.5rem 0;
  font-size: 1.6rem;
}

.message {
  color: var(--text-secondary);
  margin: 0 0 2rem 0;
}

.home-link {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1.5rem;
  border-radius: 999px;
  background-color: var(--main-color);
  color: var(--text-inverse);
  text-decoration: none;
  font-weight: 600;
}

.home-link:hover {
  filter: brightness(1.1);
}
</style>
