<template>
  <div class="page privacy-container">
    <PageHeader
      :title="t('privacy.title')"
      :back="isAuthenticated ? '/settings' : '/login'"
      :back-label="t('common.back')"
    >
      <template #subtitle>
        <p class="updated">{{ t('privacy.updated', { date: updatedAt }) }}</p>
      </template>
    </PageHeader>
    <article class="privacy-article">
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
import PageHeader from '../components/ui/PageHeader.vue'
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
  /* Casca e recuo em .page (main.css) */
  --page-max: 720px;
}

.privacy-article {
  width: 100%;
  color: var(--text-primary);
  line-height: 1.65;
}

h2 {
  font-size: var(--fs-lg);
  margin: var(--space-7) 0 var(--space-2) 0;
}

p {
  color: var(--text-secondary);
  margin: var(--space-2) 0;
}

.updated {
  margin: 0;
  color: var(--text-muted);
  font-size: var(--fs-sm);
}

.intro {
  font-size: var(--fs-md);
  color: var(--text-primary);
  margin-top: 0;
}

a {
  color: var(--main-color);
}

@media (max-width: 639.98px) {
}
</style>
