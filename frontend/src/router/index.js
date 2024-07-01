import { createRouter, createWebHistory } from 'vue-router'
import Home from '../views/Home.vue'
import Library from '../views/Library.vue'
import ReadBooks from '../views/ReadBooks.vue'
import UnreadBooks from '../views/UnreadBooks.vue'


const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: Home
    },
    {
      path: '/library',
      name: 'library',
      component: Library
    },
    {
      path: '/read',
      name: 'read',
      component: ReadBooks
    },
    {
      path: '/unread',
      name: 'unread',
      component: UnreadBooks
    }
  ]
})

export default router
