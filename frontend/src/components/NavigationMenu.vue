<template>
  <div class="navigation-container">

    <MobileHeader ref="appBar" />
    <AccentPopover v-if="phone" />

    <!-- Celular: faixa da borda direita que abre o menu arrastando -->
    <div
      v-if="phone && !mobileMenuOpen"
      class="drawer-edge"
      aria-hidden="true"
      @pointerdown="edgeDrag.onPointerDown"
    ></div>

    <Transition name="fade">
      <div
        v-if="mobileMenuOpen || dragging"
        ref="overlayEl"
        class="mobile-overlay"
        @click="mobileMenuOpen = false"
        @pointerdown="phone && mobileMenuOpen && closeDrag.onPointerDown($event)"
      ></div>
    </Transition>

    <aside
      id="app-sidebar"
      ref="sidebarEl"
      class="sidebar"
      :class="{ 'sidebar-mobile-open': mobileMenuOpen, 'is-dragging': dragging }"
      @pointerdown="phone && mobileMenuOpen && closeDrag.onPointerDown($event)"
    >

      <div class="sidebar-header">
        <div class="logo-wrapper">
          <img
            src="/bookshelf.png"
            alt=""
            width="40"
            height="40"
          />
          <BrandWordmark class="logo-text" />
        </div>
        <button
          ref="closeButton"
          type="button"
          class="close-sidebar-btn"
          :aria-label="t('menu.closeMenu')"
          @click="mobileMenuOpen = false"
        >
          <i
            class="pi pi-times"
            aria-hidden="true"
          ></i>
        </button>
      </div>

      <NavLinks @navigate="goTo" />
      <SidebarFooter />
    </aside>

  </div>
</template>

<script setup>
import { ref, watch, nextTick, onBeforeUnmount } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import BrandWordmark from './BrandWordmark.vue'
import MobileHeader from './nav/MobileHeader.vue'
import AccentPopover from './nav/AccentPopover.vue'
import NavLinks from './nav/NavLinks.vue'
import SidebarFooter from './nav/SidebarFooter.vue'
import { useIsPhone } from '../composables/useIsPhone.js'
import { useDrag } from '../composables/useDrag.js'
import { pushOverlay } from '../services/backStack.js'
import { shouldComplete } from '../utils/motion.js'
import { drawerOpen } from '../services/appNav.js'

/**
 * Menu do app: lateral fixa no computador; no tablet e no celular, a barra do
 * topo (MobileHeader) e a gaveta. Este arquivo cuida da gaveta: abrir e
 * fechar, foco, voltar do aparelho e o arrasto. As seções ficam em
 * components/nav/.
 */
const route = useRoute()
const { t } = useI18n()

// Mesma gaveta que a aba "Menu" da barra de abas (celular) abre
const mobileMenuOpen = drawerOpen
const appBar = ref(null)
const closeButton = ref(null)
const phone = useIsPhone()

// Menu do celular: trava a rolagem da página, leva o foco para dentro ao abrir
// e devolve ao botão do menu ao fechar (teclado e leitor de tela). Aberto, o
// resto da tela fica inert (o Tab não sai do menu) e o Esc fecha de qualquer
// lugar, não só com o foco dentro dele.
function outsideMenu() {
  return [document.getElementById('main-content'), appBar.value?.$el, document.querySelector('.skip-link'), document.querySelector('.tab-bar')].filter(Boolean)
}

function setInert(on) {
  for (const el of outsideMenu()) {
    if (on) el.setAttribute('inert', '')
    else el.removeAttribute('inert')
  }
}

function onDocumentKeydown(event) {
  if (event.key !== 'Escape' || event.defaultPrevented) return
  // Uma janela aberta por cima do menu (confirmação) tem a vez
  if (document.querySelector('dialog[open]')) return
  mobileMenuOpen.value = false
}

