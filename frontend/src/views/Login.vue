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
            />
            <label for="username">Username</label>
          </FloatLabel>
          <FloatLabel>
            <Password
              v-model="password"
              id="password"
              :feedback="false"
              required
            />
            <label for="password">Password</label>
          </FloatLabel>
          <Button
            label="Login"
            class="p-button-success"
            type="submit"
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
import { loginUser } from '../services/api.js'
import InputText from 'primevue/inputtext'
import Password from 'primevue/password'
import Button from 'primevue/button'
import Card from 'primevue/card'
import Toast from 'primevue/toast'
import FloatLabel from 'primevue/floatlabel'

const username = ref('')
const password = ref('')
const router = useRouter()
const toast = ref(null)

async function handleLogin() {
  try {
    const response = await loginUser({ username: username.value.toLowerCase(), password: password.value })
    if (response.token) {
      localStorage.setItem('token', response.token)
      localStorage.setItem('timestamp', Date.now())
      toast.value.add({ severity: 'success', summary: 'Login Successful', detail: 'You are now logged in.', life: 3000 })
      setTimeout(() => router.push('/'), 500)
    } else {
      toast.value.add({ severity: 'error', summary: 'Login Failed', detail: 'Invalid credentials.', life: 3000 })
    }
  } catch (error) {
    toast.value.add({ severity: 'error', summary: 'Error', detail: 'Error logging in.', life: 3000 })
    console.error('Error logging in:', error)
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
}

a {
  color: var(--main-color);
  text-decoration: none;
}

.login-container {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100vh;
}

input,
.p-button {
  width: 100%;
}

.p-button {
  background-color: var(--main-color);
  color: var(--text-color);
  border: 1px solid var(--main-color);
}
</style>
