import { createRouter, createWebHistory } from 'vue-router'
import { loadSession, isAuthenticated } from '../services/session.js'

/**
 * meta:
 *   requiresAuth — precisa de sessão; sem ela vai para /login?redirect=...
 *   guestOnly    — login/cadastro; quem já está logado vai para o início
 *   standalone   — tela cheia, sem o menu lateral
 *   public       — acessível com ou sem sessão (mostra o menu se houver sessão)
 *
 * Views carregadas sob demanda: o chart.js do Dashboard e o PrimeVue pesado
 * das telas internas não entram no bundle do login.
 */
const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'home', component: () => import('../views/Home.vue'), meta: { requiresAuth: true } },
    { path: '/books', name: 'library', component: () => import('../views/Library.vue'), meta: { requiresAuth: true } },
    { path: '/authors', name: 'authors', component: () => import('../views/Author.vue'), meta: { requiresAuth: true } },
    { path: '/publishers', name: 'publishers', component: () => import('../views/Publisher.vue'), meta: { requiresAuth: true } },
    { path: '/tags', name: 'tags', component: () => import('../views/Tags.vue'), meta: { requiresAuth: true } },
    { path: '/dashboard', name: 'dashboard', component: () => import('../views/Dashboard.vue'), meta: { requiresAuth: true } },
    { path: '/community', name: 'community', component: () => import('../views/Community.vue'), meta: { requiresAuth: true } },
    { path: '/settings', name: 'settings', component: () => import('../views/Settings.vue'), meta: { requiresAuth: true } },

    { path: '/login', name: 'login', component: () => import('../views/Login.vue'), meta: { guestOnly: true, standalone: true } },
    { path: '/register', name: 'register', component: () => import('../views/Register.vue'), meta: { guestOnly: true, standalone: true } },

    { path: '/forgot-password', name: 'forgot-password', component: () => import('../views/ForgotPassword.vue'), meta: { standalone: true } },
    { path: '/reset-password', name: 'reset-password', component: () => import('../views/ResetPassword.vue'), meta: { standalone: true } },
    { path: '/verify-email', name: 'verify-email', component: () => import('../views/VerifyEmail.vue'), meta: { standalone: true } },

    { path: '/u/:username', name: 'public-library', component: () => import('../views/PublicLibrary.vue'), meta: { standalone: true } },
    { path: '/privacy', name: 'privacy', component: () => import('../views/Privacy.vue'), meta: { public: true } },

    { path: '/:pathMatch(.*)*', name: 'not-found', component: () => import('../views/NotFound.vue'), meta: { public: true } }
  ],
  scrollBehavior(to, from, savedPosition) {
    return savedPosition || { top: 0 }
  }
})

function safeRedirect(target) {
  // Só caminhos internos: evita open redirect com ?redirect=https://...
  return typeof target === 'string' && target.startsWith('/') && !target.startsWith('//') ? target : '/'
}

router.beforeEach(async (to) => {
  if (to.meta.requiresAuth) {
    const user = await loadSession()
    if (!user) {
      return { name: 'login', query: to.fullPath !== '/' ? { redirect: to.fullPath } : {} }
    }
    return true
  }

  if (to.meta.guestOnly) {
    const user = await loadSession()
    if (user) return safeRedirect(to.query.redirect)
    return true
  }

  // Páginas públicas: tenta descobrir a sessão sem bloquear quem não tem.
  if (to.meta.public && !isAuthenticated.value) {
    await loadSession()
  }

  return true
})

export { safeRedirect }
export default router
