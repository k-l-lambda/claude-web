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
      class="send-btn"
      :disabled="disabled || !input.trim()"
      @click="handleSubmit"
    >
      Send
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'

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

const handleKeydown = (e: KeyboardEvent) => {
  // Submit on Enter (without Shift)
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSubmit()
  }
}

const handleSubmit = () => {
  const content = input.value.trim()
  if (content && !props.disabled) {
    emit('submit', content)
    input.value = ''
    // Reset height
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
  gap: 12px;
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

.send-btn {
  padding: 10px 20px;
  height: 40px;
  flex-shrink: 0;
}
</style>
