<template>
  <AuthLayout
    title="Librishelf"
    :subtitle="t('login.header')"
  >
    <div class="header">
      <h1>{{ t('forgot.title') }}</h1>
      <p class="subtitle">{{ sent ? t('forgot.sentText', { email: sentTo }) : t('forgot.text') }}</p>
    </div>

    <form
      v-if="!sent"
      class="auth-form"
      novalidate
      @submit.prevent="submit"
    >
      <div class="field">
        <TextField
          id="forgot-email"
          v-model="email"
          :label="t('forgot.email')"
          type="email"
          autocomplete="email"
          :input-attrs="{ autocapitalize: 'none', spellcheck: 'false' }"
        />
      </div>

      <AppButton
        type="submit"
        :label="t('forgot.submit')"
        class="btn-primary w-full btn-lg"
        :loading="loading"
      />
    </form>

    <div
      v-else
      class="auth-form"
    >
      <p
        class="state-note"
        role="status"
      >
        <i
          class="pi pi-envelope"
          aria-hidden="true"
        ></i>
        {{ t('forgot.checkSpam') }}
      </p>
      <AppButton
        :label="t('forgot.tryAgain')"
        class="btn-outlined btn-secondary w-full"
        @click="sent = false"
      />
    </div>

    <div class="footer">
      <p><router-link :to="{ name: 'login' }">{{ t('forgot.backToLogin') }}</router-link></p>
    </div>
  </AuthLayout>
</template>

<script setup>
import TextField from '../components/form/TextField.vue'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from '../services/toast.js'
import AppButton from '../components/ui/AppButton.vue'
import AuthLayout from '../components/AuthLayout.vue'
import api from '../services/api.js'

const { t, locale } = useI18n()
const toast = useToast()

const email = ref('')
const sent = ref(false)
const sentTo = ref('')
const loading = ref(false)

async function submit() {
  const value = email.value.trim()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    toast.add({ severity: 'warn', summary: t('login.attention'), detail: t('forgot.invalidEmail'), life: 3000 })
    return
  }

  loading.value = true
  try {
    await api.forgotPassword(value, locale.value)
    // A resposta é a mesma exista a conta ou não: a tela também.
    sentTo.value = value
    sent.value = true
  } catch (error) {
    toast.add({ severity: 'error', summary: t('common.error'), detail: error.message, life: 4000 })
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.state-note {
  display: flex;
  gap: 0.6rem;
  align-items: flex-start;
  margin: 0;
  color: var(--text-secondary);
  line-height: 1.5;
}

.state-note .pi {
  color: var(--main-color);
  margin-top: 0.2rem;
}
</style>
