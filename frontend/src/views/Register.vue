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
          <FloatLabel>
            <Password
              v-model="confirmPassword"
              id="confirmPassword"
              :feedback="false"
              required
            />
            <label for="confirmPassword">Confirm Password</label>
          </FloatLabel>
          <Button
            label="Register"
            class="p-button-success"
            type="submit"
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
import { registerUser } from '../services/api.js'
import InputText from 'primevue/inputtext'
import Password from 'primevue/password'
import Button from 'primevue/button'
import Card from 'primevue/card'
import Toast from 'primevue/toast'
import FloatLabel from 'primevue/floatlabel'

const username = ref('')
const password = ref('')
const confirmPassword = ref('')
const router = useRouter()
const toast = ref(null)

async function handleRegister() {
  if (password.value !== confirmPassword.value) {
    toast.value.add({ severity: 'error', summary: 'Error', detail: 'Passwords do not match', life: 3000 })
    return
  }

  if (password.value.length < 8) {
    toast.value.add({ severity: 'error', summary: 'Error', detail: 'Password must be at least 8 characters long', life: 3000 })
    return
  }

  try {
    const response = await registerUser({ username: username.value.toLowerCase(), password: password.value })

    if (response.ok) {
      toast.value.add({ severity: 'success', summary: 'Success', detail: 'Registered successfully', life: 3000 })
      setTimeout(() => router.push('/login'), 1500)
    } else {
      const errorData = await response.json()
      toast.value.add({ severity: 'error', summary: 'Error', detail: errorData.error, life: 3000 })
    }
  } catch (error) {
    toast.value.add({ severity: 'error', summary: 'Error', detail: 'An error occurred during registration', life: 3000 })
    console.error('Error registering:', error)
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

.register-container {
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
