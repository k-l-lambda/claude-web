/**
 * Authentication store
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useGlobalWebSocket } from '@/composables/useWebSocket'

const STORAGE_KEY = 'claude-web-auth'

export const useAuthStore = defineStore('auth', () => {
  const isAuthenticated = ref(false)
  const userId = ref<string | null>(null)
  const authError = ref<string | null>(null)
  const isLoading = ref(false)
  const savedPassword = ref<string | null>(null)

  const { send, onMessage, connect, connected } = useGlobalWebSocket()

  // Listen for auth responses
  onMessage((msg) => {
    if (msg.type === 'auth_success') {
      isAuthenticated.value = true
      userId.value = msg.userId
      authError.value = null
      isLoading.value = false
      // Save password to localStorage on successful auth
      if (savedPassword.value) {
        localStorage.setItem(STORAGE_KEY, savedPassword.value)
      }
    } else if (msg.type === 'auth_failed') {
      isAuthenticated.value = false
      authError.value = msg.reason
      isLoading.value = false
      // Clear saved password on failed auth
      localStorage.removeItem(STORAGE_KEY)
      savedPassword.value = null
    }
  })

  const login = async (password: string) => {
    isLoading.value = true
    authError.value = null
    savedPassword.value = password

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
    savedPassword.value = null
    localStorage.removeItem(STORAGE_KEY)
  }

  // Try to auto-login with saved password
  const tryAutoLogin = async () => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      await login(stored)
      return true
    }
    return false
  }

  // Get saved password (for initial form value)
  const getSavedPassword = () => {
    return localStorage.getItem(STORAGE_KEY)
  }

  return {
    isAuthenticated,
    userId,
    authError,
    isLoading,
    login,
    logout,
    tryAutoLogin,
    getSavedPassword
  }
})
