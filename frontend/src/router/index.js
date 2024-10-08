import { createRouter, createWebHistory } from 'vue-router'
import Home from '../views/Home.vue'
import Library from '../views/Library.vue'
import ReadBooks from '../views/ReadBooks.vue'
import UnreadBooks from '../views/UnreadBooks.vue'
import Author from '../views/Author.vue'


const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: Home
    },
    {
      path: '/books',
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
    },
    {
      path: '/authors',
      name: 'authors',
      component: Author
    }
  ]
})

export default router
