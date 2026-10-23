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
        <TextField
          id="login-user"
          v-model="username"
          :label="t('login.user')"
          autocomplete="username"
          :input-attrs="{ autocapitalize: 'none', spellcheck: 'false' }"
        />
      </div>

      <div class="field">
        <PasswordField
          id="login-password"
          v-model="password"
          :label="t('login.password')"
          autocomplete="current-password"
        />
        <router-link
          :to="{ name: 'forgot-password' }"
          class="forgot-link"
        >{{ t('login.forgot') }}</router-link>
      </div>

      <AppButton
        type="submit"
        :label="t('login.login')"
        class="btn-primary w-full btn-lg"
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
import PasswordField from '../components/form/PasswordField.vue'
import TextField from '../components/form/TextField.vue'
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useToast } from '../services/toast.js'
import AppButton from '../components/ui/AppButton.vue'
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
/* Link de verdade (cor do tema, sublinhado), alinhado à direita embaixo da senha */
.forgot-link {
  display: block;
  width: fit-content;
  margin: 0.5rem 0 0 auto;
  font-size: var(--fs-sm);
  font-weight: 600;
  color: var(--main-color);
  text-decoration: underline;
  text-underline-offset: 3px;
}

.forgot-link:hover {
  text-decoration-thickness: 2px;
}

@media (pointer: coarse) {
  .forgot-link {
    padding: 0.6rem 0;
    margin-top: 0;
  }
}
</style>
