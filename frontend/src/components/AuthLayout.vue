<template>
  <div class="auth-container">
    <div
      class="visual-side"
      aria-hidden="true"
    >
      <div class="visual-overlay"></div>

      <div class="visual-content">
        <p class="visual-title">{{ title }}</p>
        <p
          v-if="subtitle"
          class="visual-subtitle"
        >{{ subtitle }}</p>
      </div>

      <!-- Decorativo: capas de bibliotecas públicas, escondido de leitores de tela. -->
      <div class="mosaic-grid">
        <div
          v-for="(cover, index) in covers"
          :key="cover"
          class="mosaic-item"
          :class="spanClass(index)"
        >
          <img
            :src="coverFileUrl(cover)"
            alt=""
            loading="lazy"
            decoding="async"
            @error="event => event.target.closest('.mosaic-item')?.remove()"
          />
        </div>
      </div>
    </div>

    <div class="form-side">
      <div class="form-wrapper">
        <slot />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import api from '../services/api.js'
import { coverFileUrl } from '../utils/covers.js'

defineProps({
  title: { type: String, required: true },
  subtitle: { type: String, default: '' }
})

const covers = ref([])

function spanClass(index) {
  if (index % 7 === 0) return 'span-2x2'
  if (index % 5 === 0) return 'span-2x1'
  if (index % 3 === 0) return 'span-1x2'
  return ''
}

onMounted(async () => {
  try {
    covers.value = await api.getRandomCovers()
  } catch {
    // Sem capas o lado visual fica só com o gradiente; não é um erro para o usuário.
  }
})
</script>

<style scoped>
.auth-container {
  display: flex;
  min-height: 100vh;
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
  from { transform: scale(1); }
  to { transform: scale(1.1); }
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
  text-align: center;
  padding: 3rem;
  max-width: 600px;
}

.visual-title {
  font-size: 5.5rem;
  font-weight: 700;
  margin: 0;
  font-family: 'Georgia', 'Times New Roman', serif;
  color: #fff;
  letter-spacing: -3px;
  line-height: 1.1;
  text-shadow: 0 10px 30px rgba(0, 0, 0, 0.8);
  animation: fadeUp 1s ease-out;
}

.visual-subtitle {
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
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
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

/* Estilos do formulário que vem pelo slot (Login / Register). */
.form-wrapper :deep(.header) {
  margin-bottom: 2.5rem;
}

.form-wrapper :deep(.header h1) {
  font-size: 2rem;
  color: var(--text-primary);
  margin: 0 0 0.5rem 0;
}

.form-wrapper :deep(.subtitle) {
  color: var(--text-secondary);
  margin: 0;
}

.form-wrapper :deep(.auth-form) {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.form-wrapper :deep(.w-full) {
  width: 100%;
}

.form-wrapper :deep(.p-inputtext) {
  background-color: var(--bg-panel);
  border: 1px solid var(--border-color);
  color: var(--text-primary);
  padding: 1rem;
  width: 100%;
}

.form-wrapper :deep(.p-inputtext:focus),
.form-wrapper :deep(.p-inputwrapper-focus .p-inputtext) {
  border-color: var(--main-color);
  box-shadow: 0 0 0 1px var(--main-color);
}

.form-wrapper :deep(.p-float-label label) {
  color: var(--text-secondary);
  top: 50%;
  margin-top: -0.5rem;
  left: 1rem;
  transition: all 0.2s ease;
  pointer-events: none;
}

.form-wrapper :deep(.p-inputtext:focus ~ label),
.form-wrapper :deep(.p-inputtext.p-filled ~ label),
.form-wrapper :deep(.p-inputwrapper-focus ~ label),
.form-wrapper :deep(.p-inputwrapper-filled ~ label) {
  top: -0.75rem;
  font-size: 0.75rem;
  background-color: var(--bg-panel);
  padding: 0 0.5rem;
  color: var(--main-color);
  left: 0.5rem;
  z-index: 2;
}

.form-wrapper :deep(.p-password) {
  width: 100%;
}

.form-wrapper :deep(.field-hint) {
  display: block;
  margin-top: 0.4rem;
  font-size: 0.8rem;
  color: var(--text-muted);
}

.form-wrapper :deep(.footer) {
  margin-top: 2rem;
  text-align: center;
  color: var(--text-secondary);
  font-size: 0.9rem;
}

.form-wrapper :deep(.footer p) {
  margin: 0.5rem 0;
}

.form-wrapper :deep(.footer a) {
  color: var(--main-color);
  text-decoration: none;
  font-weight: 600;
}

.form-wrapper :deep(.footer a:hover) {
  text-decoration: underline;
}

.form-wrapper :deep(.footer .muted-link) {
  color: var(--text-muted);
  font-weight: 400;
  font-size: 0.8rem;
}

@media (max-width: 900px) {
  .auth-container {
    flex-direction: column;
  }

  .visual-side {
    flex: 0 0 200px;
  }

  .mosaic-grid {
    opacity: 0.2;
    filter: blur(5px) grayscale(50%);
  }

  .visual-title {
    font-size: 3rem;
    letter-spacing: -1px;
  }

  .visual-subtitle {
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
