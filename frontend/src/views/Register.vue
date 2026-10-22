<template>
  <AuthLayout
    :title="t('register.header')"
    :subtitle="t('register.welcome')"
  >
    <div class="header">
      <h1>{{ t('register.createAccount') }}</h1>
      <p class="subtitle">{{ t('register.allData') }}</p>
    </div>

    <form
      @submit.prevent="handleRegister"
      class="auth-form"
      novalidate
    >
      <div class="field">
        <TextField
          id="register-name"
          v-model="name"
          :label="t('register.user')"
          autocomplete="username"
          maxlength="50"
          :hint="t('register.invalidUsername')"
          :input-attrs="{ autocapitalize: 'none', spellcheck: 'false' }"
        />
      </div>

      <div class="field">
        <TextField
          id="register-email"
          v-model="email"
          :label="t('register.email')"
          type="email"
          autocomplete="email"
        />
      </div>

      <div class="field">
        <PasswordField
          id="register-password"
          v-model="password"
          :label="t('register.password')"
          autocomplete="new-password"
          strength
        />
      </div>

      <div class="field">
        <PasswordField
          id="register-confirm-password"
          v-model="confirmPassword"
          :label="t('register.confirmPassword')"
          autocomplete="new-password"
        />
      </div>

      <AppButton
        type="submit"
        :label="t('register.register')"
        class="btn-primary w-full btn-lg"
        :loading="loading"
      />
    </form>

    <div class="footer">
      <p>{{ t('register.haveAccount') }} <router-link :to="{ name: 'login', query: route.query }">{{ t('register.login') }}</router-link></p>
      <p class="muted-link">
        {{ t('register.privacyNotice') }}
        <router-link
          to="/privacy"
          class="muted-link"
        >{{ t('register.privacyLink') }}</router-link>.
      </p>
    </div>
  </AuthLayout>
</template>

<script setup>
import PasswordField from '../components/form/PasswordField.vue'
import TextField from '../components/form/TextField.vue'
import { isWeakPassword } from '../utils/password.js'
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useToast } from '../services/toast.js'
import AppButton from '../components/ui/AppButton.vue'
import { useI18n } from 'vue-i18n'
import AuthLayout from '../components/AuthLayout.vue'
import api from '../services/api.js'

// Espelha a regra do backend (services/authService.js → USERNAME_PATTERN e
// utils/passwordPolicy.js); o backend continua sendo quem decide.
const USERNAME_PATTERN = /^[\p{L}\p{N}._-]+$/u

const { t, locale } = useI18n()
const router = useRouter()
const route = useRoute()
const toast = useToast()

const name = ref('')
const email = ref('')
const password = ref('')
const confirmPassword = ref('')
const loading = ref(false)

function fail(detail) {
  toast.add({ severity: 'error', summary: t('register.error'), detail, life: 4000 })
}

async function handleRegister() {
  if (!name.value.trim() || !email.value.trim() || !password.value) {
    toast.add({ severity: 'warn', summary: t('register.attention'), detail: t('register.fillFields'), life: 3000 })
    return
  }

  if (!USERNAME_PATTERN.test(name.value.trim())) return fail(t('register.invalidUsername'))
  if (password.value !== confirmPassword.value) return fail(t('register.passwordMismatch'))

  if (isWeakPassword(password.value)) return fail(t('register.passwordTooWeak'))

  loading.value = true
  try {
    await api.register({
      username: name.value.trim(),
      email: email.value.trim(),
      password: password.value,
      locale: locale.value
    })

    toast.add({ severity: 'success', summary: t('register.success'), detail: t('register.accountCreatedVerify'), life: 7000 })
    router.push({ name: 'login', query: route.query })
  } catch (error) {
    fail(error.message || t('register.errorCreating'))
  } finally {
    loading.value = false
  }
}
</script>
