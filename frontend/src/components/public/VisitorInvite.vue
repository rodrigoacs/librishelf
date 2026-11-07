<template>
  <!-- Convite para quem chega pelo link sem conta (pacote 33). No celular fica
       preso embaixo; dá para fechar (vale até fechar a aba). -->
  <aside
    v-if="!closed"
    class="visitor-invite"
    :aria-label="t('publicPage.invite.title')"
  >
    <div class="invite-text">
      <p class="invite-title">{{ t('publicPage.invite.title') }}</p>
      <p class="invite-body">{{ t('publicPage.invite.text', { name }) }}</p>
    </div>
    <div class="invite-actions">
      <router-link
        :to="{ name: 'register', query: { redirect } }"
        class="btn btn-primary"
      >{{ t('publicPage.invite.cta') }}</router-link>
      <router-link
        :to="{ name: 'login', query: { redirect } }"
        class="btn btn-text btn-secondary"
      >{{ t('publicPage.invite.login') }}</router-link>
    </div>
    <IconButton
      icon="pi pi-times"
      :label="t('publicPage.invite.close')"
      class="invite-close"
      @click="close"
    />
  </aside>
</template>

<script setup>
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import IconButton from '../form/IconButton.vue'

defineProps({
  name: { type: String, required: true },
  // Volta para cá depois do cadastro/login
  redirect: { type: String, required: true }
})
const { t } = useI18n()

const KEY = 'public-invite-closed'

function readClosed() {
  try {
    return sessionStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

const closed = ref(readClosed())

function close() {
  closed.value = true
  try {
    sessionStorage.setItem(KEY, '1')
  } catch {
    // modo privado: fecha só nesta página
  }
}
</script>

<style scoped>
.visitor-invite {
  position: sticky;
  bottom: var(--space-4);
  z-index: 5;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-3) var(--space-4);
  margin-top: var(--space-6);
  padding: var(--space-4) var(--space-5);
  padding-right: var(--space-8);
  border: 1px solid rgba(var(--main-color-rgb), 0.35);
  border-radius: var(--card-radius);
  background: var(--bg-panel);
  box-shadow: var(--shadow-2);
}

.invite-text {
  display: flex;
  flex: 1 1 16rem;
  flex-direction: column;
  gap: var(--space-1);
  min-width: 0;
}

.invite-title {
  margin: 0;
  color: var(--text-primary);
  font-weight: 700;
}

.invite-body {
  margin: 0;
  color: var(--text-secondary);
  font-size: var(--fs-sm);
  line-height: 1.45;
}

.invite-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.invite-close {
  position: absolute;
  top: var(--space-2);
  right: var(--space-2);
}

@media (max-width: 639.98px) {
  .visitor-invite {
    bottom: calc(var(--space-3) + env(safe-area-inset-bottom, 0px));
    padding: var(--space-3) var(--space-4);
    padding-right: var(--space-8);
  }

  .invite-body {
    display: none;
  }

  .invite-actions {
    width: 100%;
  }

  .invite-actions .btn-primary {
    flex: 1;
  }
}
</style>
