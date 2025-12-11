<template>
  <div class="input-box">
    <textarea
      ref="textareaRef"
      v-model="input"
      :placeholder="placeholder"
      :disabled="disabled"
      @keydown="handleKeydown"
      @input="autoResize"
      rows="1"
    ></textarea>
    <button
      class="voice-btn"
      :class="{ recording: isRecording, loading: isLoading }"
      :disabled="disabled"
      @click="toggleVoice"
      :title="voiceButtonTitle"
    >
      <span v-if="isLoading" class="icon">...</span>
      <span v-else-if="isRecording" class="icon pulse">&#9899;</span>
      <span v-else class="icon">&#127908;</span>
    </button>
    <button
      class="send-btn"
      :disabled="disabled || !input.trim()"
      @click="handleSubmit"
    >
      Send
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useSherpaOnnx } from '@/composables/useSherpaOnnx'

const props = withDefaults(defineProps<{
  disabled?: boolean
  placeholder?: string
}>(), {
  disabled: false,
  placeholder: 'Type your message...'
})

const emit = defineEmits<{
  submit: [content: string]
}>()

const input = ref('')
const textareaRef = ref<HTMLTextAreaElement | null>(null)

const {
  isLoading,
  isReady,
  isRecording,
  currentResult,
  loadModel,
  startRecording,
  stopRecording,
} = useSherpaOnnx()

const voiceButtonTitle = computed(() => {
  if (isLoading.value) return 'Loading ASR model...'
  if (isRecording.value) return 'Click to stop recording'
  if (!isReady.value) return 'Click to enable voice input'
  return 'Click to start voice input'
})

const toggleVoice = async () => {
  if (props.disabled) return

  if (!isReady.value && !isLoading.value) {
    await loadModel()
    return
  }

  if (isRecording.value) {
    const result = stopRecording()
    if (result.trim()) {
      input.value = result.trim()
      autoResize()
    }
  } else if (isReady.value) {
    await startRecording()
  }
}

// Update input with live transcription
watch(currentResult, (newResult) => {
  if (isRecording.value && newResult) {
    input.value = newResult
    autoResize()
  }
})

const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSubmit()
  }
}

const handleSubmit = () => {
  const content = input.value.trim()
  if (content && !props.disabled) {
    // Stop recording if active
    if (isRecording.value) {
      stopRecording()
    }
    emit('submit', content)
    input.value = ''
    if (textareaRef.value) {
      textareaRef.value.style.height = 'auto'
    }
  }
}

const autoResize = () => {
  if (textareaRef.value) {
    textareaRef.value.style.height = 'auto'
    const maxHeight = 200
    textareaRef.value.style.height = Math.min(textareaRef.value.scrollHeight, maxHeight) + 'px'
  }
}

onMounted(() => {
  textareaRef.value?.focus()
})
</script>

<style scoped>
.input-box {
  display: flex;
  gap: 8px;
  align-items: flex-end;
}

textarea {
  flex: 1;
  resize: none;
  min-height: 40px;
  max-height: 200px;
  padding: 10px 12px;
  font-family: inherit;
  font-size: 0.9375rem;
  line-height: 1.4;
}

textarea:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.voice-btn {
  width: 40px;
  height: 40px;
  padding: 0;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--bg-tertiary);
  border-radius: 6px;
  transition: all 0.2s;
}

.voice-btn:hover:not(:disabled) {
  background-color: var(--border-color);
}

.voice-btn.recording {
  background-color: #5a2d2d;
}

.voice-btn.loading {
  opacity: 0.7;
}

.voice-btn .icon {
  font-size: 1.1rem;
}

.voice-btn .icon.pulse {
  animation: pulse 1s infinite;
  color: var(--accent-red);
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

.send-btn {
  padding: 10px 20px;
  height: 40px;
  flex-shrink: 0;
}
</style>
