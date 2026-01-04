<template>
  <div class="auth-container">
    <div class="visual-side">
      <div class="visual-overlay"></div>

      <div class="visual-content">
        <h1>Librishelf</h1>
        <p>Sua biblioteca pessoal, em todo lugar.</p>
      </div>

      <div class="mosaic-grid">
        <div
          v-for="(cover, index) in covers"
          :key="cover"
          class="mosaic-item"
          :class="getRandomSpanClass(index)"
        >
          <img
            :src="getCoverUrl(cover)"
            alt="Book cover mosaic"
            loading="lazy"
          />
        </div>
      </div>
    </div>

    <div class="form-side">
      <div class="form-wrapper">
        <div class="header">
          <h2>Bem-vindo de volta</h2>
          <p class="subtitle">Insira suas credenciais para acessar.</p>
        </div>

        <form
          @submit.prevent="handleLogin"
          class="auth-form"
        >
          <div class="field">
            <span class="p-float-label">
              <InputText
                id="email"
                v-model="email"
                class="w-full"
              />
              <label for="email">E-mail ou Usuário</label>
            </span>
          </div>

          <div class="field">
            <span class="p-float-label">
              <Password
                id="password"
                v-model="password"
                class="w-full"
                :feedback="false"
                toggleMask
              />
              <label for="password">Senha</label>
            </span>
          </div>

          <Button
            type="submit"
            label="Entrar"
            class="btn-action-primary w-full p-button-lg"
            :loading="loading"
          />
        </form>

        <div class="footer">
          <p>Não tem uma conta? <router-link to="/register">Crie agora</router-link></p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import InputText from 'primevue/inputtext'
import Password from 'primevue/password'
import Button from 'primevue/button'
import api from '../services/api.js'

const router = useRouter()
const toast = useToast()
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3050'

const email = ref('')
const password = ref('')
const loading = ref(false)
const covers = ref([])

onMounted(async () => {
  try {
    covers.value = await api.getRandomCovers()
  } catch (error) {
    console.error('Erro ao carregar mosaico:', error)
  }
})

function getCoverUrl(filename) {
  return `${API_URL}/uploads/${filename}`
}

function getRandomSpanClass(index) {
  if (index % 7 === 0) return 'span-2x2'
  if (index % 5 === 0) return 'span-2x1'
  if (index % 3 === 0) return 'span-1x2'
  return ''
}

async function handleLogin() {
  if (!email.value || !password.value) {
    toast.add({ severity: 'warn', summary: 'Atenção', detail: 'Preencha todos os campos.', life: 3000 })
    return
  }

  loading.value = true

  try {
    const response = await api.login({
      username: email.value,
      password: password.value
    })

    localStorage.setItem('token', response.token)
    localStorage.setItem('user', JSON.stringify(response.user))

    toast.add({ severity: 'success', summary: 'Bem-vindo!', detail: 'Login realizado com sucesso.', life: 3000 })
    router.push('/')

  } catch (error) {
    console.error(error)
    toast.add({ severity: 'error', summary: 'Erro', detail: error.message || 'Falha no login.', life: 4000 })
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.auth-container {
  display: flex;
  height: 100vh;
  width: 100vw;
  background-color: var(--bg-app);
  overflow: hidden;
}

.visual-side {
  flex: 1.5;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--bg-panel);
  overflow: hidden;
}

.mosaic-grid {
  position: absolute;
  top: -10%;
  left: -10%;
  width: 120%;
  height: 120%;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  grid-auto-rows: 180px;
  grid-auto-flow: dense;
  gap: 0.5rem;
  opacity: 0.35;
  filter: blur(3px) grayscale(30%);
  transform: rotate(-2deg);
  pointer-events: none;
}

.mosaic-item {
  position: relative;
  overflow: hidden;
  border-radius: 4px;
  background-color: var(--bg-panel);
}

.mosaic-item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  animation: subtleZoom 20s infinite alternate ease-in-out;
}

