<template>
  <div class="page skoob-container">
    <PageHeader
      :title="t('import.skoob.title')"
      :back="isAuthenticated ? '/import' : '/login'"
      :back-label="t('settings.data.importTitle')"
    />
    <article class="skoob-article">
      <p class="intro">{{ t('import.skoob.intro') }}</p>

      <h2 class="section-title">{{ t('import.skoob.toolsTitle') }}</h2>
      <p>{{ t('import.skoob.tools') }}</p>

      <h2 class="section-title">{{ t('import.skoob.risksTitle') }}</h2>
      <ul>
        <li>{{ t('import.skoob.risk1') }}</li>
        <li>{{ t('import.skoob.risk2') }}</li>
        <li>{{ t('import.skoob.risk3') }}</li>
        <li>{{ t('import.skoob.risk4') }}</li>
      </ul>

      <h2 class="section-title">{{ t('import.skoob.afterTitle') }}</h2>
      <p>{{ t('import.skoob.after') }}</p>
      <p>{{ t('import.skoob.manual') }}</p>

      <router-link
        v-if="isAuthenticated"
        :to="{ name: 'import' }"
        class="link"
      >{{ t('import.skoob.toImport') }}</router-link>
    </article>
  </div>
</template>

<script setup>
import { useI18n } from 'vue-i18n'
import PageHeader from '../components/ui/PageHeader.vue'
import { isAuthenticated } from '../services/session.js'

/** Ajuda: o Skoob não exporta; o que existe são ferramentas da comunidade. */
const { t } = useI18n()
</script>

<style scoped>
.skoob-container {
  --page-max: 720px;
}

.skoob-article {
  color: var(--text-primary);
  line-height: 1.65;
}

.intro {
  margin-top: 0;
  font-size: var(--fs-md);
}

.section-title {
  margin: var(--space-7) 0 var(--space-2);
}

p,
li {
  color: var(--text-secondary);
}

ul {
  padding-left: var(--space-5);
  margin: var(--space-2) 0;
}

.link {
  display: inline-block;
  margin-top: var(--space-5);
  color: var(--main-color);
  font-weight: 600;
}
</style>
