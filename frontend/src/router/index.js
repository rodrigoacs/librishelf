import { createRouter, createWebHistory } from 'vue-router'
import Home from '../views/Home.vue'
import Library from '../views/Library.vue'
import Author from '../views/Author.vue'
import Login from '../views/Login.vue'
import Register from '../views/Register.vue'
import Publisher from '../views/Publisher.vue'
import Tags from '../views/Tags.vue'
import Dashboard from '../views/Dashboard.vue'
import PublicLibrary from '../views/PublicLibrary.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'home', component: Home, meta: { requiresAuth: true } },
    { path: '/books', name: 'library', component: Library, meta: { requiresAuth: true } },
    { path: '/authors', name: 'authors', component: Author, meta: { requiresAuth: true } },
    { path: '/login', name: 'login', component: Login },
    { path: '/register', name: 'register', component: Register },
    { path: '/publishers', name: 'publishers', component: Publisher, meta: { requiresAuth: true } },
    { path: '/dashboard', name: 'dashboard', component: Dashboard, meta: { requiresAuth: true } },
    { path: '/tags', name: 'tags', component: Tags, meta: { requiresAuth: true } },
    { path: '/u/:username', name: 'public-library', component: PublicLibrary, meta: { requiresAuth: false } }
  ]
})

router.beforeEach((to, from, next) => {
  const token = localStorage.getItem('token')
  const timestamp = localStorage.getItem('timestamp')
  const tokenDuration = 3600000 // 1h in milliseconds

  if (token && timestamp) {
    const now = Date.now()
    const expirationTime = new Date(parseInt(timestamp)).getTime() + tokenDuration

    if (now >= expirationTime) {
      localStorage.removeItem('token')
      localStorage.removeItem('timestamp')
      next('/login')
    }
  }

  if (to.meta.requiresAuth && !token) {
    next('/login')
  } else {
    next()
  }
})

export default router
