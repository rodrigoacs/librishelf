<template>
  <div class="home-container">

    <section class="hero-section">
      <div class="logo-animation">
        <img
          width="120"
          height="120"
          src="https://img.icons8.com/external-smashingstocks-isometric-smashing-stocks/440/external-Bookshelf-interior-smashingstocks-isometric-smashing-stocks-3.png"
          alt="Librishelf logo"
          class="hero-logo"
        />
      </div>

      <h1 class="hero-title">
        Bem-vindo ao <span class="highlight">Librishelf</span>
      </h1>

      <p class="hero-subtitle">
        Sua biblioteca digital. Organize, rastreie e redescubra sua coleção de livros com elegância e
        segurança.
      </p>

      <div class="hero-actions">
        <Button
          label="Acessar Minha Biblioteca"
          icon="pi pi-arrow-right"
          iconPos="right"
          class="p-button-rounded hero-btn"
          @click="goToLibrary"
        />
      </div>
    </section>

    <section class="features-section">
      <h2>O que você pode fazer</h2>

      <div class="features-grid">
        <div class="feature-card">
          <div class="icon-box">
            <i class="pi pi-plus"></i>
          </div>
          <h3>Gerenciamento Completo</h3>
          <p>Adicione livros com detalhes: autor, editora, data e capa personalizada.</p>
        </div>

        <div class="feature-card">
          <div class="icon-box">
            <i class="pi pi-check-circle"></i>
          </div>
          <h3>Rastreio de Leitura</h3>
          <p>Marque livros como lidos, registre datas e acompanhe seu progresso literário.</p>
        </div>

        <div class="feature-card">
          <div class="icon-box">
            <i class="pi pi-filter"></i>
          </div>
          <h3>Busca Inteligente</h3>
          <p>Encontre qualquer obra instantaneamente filtrando por título, autor, editora ou tags.</p>
        </div>

        <div class="feature-card">
          <div class="icon-box">
            <i class="pi pi-th-large"></i>
          </div>
          <h3>Visual Premium</h3>
          <p>Sua coleção apresentada em um layout responsivo, limpo e de visual agradável.</p>
        </div>
      </div>
    </section>

  </div>
</template>

<script setup>
import { useRouter } from 'vue-router'
import Button from 'primevue/button'

const router = useRouter()

function goToLibrary() {
  router.push('/books')
}
</script>

<style scoped>
.home-container {
  min-height: 100vh;
  background-color: #121212;
  color: #ffffff;
  padding: 4rem 2rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  max-width: 1200px;
  margin: 0 auto;
}

.hero-section {
  text-align: center;
  max-width: 800px;
  margin-bottom: 5rem;
  animation: fadeUp 0.8s ease-out;
}

.hero-logo {
  filter: drop-shadow(0 0 20px rgba(var(--main-color-rgb), 0.3));
  margin-bottom: 1.5rem;
  transition: transform 0.3s ease;
}

.hero-logo:hover {
  transform: scale(1.05) rotate(-5deg);
}

.hero-title {
  font-family: 'Georgia', serif;
  font-size: 3.5rem;
  font-weight: 700;
  margin: 0 0 1rem 0;
  line-height: 1.1;
  letter-spacing: -1px;
}

.highlight {
  color: var(--main-color, #4caf50);
  position: relative;
  display: inline-block;
}

.highlight::after {
  content: '';
  position: absolute;
  width: 100%;
  height: 4px;
  bottom: 5px;
  left: 0;
  background-color: var(--main-color, #4caf50);
  opacity: 0.3;
  transition: height 0.2s;
}

.hero-title:hover .highlight::after {
  height: 12px;
}

.hero-subtitle {
  font-size: 1.25rem;
  color: #a1a1aa;
  line-height: 1.6;
  margin-bottom: 2.5rem;
}

.hero-btn {
  background-color: var(--main-color, #4caf50) !important;
  border-color: var(--main-color, #4caf50) !important;
  color: #000 !important;
  font-weight: 700 !important;
  font-size: 1.1rem !important;
  padding: 0.8rem 2rem !important;
  transition: transform 0.2s !important;
}

.hero-btn:hover {
  transform: translateY(-2px);
  filter: brightness(1.1);
}

.features-section {
  width: 100%;
  animation: fadeUp 0.8s ease-out 0.2s backwards;
}

.features-section h2 {
  text-align: center;
  font-size: 1.8rem;
  margin-bottom: 3rem;
  color: #e4e4e7;
  font-weight: 600;
  letter-spacing: -0.5px;
}

.features-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 2rem;
}

.feature-card {
  background-color: #18181b;
  border: 1px solid #27272a;
  border-radius: 16px;
  padding: 2rem;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  transition: all 0.3s ease;
  position: relative;
  overflow: hidden;
}

.feature-card:hover {
  transform: translateY(-5px);
  border-color: var(--main-color, #4caf50);
  box-shadow: 0 10px 30px -10px rgba(0, 0, 0, 0.5);
}

.icon-box {
  width: 50px;
  height: 50px;
  border-radius: 12px;
  background-color: #27272a;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 1.5rem;
  transition: background 0.3s;
}

.feature-card:hover .icon-box {
  background-color: var(--main-color, #4caf50);
}

.icon-box i {
  font-size: 1.5rem;
  color: #fff;
  transition: color 0.3s;
}

.feature-card:hover .icon-box i {
  color: #000;
}

.feature-card h3 {
  font-size: 1.25rem;
  margin: 0 0 0.8rem 0;
  color: #fff;
  font-weight: 700;
}

.feature-card p {
  font-size: 1rem;
  color: #a1a1aa;
  margin: 0;
  line-height: 1.6;
}

@keyframes fadeUp {
  from {
    opacity: 0;
    transform: translateY(30px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (max-width: 768px) {
  .home-container {
    padding: 2rem 1rem;
  }

  .hero-title {
    font-size: 2.5rem;
  }

  .hero-subtitle {
    font-size: 1.1rem;
  }

  .features-grid {
    grid-template-columns: 1fr;
  }
}
</style>
