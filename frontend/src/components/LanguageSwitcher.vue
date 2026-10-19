<template>
  <div
    class="lang-switcher"
    role="group"
    :aria-label="t('menu.language')"
  >
    <button
      type="button"
      class="lang-btn"
      :class="{ active: locale === 'pt' }"
      :aria-pressed="locale === 'pt'"
      :aria-label="t('language.switchTo', { lang: 'Português' })"
      lang="pt-BR"
      @click="setLocale('pt')"
    >PT</button>

    <span
      class="divider"
      aria-hidden="true"
    >/</span>

    <button
      type="button"
      class="lang-btn"
      :class="{ active: locale === 'en' }"
      :aria-pressed="locale === 'en'"
      :aria-label="t('language.switchTo', { lang: 'English' })"
      lang="en"
      @click="setLocale('en')"
    >EN</button>
  </div>
</template>

<script setup>
import { useI18n } from 'vue-i18n'
import { setLocale } from '../i18n.js'

const { t, locale } = useI18n()
</script>

<style scoped>
.lang-switcher {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  font-size: var(--fs-sm);
  font-weight: 600;
  color: var(--text-muted);
}

.divider {
  opacity: 0.3;
  font-weight: 400;
}

.lang-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: inherit;
  padding: 0;
  transition: color 0.2s;
  font-size: inherit;
  font-weight: inherit;
}

.lang-btn:hover {
  color: var(--text-primary);
}

.lang-btn.active {
  color: var(--main-color);
}
</style>