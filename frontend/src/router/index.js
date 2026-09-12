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
import api from '../services/api.js'

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

router.beforeEach(async (to, from, next) => {
  if (!to.meta.requiresAuth) {
    return next()
  }

  try {
    const { user } = await api.me()
    localStorage.setItem('user', JSON.stringify(user))
    next()
  } catch {
    localStorage.removeItem('user')
    next('/login')
  }
})

export default router