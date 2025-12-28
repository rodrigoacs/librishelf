<template>
  <div class="login-container">
    <Toast
      ref="toast"
      position="top-center"
    />
    <Card>
      <template #header>
        <h2>Login</h2>
      </template>
      <template #content>
        <form @submit.prevent="handleLogin">
          <FloatLabel>
            <InputText
              v-model="username"
              id="username"
              required
              class="w-full"
            />
            <label for="username">Username</label>
          </FloatLabel>

          <FloatLabel>
            <Password
              v-model="password"
              id="password"
              :feedback="false"
              required
              toggleMask
              class="w-full"
              inputClass="w-full"
            />
            <label for="password">Password</label>
          </FloatLabel>

          <Button
            label="Login"
            class="p-button-success w-full"
            type="submit"
            :loading="loading"
          />
        </form>
        <p>Don't have an account? <router-link to="/register">Register here</router-link></p>
      </template>
    </Card>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import api from '../services/api.js'
import InputText from 'primevue/inputtext'
import Password from 'primevue/password'
import Button from 'primevue/button'
import Card from 'primevue/card'
import Toast from 'primevue/toast'
import FloatLabel from 'primevue/floatlabel'

const username = ref('')
const password = ref('')
const loading = ref(false)
const router = useRouter()
const toast = ref(null)

async function handleLogin() {
  loading.value = true

  try {
    const payload = {
      username: username.value.toLowerCase(),
      password: password.value
    }

    const response = await api.login(payload)

    if (response.token) {
      localStorage.setItem('token', response.token)
      localStorage.setItem('timestamp', Date.now().toString())

      toast.value.add({
        severity: 'success',
        summary: 'Bem-vindo!',
        detail: 'Login realizado com sucesso.',
        life: 2000
      })

      setTimeout(() => router.push('/'), 500)
    }
  } catch (error) {
    console.error('Login error:', error)

    const message = error.message || 'Erro ao conectar com o servidor.'

    toast.value.add({
      severity: 'error',
      summary: 'Falha no Login',
      detail: message,
      life: 4000
    })
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
h2 {
  margin-bottom: 0;
}

.p-card {
  width: 350px;
  padding: 0rem 2rem;
  text-align: center;
}

form {
  display: flex;
  flex-direction: column;
  gap: 1.6rem;
  align-items: center;
  margin-top: 1rem;
}

a {
  color: var(--main-color, #4caf50);
  text-decoration: none;
}

.login-container {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100vh;
  background-color: var(--background-color, #121212);
}

.w-full {
  width: 100%;
}

:deep(.p-password) {
  width: 100%;
}

.p-button {
  background-color: var(--main-color, #4caf50);
  color: var(--text-color, #fff);
  border: 1px solid var(--main-color, #4caf50);
}
</style>
