import { createRouter, createWebHistory } from 'vue-router'
import { loadSession, isAuthenticated, clearSession } from '../services/session.js'
import { setSessionExpiredHandler } from '../services/fetchClient.js'
import { setRouteTitle } from '../services/pageTitle.js'
import { installRouteFocus } from '../services/routeFocus.js'

/**
 * meta:
 *   requiresAuth — precisa de sessão; sem ela vai para /login?redirect=...
 *   guestOnly    — login/cadastro; quem já está logado vai para o início
 *   standalone   — tela cheia, sem o menu lateral
 *   public       — acessível com ou sem sessão (mostra o menu se houver sessão)
 *   title        — chave de pageTitle.* para o título da aba (services/pageTitle.js)
 *   noindex      — fora de buscadores; 'server' = o nginx decide (ver pageTitle.js)
 *
 * Views carregadas sob demanda: o chart.js do Dashboard e as telas internas
 * não entram no bundle do login.
 */
const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'home', component: () => import('../views/Home.vue'), meta: { requiresAuth: true, title: 'home' } },
    { path: '/books', name: 'library', component: () => import('../views/Library.vue'), meta: { requiresAuth: true, title: 'library' } },
    { path: '/authors', name: 'authors', component: () => import('../views/Author.vue'), meta: { requiresAuth: true, title: 'authors' } },
    { path: '/publishers', name: 'publishers', component: () => import('../views/Publisher.vue'), meta: { requiresAuth: true, title: 'publishers' } },
    { path: '/tags', name: 'tags', component: () => import('../views/Tags.vue'), meta: { requiresAuth: true, title: 'tags' } },
    { path: '/dashboard', name: 'dashboard', component: () => import('../views/Dashboard.vue'), meta: { requiresAuth: true, title: 'dashboard' } },
    { path: '/community', name: 'community', component: () => import('../views/Community.vue'), meta: { requiresAuth: true, title: 'community' } },
    { path: '/settings', name: 'settings', component: () => import('../views/Settings.vue'), meta: { requiresAuth: true, title: 'settings' } },

    { path: '/login', name: 'login', component: () => import('../views/Login.vue'), meta: { guestOnly: true, standalone: true, title: 'login' } },
    { path: '/register', name: 'register', component: () => import('../views/Register.vue'), meta: { guestOnly: true, standalone: true, title: 'register' } },

    { path: '/forgot-password', name: 'forgot-password', component: () => import('../views/ForgotPassword.vue'), meta: { standalone: true, title: 'forgotPassword' } },
    { path: '/reset-password', name: 'reset-password', component: () => import('../views/ResetPassword.vue'), meta: { standalone: true, title: 'resetPassword' } },
    { path: '/verify-email', name: 'verify-email', component: () => import('../views/VerifyEmail.vue'), meta: { standalone: true, title: 'verifyEmail' } },
    { path: '/unsubscribe', name: 'unsubscribe', component: () => import('../views/Unsubscribe.vue'), meta: { standalone: true, title: 'unsubscribe', noindex: true } },

    { path: '/u/:username', name: 'public-library', component: () => import('../views/PublicLibrary.vue'), meta: { standalone: true, title: 'publicLibrary', noindex: 'server' } },
    { path: '/privacy', name: 'privacy', component: () => import('../views/Privacy.vue'), meta: { public: true, title: 'privacy' } },

    { path: '/:pathMatch(.*)*', name: 'not-found', component: () => import('../views/NotFound.vue'), meta: { public: true, title: 'notFound' } }
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

router.afterEach(to => setRouteTitle(to))

// 401 em qualquer chamada autenticada: limpa a sessão e manda para o login,
// guardando onde a pessoa estava. Fica aqui (e não em session.js) para o
// session.js não precisar importar o router — antes era um import dinâmico
// que o Vite avisava ser inútil (INEFFECTIVE_DYNAMIC_IMPORT).
setSessionExpiredHandler(({ silent }) => {
  clearSession()
  if (silent) return

  const current = router.currentRoute.value
  if (current.meta.requiresAuth) {
    router.replace({ name: 'login', query: { redirect: current.fullPath } })
  }
})
installRouteFocus(router)

export { safeRedirect }
export default router
