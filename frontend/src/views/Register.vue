<template>
  <div class="register-container">
    <Toast
      ref="toast"
      position="top-center"
    />
    <Card>
      <template #header>
        <h2>Register</h2>
      </template>
      <template #content>
        <form @submit.prevent="handleRegister">

          <FloatLabel>
            <InputText
              v-model="email"
              id="email"
              type="email"
              required
              class="w-full"
            />
            <label for="email">Email</label>
          </FloatLabel>

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

          <FloatLabel>
            <Password
              v-model="confirmPassword"
              id="confirmPassword"
              :feedback="false"
              required
              toggleMask
              class="w-full"
              inputClass="w-full"
            />
            <label for="confirmPassword">Confirm Password</label>
          </FloatLabel>

          <Button
            label="Register"
            class="p-button-success w-full"
            type="submit"
            :loading="loading"
          />
        </form>
        <p>Already have an account? <router-link to="/login">Login here</router-link></p>
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
const email = ref('')
const password = ref('')
const confirmPassword = ref('')
const loading = ref(false)
const router = useRouter()
const toast = ref(null)

async function handleRegister() {
  if (password.value !== confirmPassword.value) {
    toast.value.add({ severity: 'error', summary: 'Error', detail: 'Passwords do not match', life: 3000 })
    return
  }

  if (password.value.length < 8) {
    toast.value.add({ severity: 'warn', summary: 'Weak Password', detail: 'Password must be at least 8 characters long', life: 3000 })
    return
  }

  loading.value = true

  try {
    const payload = {
      username: username.value.toLowerCase(),
      email: email.value,
      password: password.value
    }

    await api.register(payload)

    toast.value.add({
      severity: 'success',
      summary: 'Bem-vindo!',
      detail: 'Registro realizado com sucesso. Faça login.',
      life: 2000
    })

    setTimeout(() => router.push('/login'), 1500)

  } catch (error) {
    console.error('Error registering:', error)

    const message = error.message || 'Erro ao registrar usuário.'

    toast.value.add({
      severity: 'error',
      summary: 'Erro no Registro',
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

.register-container {
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
