<template>
  <AuthLayout
    title="Librishelf"
    :subtitle="t('login.header')"
  >
    <div
      class="header"
      role="status"
    >
      <h1>{{ heading }}</h1>
      <p class="subtitle">{{ message }}</p>
    </div>

    <div
      v-if="state !== 'loading'"
      class="auth-form"
    >
      <Button
        v-if="state === 'done'"
        :label="isAuthenticated ? t('verify.goHome') : t('verify.goLogin')"
        class="btn-action-primary w-full p-button-lg"
        @click="router.replace(isAuthenticated ? { name: 'home' } : { name: 'login' })"
      />
      <template v-else>
        <Button
          v-if="isAuthenticated"
          :label="t('verify.resend')"
          icon="pi pi-envelope"
          class="btn-action-primary w-full"
          :loading="resending"
          @click="resend"
        />
        <Button
          v-else
          :label="t('verify.goLogin')"
          class="p-button-outlined p-button-secondary w-full"
          @click="router.replace({ name: 'login', query: { redirect: '/settings' } })"
        />
      </template>
    </div>
  </AuthLayout>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useToast } from 'primevue/usetoast'
import Button from 'primevue/button'
import AuthLayout from '../components/AuthLayout.vue'
import api from '../services/api.js'
import { isAuthenticated, loadSession, updateUser } from '../services/session.js'

const { t, locale } = useI18n()
const toast = useToast()
const route = useRoute()
const router = useRouter()

const state = ref('loading') // loading | done | failed
const errorMessage = ref('')
const resending = ref(false)

const heading = computed(() => ({
  loading: t('verify.loading'),
  done: t('verify.doneTitle'),
  failed: t('verify.failedTitle')
}[state.value]))

const message = computed(() => {
  if (state.value === 'done') return t('verify.doneText')
  if (state.value === 'failed') return errorMessage.value || t('verify.failedText')
  return ''
})

async function resend() {
  resending.value = true
  try {
    const result = await api.resendVerification(locale.value)
    toast.add({ severity: 'success', summary: t('common.success'), detail: result.alreadyVerified ? t('verify.already') : t('verify.sent'), life: 5000 })
  } catch (error) {
    toast.add({ severity: 'error', summary: t('common.error'), detail: error.message, life: 5000 })
  } finally {
    resending.value = false
  }
}

onMounted(async () => {
  const token = String(route.query.token || '')
  // Tira o token da barra de endereço/histórico.
  router.replace({ query: {} })

  try {
    await api.verifyEmail(token)
    state.value = 'done'
    if (await loadSession()) updateUser({ emailVerified: true })
  } catch (error) {
    errorMessage.value = error.message
    state.value = 'failed'
    await loadSession()
  }
})
</script>
