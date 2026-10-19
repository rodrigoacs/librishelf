<template>
  <AuthLayout
    title="Librishelf"
    :subtitle="t('login.header')"
  >
    <div class="header">
      <h1>{{ t('login.welcome') }}</h1>
      <p class="subtitle">{{ t('login.credentials') }}</p>
    </div>

    <form
      @submit.prevent="handleLogin"
      class="auth-form"
      novalidate
    >
      <div class="field">
        <span class="p-float-label">
          <InputText
            id="login-user"
            v-model="username"
            class="w-full"
            autocomplete="username"
            autocapitalize="none"
            spellcheck="false"
          />
          <label for="login-user">{{ t('login.user') }}</label>
        </span>
      </div>

      <div class="field">
        <span class="p-float-label">
          <Password
            inputId="login-password"
            v-model="password"
            class="w-full"
            :feedback="false"
            toggleMask
            :inputProps="{ autocomplete: 'current-password' }"
          />
          <label for="login-password">{{ t('login.password') }}</label>
        </span>
        <router-link
          :to="{ name: 'forgot-password' }"
          class="forgot-link"
        >{{ t('login.forgot') }}</router-link>
      </div>

      <Button
        type="submit"
        :label="t('login.login')"
        class="btn-action-primary w-full p-button-lg"
        :loading="loading"
      />
    </form>

    <div class="footer">
      <p>{{ t('login.newUser') }} <router-link :to="{ name: 'register', query: route.query }">{{ t('login.createAccount') }}</router-link></p>
      <p><router-link
          to="/privacy"
          class="muted-link"
        >{{ t('login.privacy') }}</router-link></p>
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
import { loadSession } from '../services/session.js'
import { safeRedirect } from '../router/index.js'

const { t } = useI18n()
const router = useRouter()
const route = useRoute()
const toast = useToast()

const username = ref('')
const password = ref('')
const loading = ref(false)

async function handleLogin() {
  if (!username.value.trim() || !password.value) {
    toast.add({ severity: 'warn', summary: t('login.attention'), detail: t('login.fillFields'), life: 3000 })
    return
  }

  loading.value = true

  try {
    await api.login({ username: username.value.trim(), password: password.value })
    await loadSession({ force: true })

    // Sem toast de boas-vindas: a tela de Início já mostra que entrou
    router.replace(safeRedirect(route.query.redirect))
  } catch (error) {
    // 401 = credenciais; qualquer outro (429 do rate limit, 5xx) mostra a
    // mensagem do servidor em vez de "credenciais inválidas".
    const detail = error.status === 401 ? t('login.invalidCreds') : (error.message || t('login.invalidCreds'))
    toast.add({ severity: 'error', summary: t('login.error'), detail, life: 4000 })
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.forgot-link {
  display: inline-block;
  margin-top: 0.5rem;
  font-size: var(--fs-sm);
  color: var(--text-secondary);
  text-decoration: none;
}

.forgot-link:hover {
  color: var(--main-color);
  text-decoration: underline;
}
</style>
