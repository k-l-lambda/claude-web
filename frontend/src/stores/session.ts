/**
 * Session store
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useGlobalWebSocket } from '@/composables/useWebSocket'
import type { SessionInfo, SessionStatus, TerminalMessage } from '@/types'

export const useSessionStore = defineStore('session', () => {
  const sessions = ref<SessionInfo[]>([])
  const currentSessionId = ref<string | null>(null)
  const currentStatus = ref<SessionStatus>('waiting')
  const currentRound = ref(0)
  const currentModel = ref('claude-sonnet-4-5-20250929')
  const messages = ref<TerminalMessage[]>([])
  const isLoading = ref(false)

  const { send, onMessage } = useGlobalWebSocket()

  // Current session
  const currentSession = computed(() =>
    sessions.value.find(s => s.sessionId === currentSessionId.value)
  )

  // Generate unique message ID
  let messageIdCounter = 0
  const generateMessageId = () => `msg-${Date.now()}-${messageIdCounter++}`

  // Add message to terminal
  const addMessage = (type: TerminalMessage['type'], content: string, metadata?: any) => {
    messages.value.push({
      id: generateMessageId(),
      type,
      content,
      timestamp: Date.now(),
      metadata
    })
  }

  // Listen for server messages
  onMessage((msg) => {
    switch (msg.type) {
      case 'session_list':
        sessions.value = msg.sessions
        break

      case 'session_created':
        currentSessionId.value = msg.sessionId
        currentStatus.value = msg.status
        messages.value = []
        addMessage('system', `Session created: ${msg.sessionId}`)
        break

      case 'session_resumed':
        currentSessionId.value = msg.sessionId
        messages.value = []
        // Restore history
        msg.history.forEach(block => {
          if (block.role === 'user') {
            addMessage('user', typeof block.content === 'string' ? block.content : JSON.stringify(block.content))
          } else {
            addMessage('instructor', typeof block.content === 'string' ? block.content : JSON.stringify(block.content))
          }
        })
        addMessage('system', 'Session resumed')
        break

      case 'session_ended':
        if (msg.sessionId === currentSessionId.value) {
          addMessage('system', `Session ended: ${msg.reason}`)
          currentStatus.value = 'ended'
        }
        break

      case 'thinking':
        addMessage('thinking', msg.content)
        break

      case 'instructor_message':
        addMessage('instructor', msg.content)
        break

      case 'worker_message':
        addMessage('worker', msg.content)
        break

      case 'system_message':
        addMessage('system', msg.content, { level: msg.level })
        break

      case 'tool_use':
        addMessage('tool_use', `Using tool: ${msg.tool}`, { tool: msg.tool, input: msg.input })
        break

      case 'tool_result':
        addMessage('tool_result', typeof msg.output === 'string' ? msg.output : JSON.stringify(msg.output, null, 2), { tool: msg.tool, success: msg.success })
        break

      case 'waiting_input':
        currentStatus.value = 'waiting'
        addMessage('system', msg.prompt)
        break

      case 'round_complete':
        currentRound.value = msg.roundNumber
        break

      case 'done':
        currentStatus.value = 'waiting'
        addMessage('system', 'Task completed')
        break

      case 'status_update':
        if (msg.sessionId === currentSessionId.value) {
          currentStatus.value = msg.status
          currentRound.value = msg.round
          currentModel.value = msg.model
        }
        break

      case 'error':
        addMessage('error', msg.message)
        break
    }
  })

  // Actions
  const listSessions = () => {
    send({ type: 'list_sessions' })
  }

  const createSession = (workDir: string, instruction?: string) => {
    isLoading.value = true
    send({ type: 'create_session', workDir, instruction })
  }

  const resumeSession = (sessionId: string) => {
    isLoading.value = true
    send({ type: 'resume_session', sessionId })
  }

  const sendInput = (content: string) => {
    if (currentSessionId.value) {
      addMessage('user', content)
      send({ type: 'send_input', sessionId: currentSessionId.value, content })
      currentStatus.value = 'active'
    }
  }

  const interrupt = () => {
    if (currentSessionId.value) {
      send({ type: 'interrupt', sessionId: currentSessionId.value })
      addMessage('system', 'Interrupt signal sent')
    }
  }

  const endSession = () => {
    if (currentSessionId.value) {
      send({ type: 'end_session', sessionId: currentSessionId.value })
    }
  }

  return {
    sessions,
    currentSessionId,
    currentSession,
    currentStatus,
    currentRound,
    currentModel,
    messages,
    isLoading,
    listSessions,
    createSession,
    resumeSession,
    sendInput,
    interrupt,
    endSession
  }
})
