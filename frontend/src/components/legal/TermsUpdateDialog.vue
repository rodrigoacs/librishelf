<template>
  <AppDialog
    :visible="true"
    size="sm"
    dialog-class="terms-update"
    :header="t('legal.update.title')"
    :dismissable="false"
    :close-on-escape="false"
    :closable="false"
    :back-closes="false"
    :before-close="keepOpen"
  >
    <div class="terms-stack">
      <LegalText
        tag="p"
        class="terms-text"
        :text="t('legal.update.text', params)"
        new-tab
      />
      <p class="terms-text muted">{{ t('legal.update.hint') }}</p>
      <div class="actions">
        <AppButton
          :label="t('legal.update.accept')"
          class="btn-primary w-full"
          autofocus
          :loading="busy"
          @click="accept"
        />
        <div class="secondary">
          <AppButton
            :label="t('legal.update.account')"
            class="btn-text"
            :disabled="busy"
            @click="router.push({ name: 'settings' })"
          />
          <AppButton
            :label="t('legal.update.logout')"
            class="btn-text"
            :disabled="busy"
            @click="leave"
          />
        </div>
      </div>
    </div>
  </AppDialog>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import AppDialog from '../ui/AppDialog.vue'
import AppButton from '../ui/AppButton.vue'
import LegalText from './LegalText.vue'
import api from '../../services/api.js'
import { currentUser, loadSession, logout, updateUser } from '../../services/session.js'
import { useToast } from '../../services/toast.js'
import { legalParams } from '../../utils/legalText.js'

/**
 * Versão nova dos termos: o app só segue depois do aceite. Quem não concorda
 * vai para Conta (onde o aviso não aparece) baixar os dados e excluir a
 * conta, ou sai. Os links abrem em outra aba, para ler sem perder esta tela.
 * App.vue decide quando mostrar (currentUser.terms.accepted === false).
 */
const { t } = useI18n()
const router = useRouter()
const toast = useToast()

const params = legalParams()
const busy = ref(false)
const keepOpen = () => false

async function accept() {
  busy.value = true
  try {
    updateUser({ terms: await api.acceptTerms(currentUser.value.terms.version) })
  } catch (error) {
    toast.add({ severity: 'error', detail: error.message })
    // Versão mudou de novo no servidor: busca a nova e o aviso continua
    if (error.code === 'TERMS_OUTDATED') await loadSession({ force: true })
  } finally {
    busy.value = false
  }
}

async function leave() {
  busy.value = true
  try {
    await logout()
    router.replace({ name: 'login' })
  } finally {
    busy.value = false
  }
}
</script>

<style scoped>
.terms-stack {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.terms-text {
  margin: 0;
  color: var(--text-secondary);
  line-height: 1.55;
}

.actions {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.secondary {
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.muted {
  color: var(--text-muted);
  font-size: var(--fs-sm);
}

.terms-text :deep(a) {
  color: var(--main-color);
}
</style>
