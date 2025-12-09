<template>
  <div class="session-list-container">
    <header class="header">
      <h1>Claude Code Web</h1>
      <button class="btn-secondary" @click="handleLogout">Logout</button>
    </header>

    <main class="main-content">
      <section class="new-session">
        <h2>New Session</h2>
        <form @submit.prevent="handleCreateSession" class="new-session-form">
          <div class="form-row">
            <label for="workDir">Working Directory</label>
            <input
              id="workDir"
              v-model="workDir"
              type="text"
              placeholder="/path/to/project"
            />
          </div>
          <div class="form-row">
            <label for="instruction">Initial Instruction (optional)</label>
            <textarea
              id="instruction"
              v-model="instruction"
              placeholder="What would you like Claude to do?"
              rows="3"
            ></textarea>
          </div>
          <button type="submit" :disabled="!workDir.trim()">
            Create Session
          </button>
        </form>
      </section>

      <section class="existing-sessions">
        <div class="section-header">
          <h2>Existing Sessions</h2>
          <button class="btn-icon" @click="refreshSessions" title="Refresh">
            &#x21bb;
          </button>
        </div>

        <div v-if="sessions.length === 0" class="empty-state">
          No existing sessions
        </div>

        <div v-else class="sessions-grid">
          <div
            v-for="session in sessions"
            :key="session.sessionId"
            class="session-card"
            @click="handleResumeSession(session.sessionId)"
          >
            <div class="session-header">
              <span class="session-id">{{ session.sessionId.slice(0, 8) }}...</span>
              <span :class="['status-badge', `status-${session.status}`]">
                {{ session.status }}
              </span>
            </div>
            <div class="session-workdir">{{ session.workDir }}</div>
            <div class="session-meta">
              <span>Rounds: {{ session.roundCount }}</span>
              <span>{{ formatDate(session.lastActivity) }}</span>
            </div>
          </div>
        </div>
      </section>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useSessionStore } from '@/stores/session'

const router = useRouter()
const authStore = useAuthStore()
const sessionStore = useSessionStore()

const workDir = ref('')
const instruction = ref('')

const sessions = computed(() => sessionStore.sessions)

const formatDate = (dateStr: string) => {
  const date = new Date(dateStr)
  return date.toLocaleString()
}

const handleCreateSession = () => {
  if (workDir.value.trim()) {
    sessionStore.createSession(workDir.value.trim(), instruction.value.trim() || undefined)
  }
}

const handleResumeSession = (sessionId: string) => {
  sessionStore.resumeSession(sessionId)
}

const refreshSessions = () => {
  sessionStore.listSessions()
}

const handleLogout = () => {
  authStore.logout()
  router.push({ name: 'login' })
}

// Navigate to chat when session is created or resumed
watch(() => sessionStore.currentSessionId, (sessionId) => {
  if (sessionId) {
    router.push({ name: 'chat', params: { sessionId } })
  }
})

onMounted(() => {
  refreshSessions()
})
</script>

<style scoped>
.session-list-container {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  background-color: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
}

.header h1 {
  color: var(--accent-blue);
  font-size: 1.25rem;
}

.btn-secondary {
  background-color: var(--bg-tertiary);
}

.btn-secondary:hover {
  background-color: var(--border-color);
}

.main-content {
  flex: 1;
  padding: 24px;
  max-width: 1200px;
  margin: 0 auto;
  width: 100%;
}

section {
  margin-bottom: 32px;
}

h2 {
  color: var(--text-primary);
  font-size: 1.125rem;
  margin-bottom: 16px;
}

.new-session-form {
  background-color: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 24px;
}

.form-row {
  margin-bottom: 16px;
}

.form-row label {
  display: block;
  margin-bottom: 8px;
  color: var(--text-secondary);
  font-size: 0.875rem;
}

.form-row input,
.form-row textarea {
  width: 100%;
}

.form-row textarea {
  resize: vertical;
}

.section-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.section-header h2 {
  margin-bottom: 0;
}

.btn-icon {
  background: none;
  padding: 4px 8px;
  font-size: 1.25rem;
  color: var(--text-secondary);
}

.btn-icon:hover {
  color: var(--text-primary);
  background: none;
}

.empty-state {
  color: var(--text-muted);
  text-align: center;
  padding: 40px;
  background-color: var(--bg-secondary);
  border-radius: 8px;
}

.sessions-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
}

.session-card {
  background-color: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 16px;
  cursor: pointer;
  transition: border-color 0.2s;
}

.session-card:hover {
  border-color: var(--accent-blue);
}

.session-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.session-id {
  font-family: 'Fira Code', monospace;
  color: var(--accent-green);
}

.status-badge {
  font-size: 0.75rem;
  padding: 2px 8px;
  border-radius: 4px;
  text-transform: uppercase;
}

.status-active { background-color: #2d5a2d; color: var(--accent-green); }
.status-waiting { background-color: #5a5a2d; color: var(--accent-yellow); }
.status-paused { background-color: #5a4a2d; color: #d4a656; }
.status-ended { background-color: #5a2d2d; color: var(--accent-red); }

.session-workdir {
  font-size: 0.875rem;
  color: var(--text-secondary);
  margin-bottom: 8px;
  word-break: break-all;
}

.session-meta {
  display: flex;
  justify-content: space-between;
  font-size: 0.75rem;
  color: var(--text-muted);
}
</style>
