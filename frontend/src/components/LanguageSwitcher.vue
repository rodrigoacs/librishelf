<template>
  <div class="lang-switcher">
    <button
      class="lang-btn"
      :class="{ active: locale === 'pt' }"
      @click="setLanguage('pt')"
    >PT</button>

    <span class="divider">/</span>

    <button
      class="lang-btn"
      :class="{ active: locale === 'en' }"
      @click="setLanguage('en')"
    >EN</button>
  </div>
</template>

<script setup>
import { useI18n } from 'vue-i18n'

const { locale } = useI18n()

function setLanguage(lang) {
  locale.value = lang
  localStorage.setItem('user-locale', lang)
}
</script>

<style scoped>
.lang-switcher {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.85rem;
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