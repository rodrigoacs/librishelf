<template>
  <div class="privacy-container">
    <article class="privacy-article">
      <router-link
        :to="isAuthenticated ? '/settings' : '/login'"
        class="back-link"
      >
        <i
          class="pi pi-arrow-left"
          aria-hidden="true"
        ></i>
        {{ t('common.back') }}
      </router-link>

      <h1>{{ t('privacy.title') }}</h1>
      <p class="updated">{{ t('privacy.updated', { date: updatedAt }) }}</p>
      <p class="intro">{{ t('privacy.intro') }}</p>

      <section
        v-for="(section, index) in sections"
        :key="index"
      >
        <h2>{{ rt(section.title) }}</h2>
        <p
          v-for="(paragraph, pIndex) in section.paragraphs"
          :key="pIndex"
        >
          <template v-if="splitEmail(paragraph).hasEmail">
            {{ splitEmail(paragraph).before }}<a :href="`mailto:${CONTACT_EMAIL}`">{{ CONTACT_EMAIL }}</a>{{ splitEmail(paragraph).after }}
          </template>
          <template v-else>{{ splitEmail(paragraph).before }}</template>
        </p>
      </section>
    </article>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { CONTACT_EMAIL, PRIVACY_UPDATED_AT } from '../config/site.js'
import { isAuthenticated } from '../services/session.js'

const { t, tm, rt, locale } = useI18n()

// Marca para trocar {email} por um link mailto dentro do parágrafo.
const EMAIL_TOKEN = '§§EMAIL§§'

function splitEmail(message) {
  const text = rt(message, { email: EMAIL_TOKEN })
  const [before, after = ''] = text.split(EMAIL_TOKEN)
  return { hasEmail: text.includes(EMAIL_TOKEN), before, after }
}

const sections = computed(() => tm('privacy.sections'))

const updatedAt = computed(() => {
  const [year, month, day] = PRIVACY_UPDATED_AT.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString(locale.value === 'pt' ? 'pt-BR' : 'en-US', {
    day: 'numeric', month: 'long', year: 'numeric'
  })
})
</script>

<style scoped>
.privacy-container {
  padding: 2rem;
  min-height: 100vh;
  min-height: 100dvh;
  width: 100%;
  background-color: var(--bg-app);
  display: flex;
  justify-content: center;
}

.privacy-article {
  max-width: 720px;
  width: 100%;
  color: var(--text-primary);
  line-height: 1.65;
}

.back-link {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--text-secondary);
  text-decoration: none;
  font-size: var(--fs-md);
  margin-bottom: 1.5rem;
}

.back-link:hover {
  color: var(--main-color);
}

h1 {
  font-family: var(--font-display);
  font-size: var(--fs-3xl);
  margin: 0;
}

h2 {
  font-size: var(--fs-lg);
  margin: 2rem 0 0.5rem 0;
}

p {
  color: var(--text-secondary);
  margin: 0.5rem 0;
}

.updated {
  color: var(--text-muted);
  font-size: var(--fs-sm);
}

.intro {
  font-size: var(--fs-md);
  color: var(--text-primary);
  margin-top: 1.5rem;
}

a {
  color: var(--main-color);
}

@media (max-width: 640px) {
  .privacy-container {
    padding: 1.25rem;
  }

  h1 {
    font-size: var(--fs-2xl);
  }
}
</style>
