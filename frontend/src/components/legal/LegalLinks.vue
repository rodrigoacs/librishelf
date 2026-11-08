<template>
  <nav
    class="legal-links"
    :aria-label="t('legal.links.label')"
  >
    <router-link :to="{ name: 'terms' }">{{ t('legal.links.terms') }}</router-link>
    <span aria-hidden="true">·</span>
    <router-link :to="{ name: 'privacy' }">{{ t('legal.links.privacy') }}</router-link>
  </nav>
</template>

<script setup>
import { useI18n } from 'vue-i18n'

/** Rodapé com Termos de uso · Privacidade. A cor vem de quem usa (herda). */
const { t } = useI18n()
</script>

<style scoped>
.legal-links {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}

.legal-links a {
  color: inherit;
  text-decoration: none;
}

.legal-links a:hover {
  color: var(--main-color);
  text-decoration: underline;
}
</style>
