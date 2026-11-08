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
          ref="nameField"
          v-model="name"
          :error="errors.name"
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
          ref="emailField"
          v-model="email"
          :error="errors.email"
          :label="t('register.email')"
          type="email"
          autocomplete="email"
        />
      </div>

      <div class="field">
        <PasswordField
          id="register-password"
          ref="passwordField"
          v-model="password"
          :error="errors.password"
          :label="t('register.password')"
          autocomplete="new-password"
          strength
        />
      </div>

      <div class="field">
        <PasswordField
          id="register-confirm-password"
          ref="confirmField"
          v-model="confirmPassword"
          :error="errors.confirm"
          :label="t('register.confirmPassword')"
          autocomplete="new-password"
        />
      </div>

      <div class="field">
        <CheckField
          id="register-terms"
          ref="termsField"
          v-model="acceptTerms"
          :error="errors.terms"
        >
          <LegalText
            :text="t('register.acceptTerms', legalParams())"
            new-tab
          />
        </CheckField>
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
    </div>
  </AuthLayout>
</template>

<script setup>
import PasswordField from '../components/form/PasswordField.vue'
import TextField from '../components/form/TextField.vue'
import CheckField from '../components/form/CheckField.vue'
import LegalText from '../components/legal/LegalText.vue'
import { legalParams } from '../utils/legalText.js'
import { isWeakPassword } from '../utils/password.js'
import { ref, reactive, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useToast } from '../services/toast.js'
import AppButton from '../components/ui/AppButton.vue'
import { useI18n } from 'vue-i18n'
import AuthLayout from '../components/AuthLayout.vue'
import api from '../services/api.js'
import { USERNAME_PATTERN, EMAIL_PATTERN } from '../utils/accountRules.js'
import { focusFirstError as focusFirstWith } from '../utils/formState.js'

const { t, locale } = useI18n()
const router = useRouter()
const route = useRoute()
const toast = useToast()

const name = ref('')
const email = ref('')
const password = ref('')
const confirmPassword = ref('')
const acceptTerms = ref(false)
const loading = ref(false)

// Erros embaixo de cada campo (como na Conta); toast só para o que não é de campo.
const errors = reactive({ name: '', email: '', password: '', confirm: '', terms: '' })
const nameField = ref(null)
const emailField = ref(null)
const passwordField = ref(null)
const confirmField = ref(null)
const termsField = ref(null)
const FIELDS = { name: nameField, email: emailField, password: passwordField, confirm: confirmField, terms: termsField }

watch(name, () => { errors.name = '' })
watch(email, () => { errors.email = '' })
watch(password, () => { errors.password = '' })
watch(confirmPassword, () => { errors.confirm = '' })
watch(acceptTerms, () => { errors.terms = '' })

// Código da API → campo
const CODE_FIELDS = {
  USERNAME_TAKEN: 'name',
  USERNAME_OR_EMAIL_TAKEN: 'name',
  USERNAME_INVALID: 'name',
  USERNAME_RESERVED: 'name',
  USERNAME_TOO_LONG: 'name',
  EMAIL_INVALID: 'email',
  EMAIL_TAKEN: 'email',
  PASSWORD_TOO_SHORT: 'password',
  PASSWORD_TOO_LONG: 'password',
  PASSWORD_NEEDS_LETTER: 'password',
  PASSWORD_NEEDS_NUMBER: 'password',
  TERMS_REQUIRED: 'terms'
}

const focusFirstError = () => focusFirstWith(errors, FIELDS)

function validate() {
  const required = t('settings.errors.required')
  const cleanName = name.value.trim()
  errors.name = !cleanName ? required : (USERNAME_PATTERN.test(cleanName) ? '' : t('register.invalidUsername'))
  errors.email = !email.value.trim() ? required : (EMAIL_PATTERN.test(email.value.trim()) ? '' : t('settings.errors.email'))
  errors.password = !password.value ? required : (isWeakPassword(password.value) ? t('register.passwordTooWeak') : '')
  errors.confirm = !confirmPassword.value ? required : (password.value !== confirmPassword.value ? t('register.passwordMismatch') : '')
  errors.terms = acceptTerms.value ? '' : t('register.acceptTermsRequired')
  return !Object.values(errors).some(Boolean)
}

async function handleRegister() {
  if (!validate()) {
    focusFirstError()
    return
  }

  loading.value = true
  try {
    await api.register({
      username: name.value.trim(),
      email: email.value.trim(),
      password: password.value,
      locale: locale.value,
      acceptTerms: acceptTerms.value
    })

    toast.add({ severity: 'success', detail: t('register.accountCreatedVerify'), life: 7000 })
    router.push({ name: 'login', query: route.query })
  } catch (error) {
    const field = CODE_FIELDS[error.code]
    if (field) {
      errors[field] = error.message
      focusFirstError()
    } else {
      toast.add({ severity: 'error', detail: error.message || t('register.errorCreating'), life: 4000 })
    }
  } finally {
    loading.value = false
  }
}
</script>
