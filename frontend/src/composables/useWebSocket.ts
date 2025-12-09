/**
 * WebSocket composable for real-time communication
 */

import { ref, computed, onUnmounted } from 'vue'
import type { ClientMessage, ServerMessage } from '@/types'

const WS_URL = import.meta.env.VITE_WS_URL || `ws://${window.location.hostname}:3000`

export function useWebSocket() {
  const ws = ref<WebSocket | null>(null)
  const connected = ref(false)
  const connecting = ref(false)
  const error = ref<string | null>(null)
  const messageHandlers = new Set<(msg: ServerMessage) => void>()

  const connect = () => {
    if (ws.value?.readyState === WebSocket.OPEN) {
      return Promise.resolve()
    }

    connecting.value = true
    error.value = null

    return new Promise<void>((resolve, reject) => {
      ws.value = new WebSocket(WS_URL)

      ws.value.onopen = () => {
        connected.value = true
        connecting.value = false
        console.log('WebSocket connected')
        resolve()
      }

      ws.value.onclose = (event) => {
        connected.value = false
        connecting.value = false
        console.log('WebSocket closed:', event.code, event.reason)

        // Auto-reconnect after 3 seconds if not intentional close
        if (event.code !== 1000) {
          setTimeout(() => {
            if (!connected.value && !connecting.value) {
              connect().catch(() => {})
            }
          }, 3000)
        }
      }

      ws.value.onerror = (event) => {
        connecting.value = false
        error.value = 'WebSocket connection error'
        console.error('WebSocket error:', event)
        reject(new Error('WebSocket connection failed'))
      }

      ws.value.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as ServerMessage
          messageHandlers.forEach(handler => handler(message))
        } catch (e) {
          console.error('Failed to parse message:', e)
        }
      }
    })
  }

  const disconnect = () => {
    if (ws.value) {
      ws.value.close(1000, 'User disconnect')
      ws.value = null
    }
    connected.value = false
  }

  const send = (message: ClientMessage) => {
    if (ws.value?.readyState === WebSocket.OPEN) {
      ws.value.send(JSON.stringify(message))
    } else {
      console.warn('WebSocket not connected, cannot send message')
    }
  }

  const onMessage = (handler: (msg: ServerMessage) => void) => {
    messageHandlers.add(handler)
    return () => messageHandlers.delete(handler)
  }

  // Cleanup on unmount
  onUnmounted(() => {
    messageHandlers.clear()
  })

  return {
    connected,
    connecting,
    error,
    connect,
    disconnect,
    send,
    onMessage
  }
}

// Singleton instance for app-wide use
let globalWs: ReturnType<typeof useWebSocket> | null = null

export function useGlobalWebSocket() {
  if (!globalWs) {
    globalWs = useWebSocket()
  }
  return globalWs
}
