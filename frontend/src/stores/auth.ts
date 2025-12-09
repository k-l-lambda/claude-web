/**
 * Authentication store
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useGlobalWebSocket } from '@/composables/useWebSocket'

export const useAuthStore = defineStore('auth', () => {
  const isAuthenticated = ref(false)
  const userId = ref<string | null>(null)
  const authError = ref<string | null>(null)
  const isLoading = ref(false)

  const { send, onMessage, connect, connected } = useGlobalWebSocket()

  // Listen for auth responses
  onMessage((msg) => {
    if (msg.type === 'auth_success') {
      isAuthenticated.value = true
      userId.value = msg.userId
      authError.value = null
      isLoading.value = false
    } else if (msg.type === 'auth_failed') {
      isAuthenticated.value = false
      authError.value = msg.reason
      isLoading.value = false
    }
  })

  const login = async (password: string) => {
    isLoading.value = true
    authError.value = null

    try {
      // Ensure WebSocket is connected
      if (!connected.value) {
        await connect()
      }

      // Send auth message
      send({ type: 'auth', password })
    } catch (e) {
      authError.value = 'Connection failed'
      isLoading.value = false
    }
  }

  const logout = () => {
    isAuthenticated.value = false
    userId.value = null
  }

  return {
    isAuthenticated,
    userId,
    authError,
    isLoading,
    login,
    logout
  }
})