watch(mobileMenuOpen, async (open) => {
  document.body.style.overflow = open ? 'hidden' : ''
  document.documentElement.classList.toggle('menu-open', open)
  setInert(open)
  if (open) watchBack()
  else forgetBack()
  if (open) document.addEventListener('keydown', onDocumentKeydown)
  else document.removeEventListener('keydown', onDocumentKeydown)
  await nextTick()
  if (open) closeButton.value?.focus()
  else if (!document.activeElement || document.activeElement === document.body || document.activeElement.closest?.('#app-sidebar')) {
    // Foco volta para quem abriu: ☰ (tablet) ou a aba "Menu" (celular)
    if (!appBar.value?.focusMenuButton()) document.querySelector('.tab-bar .tab-menu')?.focus()
  }
})

onBeforeUnmount(() => {
  document.body.style.overflow = ''
  document.documentElement.classList.remove('menu-open')
  forgetBack()
  setInert(false)
  document.removeEventListener('keydown', onDocumentKeydown)
})

// Trocou de tela: a gaveta fecha
watch(() => route.path, () => { mobileMenuOpen.value = false })

// ---------------------------------------------------------------------------
// Celular: voltar do aparelho fecha o menu antes de sair da tela
// ---------------------------------------------------------------------------
let releaseBack = null

function watchBack() {
  if (!phone.value || releaseBack) return
  releaseBack = pushOverlay(() => {
    releaseBack = null
    mobileMenuOpen.value = false
  })
}

function forgetBack() {
  const release = releaseBack
  releaseBack = null
  return release ? release() : Promise.resolve()
}

// Item do menu: fecha (consumindo a posição extra do histórico) e só então
// navega; assim o voltar da tela nova vem direto para a de antes.
async function goTo(navigate) {
  const wasOpen = mobileMenuOpen.value
  mobileMenuOpen.value = false
  if (wasOpen) await forgetBack()
  navigate()
}

// ---------------------------------------------------------------------------
// Celular: gaveta arrastável (da borda para abrir, no menu/fundo para fechar)
// ---------------------------------------------------------------------------
const sidebarEl = ref(null)
const overlayEl = ref(null)
const dragging = ref(false)
const DRAWER_WIDTH = 280

// Celular: a gaveta vem da direita, do lado da aba "Menu"
function setProgress(progress) {
  const p = Math.min(1, Math.max(0, progress))
  if (sidebarEl.value) sidebarEl.value.style.transform = `translate3d(${(1 - p) * DRAWER_WIDTH}px, 0, 0)`
  if (overlayEl.value) overlayEl.value.style.opacity = String(p)
  const main = document.getElementById('main-content')
  if (main) main.style.transform = p ? `translate3d(${p * -12}px, 0, 0)` : ''
}

function clearProgress() {
  for (const el of [sidebarEl.value, overlayEl.value, document.getElementById('main-content')]) {
    if (!el) continue
    el.style.transform = ''
    el.style.opacity = ''
  }
}

// Solta: classe nova e estilo do dedo saem no mesmo quadro; a transição do
// CSS (mola para abrir, saída para fechar) parte de onde o dedo deixou.
function settle(open) {
  dragging.value = false
  clearProgress()
  mobileMenuOpen.value = open
}

// Borda direita: arrastar para a esquerda abre (distância negativa)
const edgeDrag = useDrag({
  axis: 'x',
  onStart: () => { dragging.value = true; nextTick(() => setProgress(0)) },
  onMove: distance => setProgress(-distance / DRAWER_WIDTH),
  onEnd: ({ distance, velocity }) => settle(shouldComplete({ distance: -distance, velocity: -velocity, size: DRAWER_WIDTH }))
})

const closeDrag = useDrag({
  axis: 'x',
  // As preferências (SidebarFooter) têm controles próprios
  canStart: event => !event.target.closest?.('.settings-menu, input, select'),
  onStart: () => { dragging.value = true },
  // Arrastar para a direita fecha
  onMove: distance => setProgress(1 - Math.max(0, distance) / DRAWER_WIDTH),
  onEnd: ({ distance, velocity }) => settle(!shouldComplete({ distance, velocity, size: DRAWER_WIDTH }))
})
</script>

