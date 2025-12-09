<template>
  <div class="chat-container">
    <header class="chat-header">
      <button class="btn-back" @click="goBack">&#x2190; Sessions</button>
      <div class="header-info">
        <span class="session-id">{{ currentSessionId?.slice(0, 8) }}...</span>
        <StatusBadge :status="currentStatus" />
      </div>
      <div class="header-actions">
        <span class="round-info">Round {{ currentRound }}</span>
        <button
          class="btn-danger"
          @click="handleInterrupt"
          :disabled="currentStatus === 'waiting' || currentStatus === 'ended'"
        >
          Interrupt
        </button>
        <button class="btn-secondary" @click="handleEndSession">
          End Session
        </button>
      </div>
    </header>

    <main class="chat-main">
      <Terminal :messages="messages" :streamingMessage="streamingMessage" ref="terminalRef" />
    </main>

    <footer class="chat-footer">
      <InputBox
        :disabled="currentStatus !== 'waiting'"
        :placeholder="inputPlaceholder"
        @submit="handleSubmit"
      />
    </footer>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useSessionStore } from '@/stores/session'
import Terminal from '@/components/Terminal.vue'
import InputBox from '@/components/InputBox.vue'
import StatusBadge from '@/components/StatusBadge.vue'

const router = useRouter()
const route = useRoute()
const sessionStore = useSessionStore()
const terminalRef = ref<InstanceType<typeof Terminal> | null>(null)

const currentSessionId = computed(() => sessionStore.currentSessionId)
const currentStatus = computed(() => sessionStore.currentStatus)
const currentRound = computed(() => sessionStore.currentRound)
const messages = computed(() => sessionStore.messages)
const streamingMessage = computed(() => sessionStore.streamingMessage)

const inputPlaceholder = computed(() => {
  switch (currentStatus.value) {
    case 'waiting':
      return 'Type your message...'
    case 'active':
    case 'thinking':
    case 'executing':
      return 'Claude is working...'
    case 'ended':
      return 'Session has ended'
    default:
      return 'Please wait...'
  }
})

const goBack = () => {
  router.push({ name: 'sessions' })
}

const handleSubmit = (content: string) => {
  sessionStore.sendInput(content)
}

const handleInterrupt = () => {
  sessionStore.interrupt()
}

const handleEndSession = () => {
  sessionStore.endSession()
  router.push({ name: 'sessions' })
}

// Auto-scroll on new messages
watch(messages, () => {
  nextTick(() => {
    terminalRef.value?.scrollToBottom()
  })
}, { deep: true })

// Auto-scroll on streaming message updates
watch(streamingMessage, () => {
  nextTick(() => {
    terminalRef.value?.scrollToBottom()
  })
}, { deep: true })

// Load session if coming from URL
onMounted(() => {
  const sessionId = route.params.sessionId as string
  if (sessionId && sessionId !== currentSessionId.value) {
    sessionStore.resumeSession(sessionId)
  }
})
</script>

<style scoped>
.chat-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

.chat-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background-color: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

.btn-back {
  background: none;
  color: var(--text-secondary);
  padding: 8px 12px;
}

.btn-back:hover {
  background: none;
  color: var(--text-primary);
}

.header-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.session-id {
  font-family: 'Fira Code', monospace;
  color: var(--accent-green);
  font-size: 0.875rem;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.round-info {
  color: var(--text-muted);
  font-size: 0.875rem;
}

.btn-danger {
  background-color: #5a2d2d;
  color: var(--accent-red);
}

.btn-danger:hover:not(:disabled) {
  background-color: #6a3d3d;
}

.btn-secondary {
  background-color: var(--bg-tertiary);
}

.btn-secondary:hover {
  background-color: var(--border-color);
}

.chat-main {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.chat-footer {
  padding: 16px;
  background-color: var(--bg-secondary);
  border-top: 1px solid var(--border-color);
  flex-shrink: 0;
}
</style>
