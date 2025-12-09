<template>
  <span :class="['status-badge', `status-${status}`]">
    {{ label }}
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { SessionStatus } from '@/types'

const props = defineProps<{
  status: SessionStatus
}>()

const label = computed(() => {
  const labels: Record<SessionStatus, string> = {
    initializing: 'Initializing',
    active: 'Active',
    thinking: 'Thinking',
    executing: 'Executing',
    waiting: 'Waiting',
    paused: 'Paused',
    ended: 'Ended'
  }
  return labels[props.status] || props.status
})
</script>

<style scoped>
.status-badge {
  font-size: 0.75rem;
  padding: 4px 10px;
  border-radius: 4px;
  text-transform: uppercase;
  font-weight: 500;
  letter-spacing: 0.5px;
}

.status-initializing {
  background-color: rgba(158, 158, 158, 0.2);
  color: var(--text-secondary);
}

.status-active {
  background-color: rgba(78, 201, 176, 0.2);
  color: var(--accent-green);
}

.status-thinking {
  background-color: rgba(220, 220, 170, 0.2);
  color: var(--accent-yellow);
  animation: pulse 1.5s ease-in-out infinite;
}

.status-executing {
  background-color: rgba(86, 156, 214, 0.2);
  color: var(--accent-blue);
  animation: pulse 1.5s ease-in-out infinite;
}

.status-waiting {
  background-color: rgba(220, 220, 170, 0.2);
  color: var(--accent-yellow);
}

.status-paused {
  background-color: rgba(212, 166, 86, 0.2);
  color: #d4a656;
}

.status-ended {
  background-color: rgba(244, 71, 71, 0.2);
  color: var(--accent-red);
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}
</style>
