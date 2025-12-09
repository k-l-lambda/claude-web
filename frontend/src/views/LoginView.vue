<template>
  <div class="login-container">
    <div class="login-box">
      <h1 class="login-title">Claude Code Web</h1>
      <p class="login-subtitle">Enter password to continue</p>

      <form @submit.prevent="handleLogin" class="login-form">
        <div class="form-group">
          <input
            v-model="password"
            type="password"
            placeholder="Password"
            :disabled="isLoading"
            autofocus
          />
        </div>

        <div v-if="authError" class="error-message">
          {{ authError }}
        </div>

        <button type="submit" :disabled="isLoading || !password">
          {{ isLoading ? 'Authenticating...' : 'Login' }}
        </button>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const authStore = useAuthStore()

const password = ref('')

const isLoading = computed(() => authStore.isLoading)
const authError = computed(() => authStore.authError)

const handleLogin = async () => {
  if (password.value) {
    await authStore.login(password.value)
  }
}

// Navigate on successful auth
watch(() => authStore.isAuthenticated, (authenticated) => {
  if (authenticated) {
    router.push({ name: 'sessions' })
  }
})
</script>

<style scoped>
.login-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  background-color: var(--bg-primary);
}

.login-box {
  background-color: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 40px;
  width: 100%;
  max-width: 400px;
}

.login-title {
  text-align: center;
  color: var(--accent-blue);
  margin-bottom: 8px;
  font-size: 1.5rem;
}

.login-subtitle {
  text-align: center;
  color: var(--text-secondary);
  margin-bottom: 24px;
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form-group input {
  width: 100%;
  padding: 12px;
  font-size: 1rem;
}

.error-message {
  color: var(--accent-red);
  font-size: 0.875rem;
  text-align: center;
}

button {
  padding: 12px;
  font-size: 1rem;
}
</style>
