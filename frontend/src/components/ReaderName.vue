<template>
  <router-link
    v-if="isPublic"
    :to="{ name: 'public-library', params: { username }, query }"
    class="reader-name link"
  >@{{ username }}</router-link>

  <span
    v-else
    class="reader-name private"
    tabindex="0"
    v-tooltip.top="t('communityView.private_library')"
  >
    @{{ username }}
    <i
      class="pi pi-lock"
      aria-hidden="true"
    ></i>
    <span class="sr-only">({{ t('communityView.private_library') }})</span>
  </span>
</template>

<script setup>
import { useI18n } from 'vue-i18n'

/**
 * @fulano com link para a página pública; se a biblioteca for privada, a
 * página não existe, então mostra o nome com um cadeado em vez de um link quebrado.
 */
defineProps({
  username: { type: String, required: true },
  isPublic: Boolean,
  query: { type: Object, default: undefined }
})

const { t } = useI18n()
</script>

<style scoped>
.reader-name {
  font-weight: 600;
}

.link {
  color: var(--main-color);
  text-decoration: none;
}

.link:hover {
  text-decoration: underline;
}

.private {
  color: var(--text-primary);
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  cursor: default;
  border-radius: 4px;
}

.private .pi {
  font-size: 0.75em;
  color: var(--text-muted);
}

.private:focus-visible {
  outline: var(--focus-ring);
  outline-offset: var(--focus-offset);
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  border: 0;
}
</style>