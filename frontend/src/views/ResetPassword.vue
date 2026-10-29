<template>
  <AuthLayout
    title="Librishelf"
    :subtitle="t('login.header')"
  >
    <div class="header">
      <h1>{{ t('reset.title') }}</h1>
      <p class="subtitle">{{ missingToken ? t('reset.noToken') : t('reset.text') }}</p>
    </div>

    <form
      v-if="!missingToken"
      class="auth-form"
      novalidate
      @submit.prevent="submit"
    >
      <!-- Campo oculto: gerenciadores de senha guardam a senha nova na conta certa. -->
      <input
        type="text"
        autocomplete="username"
        class="sr-only"
        tabindex="-1"
        aria-hidden="true"
        readonly
      />

      <div class="field">
        <PasswordField
          id="reset-password"
          v-model="password"
          :label="t('reset.newPassword')"
          autocomplete="new-password"
          strength
        />
      </div>

      <div class="field">
        <PasswordField
          id="reset-confirm"
          v-model="confirm"
          :label="t('reset.confirm')"
          autocomplete="new-password"
        />
      </div>

      <AppButton
        type="submit"
        :label="t('reset.submit')"
        class="btn-primary w-full btn-lg"
        :loading="loading"
      />
    </form>

    <div class="footer">
      <p v-if="missingToken"><router-link :to="{ name: 'forgot-password' }">{{ t('reset.askNew') }}</router-link></p>
      <p><router-link :to="{ name: 'login' }">{{ t('forgot.backToLogin') }}</router-link></p>
    </div>
  </AuthLayout>
</template>

<script setup>
import PasswordField from '../components/form/PasswordField.vue'
import { ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useToast } from '../services/toast.js'
import AppButton from '../components/ui/AppButton.vue'
import AuthLayout from '../components/AuthLayout.vue'
import api from '../services/api.js'
import { clearSession } from '../services/session.js'
import { isWeakPassword } from '../utils/password.js'

const { t } = useI18n()
const toast = useToast()
const route = useRoute()
const router = useRouter()

const token = computed(() => String(route.query.token || ''))
const missingToken = computed(() => token.value.length < 20)

const password = ref('')
const confirm = ref('')
const loading = ref(false)

function warn(detail) {
  toast.add({ severity: 'warn', detail, life: 4000 })
}

async function submit() {
  if (isWeakPassword(password.value)) return warn(t('register.passwordTooWeak'))
  if (password.value !== confirm.value) return warn(t('register.passwordMismatch'))

  loading.value = true
  try {
    await api.resetPassword(token.value, password.value)
    clearSession()
    toast.add({ severity: 'success', detail: t('reset.done'), life: 5000 })
    // Tira o token da barra de endereço/histórico antes de sair.
    router.replace({ name: 'login' })
  } catch (error) {
    toast.add({ severity: 'error', detail: error.message, life: 6000 })
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  border: 0;
  padding: 0;
  margin: -1px;
}
</style>
