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
        <span class="p-float-label">
          <InputText
            id="register-name"
            v-model="name"
            class="w-full"
            autocomplete="username"
            autocapitalize="none"
            spellcheck="false"
            maxlength="50"
            aria-describedby="register-name-hint"
          />
          <label for="register-name">{{ t('register.user') }}</label>
        </span>
        <small
          id="register-name-hint"
          class="field-hint"
        >{{ t('register.invalidUsername') }}</small>
      </div>

      <div class="field">
        <span class="p-float-label">
          <InputText
            id="register-email"
            v-model="email"
            class="w-full"
            type="email"
            autocomplete="email"
          />
          <label for="register-email">{{ t('register.email') }}</label>
        </span>
      </div>

      <div class="field">
        <span class="p-float-label">
          <Password
            inputId="register-password"
            v-model="password"
            class="w-full"
            toggleMask
            :feedback="true"
            :promptLabel="t('register.passwordPrompt')"
            :weakLabel="t('register.weak')"
            :mediumLabel="t('register.medium')"
            :strongLabel="t('register.strong')"
            :inputProps="{ autocomplete: 'new-password' }"
          />
          <label for="register-password">{{ t('register.password') }}</label>
        </span>
      </div>

      <div class="field">
        <span class="p-float-label">
          <Password
            inputId="register-confirm-password"
            v-model="confirmPassword"
            class="w-full"
            :feedback="false"
            toggleMask
            :inputProps="{ autocomplete: 'new-password' }"
          />
          <label for="register-confirm-password">{{ t('register.confirmPassword') }}</label>
        </span>
      </div>

      <Button
        type="submit"
        :label="t('register.register')"
        class="btn-action-primary w-full p-button-lg"
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
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import InputText from 'primevue/inputtext'
import Password from 'primevue/password'
import Button from 'primevue/button'
import { useI18n } from 'vue-i18n'
import AuthLayout from '../components/AuthLayout.vue'
import api from '../services/api.js'

// Espelha a regra do backend (services/authService.js → USERNAME_PATTERN e
// utils/passwordPolicy.js); o backend continua sendo quem decide.
const USERNAME_PATTERN = /^[\p{L}\p{N}._-]+$/u
const PASSWORD_MIN = 8
const PASSWORD_MAX_BYTES = 72

const { t } = useI18n()
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

  const weak = password.value.length < PASSWORD_MIN ||
    new TextEncoder().encode(password.value).length > PASSWORD_MAX_BYTES ||
    !/[a-zA-Z]/.test(password.value) ||
    !/[0-9]/.test(password.value)
  if (weak) return fail(t('register.passwordTooWeak'))

  loading.value = true
  try {
    await api.register({
      username: name.value.trim(),
      email: email.value.trim(),
      password: password.value
    })

    toast.add({ severity: 'success', summary: t('register.success'), detail: t('register.accountCreated'), life: 3000 })
    router.push({ name: 'login', query: route.query })
  } catch (error) {
    fail(error.message || t('register.errorCreating'))
  } finally {
    loading.value = false
  }
}
</script>
