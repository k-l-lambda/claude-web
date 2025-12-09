/**
 * Session store
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import yaml from 'js-yaml'
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

  // Streaming message state - for real-time display
  const streamingMessage = ref<{
    id: string
    type: TerminalMessage['type']
    content: string
    timestamp: number
  } | null>(null)

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

  // Extract text content from message content (string or ContentBlock array)
  const extractTextContent = (content: any): string => {
    if (typeof content === 'string') {
      return content
    }
    if (Array.isArray(content)) {
      // Extract text from ContentBlock array
      return content
        .filter((block: any) => block.type === 'text')
        .map((block: any) => block.text)
        .join('\n')
    }
    return String(content)
  }

  // Format object as YAML string
  const formatAsYaml = (obj: any): string => {
    if (typeof obj === 'string') {
      return obj
    }
    try {
      return yaml.dump(obj, { lineWidth: -1, noRefs: true })
    } catch {
      return JSON.stringify(obj, null, 2)
    }
  }

  // Streaming message handlers
  const appendToStreamingMessage = (role: 'instructor' | 'worker', delta: string) => {
    if (!streamingMessage.value || streamingMessage.value.type !== role) {
      // Start new streaming message
      streamingMessage.value = {
        id: generateMessageId(),
        type: role,
        content: delta,
        timestamp: Date.now()
      }
    } else {
      // Append to existing streaming message
      streamingMessage.value.content += delta
    }
  }

  const finalizeStreamingMessage = () => {
    if (streamingMessage.value) {
      messages.value.push({ ...streamingMessage.value } as TerminalMessage)
      streamingMessage.value = null
    }
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
          const content = extractTextContent(block.content)
          if (block.role === 'user') {
            addMessage('user', content)
          } else {
            addMessage('instructor', content)
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

      case 'text_delta':
        // Handle streaming text deltas
        appendToStreamingMessage(msg.role, msg.content)
        break

      case 'instructor_message':
        // Finalize any streaming content first, then add complete message
        // Note: if we're streaming, the streamed content is the same as this message
        // So we just finalize and don't add a duplicate
        if (streamingMessage.value && streamingMessage.value.type === 'instructor') {
          finalizeStreamingMessage()
        } else {
          addMessage('instructor', msg.content)
        }
        break

      case 'worker_message':
        // Same logic as instructor_message
        if (streamingMessage.value && streamingMessage.value.type === 'worker') {
          finalizeStreamingMessage()
        } else {
          addMessage('worker', msg.content)
        }
        break

      case 'system_message':
        addMessage('system', msg.content, { level: msg.level })
        break

      case 'tool_use':
        addMessage('tool_use', `Using tool: ${msg.tool}\n${formatAsYaml(msg.input)}`, { tool: msg.tool, input: msg.input })
        break

      case 'tool_result':
        addMessage('tool_result', formatAsYaml(msg.output), { tool: msg.tool, success: msg.success })
        break

      case 'waiting_input':
        currentStatus.value = 'waiting'
        addMessage('system', msg.prompt)
        break

      case 'round_complete':
        currentRound.value = msg.roundNumber
        break

      case 'done':
        finalizeStreamingMessage()
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

  const endSession = (sessionId?: string) => {
    const targetSessionId = sessionId || currentSessionId.value
    if (targetSessionId) {
      send({ type: 'end_session', sessionId: targetSessionId })
      // Remove from local list immediately for better UX
      sessions.value = sessions.value.filter(s => s.sessionId !== targetSessionId)
      // If ending current session, clear it
      if (targetSessionId === currentSessionId.value) {
        currentSessionId.value = null
        currentStatus.value = 'waiting'
      }
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
    streamingMessage,
    isLoading,
    listSessions,
    createSession,
    resumeSession,
    sendInput,
    interrupt,
    endSession
  }
})