<style scoped>
.navigation-container {
  width: 260px;
  height: 100vh;
  height: 100dvh;
  flex-shrink: 0;
  background-color: var(--bg-panel);
  border-right: 1px solid var(--border-color);
  position: sticky;
  top: 0;
  z-index: 100;
}

.mobile-overlay {
  display: none;
}

.sidebar {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
}

.sidebar-header {
  padding: var(--space-7) var(--space-6);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.logo-wrapper {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.logo-text {
  font-size: var(--fs-xl);
}

.close-sidebar-btn {
  display: none;
}

@media (max-width: 1023.98px) {
  .navigation-container {
    width: 100%;
    height: auto;
    position: sticky;
    top: 0;
    border-right: none;
    border-bottom: 1px solid var(--border-color);
    z-index: 200;
  }

  .sidebar {
    position: fixed;
    top: 0;
    left: 0;
    width: 280px;
    height: 100dvh;
    z-index: 1000;
    background-color: var(--bg-panel);
    box-shadow: none;
    transform: translateX(-100%);
    /* Fechado também fica invisível para teclado e leitor de tela; o
       visibility espera a animação terminar antes de esconder. */
    visibility: hidden;
    transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), visibility 0s linear 0.3s;
  }

  .sidebar.sidebar-mobile-open {
    transform: translateX(0);
    visibility: visible;
    transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), visibility 0s;
    box-shadow: 10px 0 30px rgba(0, 0, 0, 0.5);
  }

  .close-sidebar-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--bg-hover);
    border: none;
    color: var(--text-primary);
    width: 32px;
    height: 32px;
    border-radius: 50%;
    cursor: pointer;
  }

  .mobile-overlay {
    display: block;
    position: fixed;
    inset: 0;
    background-color: var(--bg-overlay);
    backdrop-filter: blur(4px);
    z-index: 900;
  }
}

.drawer-edge {
  display: none;
}

/* ---------------------------------------------------------------- celular
 * Gaveta arrastável que vem da direita. Só abaixo de 640 px; no tablet ela
 * vem da esquerda, pelo ☰.
 */
@media (max-width: 639.98px) {
  /* Faixa invisível na borda direita (lado da aba "Menu"): arrastar dali
     abre o menu. A esquerda fica livre para o voltar do iPhone. pan-y
     deixa a página rolar na vertical; o lado fica com o gesto. */
  .drawer-edge {
    display: block;
    position: fixed;
    top: var(--app-bar-height);
    bottom: var(--tab-bar-height, 0px);
    right: 0;
    width: 16px;
    z-index: 150;
    touch-action: pan-y;
  }

  /* Gaveta vem da direita, do lado da aba "Menu". 32 px a mais escondidos
     à direita para a sobra da mola não mostrar um vão na borda */
  .sidebar {
    left: auto;
    right: -32px;
    width: calc(280px + 32px);
    padding: var(--safe-top) 32px var(--safe-bottom) 0;
    transform: translateX(100%);
    touch-action: pan-y;
    transition: transform var(--dur-medium) var(--ease-exit), visibility 0s linear var(--dur-medium);
  }

  .sidebar.sidebar-mobile-open {
    transform: translateX(0);
    box-shadow: -10px 0 30px rgba(0, 0, 0, 0.5);
    transition: transform var(--dur-spring) var(--ease-spring), visibility 0s;
  }

  .sidebar.is-dragging {
    visibility: visible;
    transition: none;
  }

  .mobile-overlay {
    backdrop-filter: none;
    touch-action: none;
  }

  /* Conteúdo é empurrado 12 px para a esquerda com o menu aberto (o arrasto
     faz o mesmo à mão). Sem encolher: o scale(0.97) antigo tinha o centro no
     meio da página inteira e o que estava à vista descia até 58 px. */
  :global(#main-content) {
    transition: transform var(--dur-medium) var(--ease-exit);
  }

  :global(html.menu-open #main-content) {
    transform: translate3d(-12px, 0, 0);
    transition: transform var(--dur-spring) var(--ease-spring);
  }
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