.span-2x2 {
  grid-column: span 2;
  grid-row: span 2;
}

.span-2x1 {
  grid-column: span 2;
}

.span-1x2 {
  grid-row: span 2;
}

@keyframes subtleZoom {
  from {
    transform: scale(1);
  }

  to {
    transform: scale(1.1);
  }
}

.visual-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, rgba(0, 0, 0, 0.95) 10%, rgba(var(--main-color-rgb), 0.3) 100%);
  z-index: 1;
}

.visual-content {
  position: relative;
  z-index: 2;
  color: var(--text-primary);
  text-align: center;
  padding: 3rem;
  max-width: 600px;
}

.visual-content h1 {
  font-size: 5.5rem;
  font-weight: 700;
  margin: 0;
  font-family: 'Georgia', 'Times New Roman', serif;
  color: #fff;
  letter-spacing: -3px;
  text-shadow: 0 10px 30px rgba(0, 0, 0, 0.8);
  animation: fadeUp 1s ease-out;
}

.visual-content p {
  font-size: 1.2rem;
  color: #fff;
  margin-top: 0.5rem;
  font-weight: 300;
  letter-spacing: 2px;
  text-transform: uppercase;
  text-shadow: 0 2px 10px rgba(0, 0, 0, 0.8);
  opacity: 0.9;
  animation: fadeUp 1s ease-out 0.2s backwards;
}

@keyframes fadeUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.form-side {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--bg-panel);
  padding: 2rem;
  min-width: 450px;
  box-shadow: -10px 0 30px rgba(0, 0, 0, 0.5);
  z-index: 5;
}

.form-wrapper {
  width: 100%;
  max-width: 400px;
}

.header {
  margin-bottom: 3rem;
}

.header h2 {
  font-size: 2rem;
  color: var(--text-primary);
  margin: 0 0 0.5rem 0;
}

.subtitle {
  color: var(--text-secondary);
  margin: 0;
}

.auth-form {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.w-full {
  width: 100%;
}

:deep(.p-inputtext) {
  background-color: var(--bg-panel);
  border: 1px solid var(--border-color);
  color: var(--text-primary);
  padding: 1rem;
  width: 100%;
}

:deep(.p-inputtext:focus),
:deep(.p-inputwrapper-focus .p-inputtext) {
  border-color: var(--main-color);
  box-shadow: 0 0 0 1px var(--main-color);
}

:deep(.p-float-label label) {
  color: var(--text-secondary);
  top: 50%;
  margin-top: -0.5rem;
  left: 1rem;
  transition: all 0.2s ease;
  pointer-events: none;
}

:deep(.p-inputtext:focus ~ label),
:deep(.p-inputtext.p-filled ~ label),
:deep(.p-inputwrapper-focus ~ label),
:deep(.p-inputwrapper-filled ~ label) {
  top: -0.75rem;
  font-size: 0.75rem;
  background-color: var(--bg-panel);
  padding: 0 0.5rem;
  color: var(--main-color);
  left: 0.5rem;
  z-index: 2;
}

:deep(.p-password) {
  width: 100%;
}

.footer {
  margin-top: 2rem;
  text-align: center;
  color: var(--text-secondary);
  font-size: 0.9rem;
}

.footer a {
  color: var(--main-color);
  text-decoration: none;
  font-weight: 600;
}

.footer a:hover {
  text-decoration: underline;
}

@media (max-width: 900px) {
  .auth-container {
    flex-direction: column;
  }

  .visual-side {
    flex: 0.3;
    min-height: 200px;
  }

  .mosaic-grid {
    opacity: 0.2;
    filter: blur(5px) grayscale(50%);
  }

  .visual-content h1 {
    font-size: 3rem;
    letter-spacing: -1px;
  }

  .visual-content p {
    display: none;
  }

  .form-side {
    flex: 1;
    min-width: 100%;
    padding-top: 2rem;
    align-items: flex-start;
  }
}
</style>
