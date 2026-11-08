<template>
  <div class="page legal-container">
    <PageHeader
      :title="t(keys.title)"
      :back="isAuthenticated ? '/settings' : '/login'"
      :back-label="t('common.back')"
    >
      <template #subtitle>
        <p class="updated">{{ t('legal.updated', { date: updatedAt }) }}</p>
      </template>
    </PageHeader>

    <p
      v-if="LEGAL_DRAFT"
      class="legal-draft"
      role="note"
    >
      <i
        class="pi pi-info-circle"
        aria-hidden="true"
      ></i>
      <span>{{ t('legal.draft') }}</span>
    </p>

    <article class="legal-article">
      <LegalText
        tag="p"
        class="intro"
        :text="t(keys.intro, params)"
      />

      <section
        v-for="(section, index) in sections"
        :key="index"
      >
        <h2>{{ rt(section.title) }}</h2>
        <LegalText
          v-for="(paragraph, pIndex) in section.paragraphs"
          :key="pIndex"
          tag="p"
          :text="rt(paragraph, params)"
        />
      </section>
    </article>

    <LegalLinks class="legal-footer" />
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import PageHeader from '../components/ui/PageHeader.vue'
import LegalText from '../components/legal/LegalText.vue'
import LegalLinks from '../components/legal/LegalLinks.vue'
import { LEGAL_DRAFT, TERMS_VERSION } from '../config/site.js'
import { legalParams } from '../utils/legalText.js'
import { isAuthenticated } from '../services/session.js'

/**
 * Termos de uso (/terms) e Política de privacidade (/privacy): o mesmo
 * layout, com o texto em locales (terms.* e privacy.*). As duas têm a mesma
 * versão e são aceitas juntas (config/site.js → TERMS_VERSION).
 */
const props = defineProps({
  doc: { type: String, required: true, validator: value => ['terms', 'privacy'].includes(value) }
})

const DOCS = {
  terms: { title: 'terms.title', intro: 'terms.intro', sections: 'terms.sections' },
  privacy: { title: 'privacy.title', intro: 'privacy.intro', sections: 'privacy.sections' }
}

const { t, tm, rt, locale } = useI18n()

const keys = computed(() => DOCS[props.doc])
const params = legalParams()
const sections = computed(() => tm(keys.value.sections))

const updatedAt = computed(() => {
  const [year, month, day] = TERMS_VERSION.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString(locale.value === 'pt' ? 'pt-BR' : 'en-US', {
    day: 'numeric', month: 'long', year: 'numeric'
  })
})
</script>

<style scoped>
/* Texto corrido: largura de leitura, como a página do Skoob (exceção à
   largura toda das outras telas) */
.legal-container {
  /* Casca e recuo em .page (main.css) */
  --page-max: 720px;
}

.legal-article {
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

.legal-draft {
  display: flex;
  gap: var(--space-2);
  align-items: flex-start;
  margin: 0 0 var(--space-5);
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  background: var(--bg-panel);
  color: var(--text-secondary);
  font-size: var(--fs-sm);
}

.legal-draft .pi {
  margin-top: 0.2em;
  color: var(--main-color);
}

.intro {
  font-size: var(--fs-md);
  color: var(--text-primary);
  margin-top: 0;
}

.legal-article :deep(a) {
  color: var(--main-color);
}

.legal-footer {
  margin-top: var(--space-8);
  color: var(--text-muted);
  font-size: var(--fs-sm);
}
</style>
