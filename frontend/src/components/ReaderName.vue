<template>
  <router-link
    v-if="isPublic"
    :to="{ name: 'public-library', params: { username }, query }"
    class="reader-name link"
    :title="`@${username}`"
  >@{{ username }}</router-link>

  <span
    v-else
    class="reader-name private"
    tabindex="0"
    :title="`@${username}`"
    v-tooltip.top="t('communityView.private_library')"
  >
    <span class="name-text">@{{ username }}</span>
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
  min-width: 0;
  max-width: 100%;
}

/* Nome longo (até 50 caracteres) termina em reticências; o nome inteiro fica
   no title, e o cadeado da biblioteca privada continua visível */
.link,
.name-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.link {
  display: inline-block;
  vertical-align: bottom;
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
  border-radius: var(--radius-sm);
}

.private .pi {
  flex-shrink: 0;
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