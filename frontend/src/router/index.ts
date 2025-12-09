/**
 * Vue Router configuration
 */

import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
      meta: { requiresAuth: false }
    },
    {
      path: '/',
      name: 'sessions',
      component: () => import('@/views/SessionListView.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/chat/:sessionId?',
      name: 'chat',
      component: () => import('@/views/ChatView.vue'),
      meta: { requiresAuth: true }
    }
  ]
})

// Navigation guard for authentication
router.beforeEach((to, from, next) => {
  const authStore = useAuthStore()

  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    next({ name: 'login' })
  } else if (to.name === 'login' && authStore.isAuthenticated) {
    next({ name: 'sessions' })
  } else {
    next()
  }
})

export default router
