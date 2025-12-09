<template>
  <div class="terminal" ref="containerRef">
    <div
      v-for="msg in messages"
      :key="msg.id"
      :class="['message', `message-${msg.type}`]"
    >
      <div class="message-header">
        <span class="message-role">{{ getRoleLabel(msg.type) }}</span>
        <span class="message-time">{{ formatTime(msg.timestamp) }}</span>
      </div>
      <div class="message-content">
        <template v-if="msg.type === 'tool_use'">
          <div class="tool-header">
            <span class="tool-name">{{ msg.metadata?.tool }}</span>
          </div>
          <pre v-if="msg.metadata?.input" class="tool-input">{{ formatJson(msg.metadata.input) }}</pre>
        </template>
        <template v-else-if="msg.type === 'tool_result'">
          <div :class="['tool-result-header', msg.metadata?.success ? 'success' : 'error']">
            {{ msg.metadata?.success ? 'Success' : 'Error' }}
          </div>
          <pre class="tool-output">{{ msg.content }}</pre>
        </template>
        <template v-else>
          <pre class="text-content" v-html="formatContent(msg.content)"></pre>
        </template>
      </div>
    </div>

    <div v-if="messages.length === 0" class="empty-terminal">
      <p>No messages yet</p>
      <p class="hint">Start by sending a message to Claude</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import type { TerminalMessage } from '@/types'

defineProps<{
  messages: TerminalMessage[]
}>()

const containerRef = ref<HTMLElement | null>(null)

const getRoleLabel = (type: string): string => {
  const labels: Record<string, string> = {
    user: 'You',
    instructor: 'Instructor',
    worker: 'Worker',
    thinking: 'Thinking',
    system: 'System',
    tool_use: 'Tool',
    tool_result: 'Result',
    error: 'Error'
  }
  return labels[type] || type
}

const formatTime = (timestamp: number): string => {
  return new Date(timestamp).toLocaleTimeString()
}

const formatJson = (obj: any): string => {
  try {
    return JSON.stringify(obj, null, 2)
  } catch {
    return String(obj)
  }
}

const formatContent = (content: string): string => {
  // Escape HTML but preserve newlines
  return content
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

const scrollToBottom = () => {
  if (containerRef.value) {
    containerRef.value.scrollTop = containerRef.value.scrollHeight
  }
}

defineExpose({ scrollToBottom })
</script>

<style scoped>
.terminal {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  background-color: var(--bg-primary);
  font-family: 'Fira Code', 'Consolas', monospace;
  font-size: 0.875rem;
}

.message {
  margin-bottom: 16px;
  padding: 12px;
  border-radius: 8px;
  border-left: 3px solid transparent;
}

.message-user {
  background-color: var(--bg-tertiary);
  border-left-color: var(--accent-blue);
}

.message-instructor {
  background-color: rgba(86, 156, 214, 0.1);
  border-left-color: var(--accent-blue);
}

.message-worker {
  background-color: rgba(78, 201, 176, 0.1);
  border-left-color: var(--accent-green);
}

.message-thinking {
  background-color: rgba(220, 220, 170, 0.1);
  border-left-color: var(--accent-yellow);
  font-style: italic;
}

.message-system {
  background-color: var(--bg-secondary);
  border-left-color: var(--text-muted);
  color: var(--text-secondary);
}

.message-tool_use {
  background-color: rgba(86, 156, 214, 0.05);
  border-left-color: var(--accent-blue);
}

.message-tool_result {
  background-color: rgba(78, 201, 176, 0.05);
  border-left-color: var(--accent-green);
}

.message-error {
  background-color: rgba(244, 71, 71, 0.1);
  border-left-color: var(--accent-red);
  color: var(--accent-red);
}

.message-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
  font-size: 0.75rem;
}

.message-role {
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.message-user .message-role { color: var(--accent-blue); }
.message-instructor .message-role { color: var(--accent-blue); }
.message-worker .message-role { color: var(--accent-green); }
.message-thinking .message-role { color: var(--accent-yellow); }
.message-system .message-role { color: var(--text-muted); }
.message-tool_use .message-role { color: var(--accent-blue); }
.message-tool_result .message-role { color: var(--accent-green); }
.message-error .message-role { color: var(--accent-red); }

.message-time {
  color: var(--text-muted);
}

.message-content {
  line-height: 1.5;
}

.text-content {
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
  background: none;
  padding: 0;
  font-family: inherit;
}

.tool-header {
  margin-bottom: 8px;
}

.tool-name {
  background-color: var(--bg-tertiary);
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 0.8rem;
}

.tool-input,
.tool-output {
  background-color: var(--bg-tertiary);
  padding: 8px;
  border-radius: 4px;
  overflow-x: auto;
  max-height: 300px;
  margin: 0;
  font-size: 0.8rem;
}

.tool-result-header {
  font-size: 0.75rem;
  font-weight: 600;
  margin-bottom: 8px;
  text-transform: uppercase;
}

.tool-result-header.success { color: var(--accent-green); }
.tool-result-header.error { color: var(--accent-red); }

.empty-terminal {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-muted);
}

.hint {
  font-size: 0.875rem;
  margin-top: 8px;
}
</style>
