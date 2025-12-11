import { ref, onUnmounted } from 'vue'

// Downsample audio buffer to target sample rate
function downsampleBuffer(buffer: Float32Array, inputSampleRate: number, outputSampleRate: number): Float32Array {
  if (inputSampleRate === outputSampleRate) {
    return new Float32Array(buffer)
  }
  const sampleRateRatio = inputSampleRate / outputSampleRate
  const newLength = Math.round(buffer.length / sampleRateRatio)
  const result = new Float32Array(newLength)
  let offsetResult = 0
  let offsetBuffer = 0
  while (offsetResult < result.length) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio)
    let accum = 0
    let count = 0
    for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
      accum += buffer[i]
      count++
    }
    result[offsetResult] = accum / count
    offsetResult++
    offsetBuffer = nextOffsetBuffer
  }
  return result
}

// Global state for sherpa-onnx
let recognizer: any = null
let recognizerStream: any = null
let audioCtx: AudioContext | null = null
let mediaStream: MediaStream | null = null
let recorder: ScriptProcessorNode | null = null
let Module: any = null
let resultHistory: string[] = []  // Store completed sentences

const isLoading = ref(false)
const isReady = ref(false)
const isRecording = ref(false)
const currentResult = ref('')
const error = ref<string | null>(null)

export function useSherpaOnnx() {
  const loadModel = async () => {
    if (isReady.value || isLoading.value) return

    isLoading.value = true
    error.value = null

    try {
      // Setup Module configuration
      Module = {
        locateFile: (path: string, scriptDirectory: string = '') => {
          return '/sherpa-onnx/' + path
        },
        setStatus: (status: string) => {
          console.log('sherpa-onnx status:', status)
        },
        onRuntimeInitialized: () => {
          console.log('sherpa-onnx WASM initialized')
        }
      }
      ;(window as any).Module = Module

      // Load scripts in order
      const loadScript = (src: string): Promise<void> => {
        return new Promise((resolve, reject) => {
          const existing = document.querySelector(`script[src="${src}"]`)
          if (existing) {
            resolve()
            return
          }
          const script = document.createElement('script')
          script.src = src
          script.onload = () => resolve()
          script.onerror = () => reject(new Error(`Failed to load ${src}`))
          document.head.appendChild(script)
        })
      }

      // Load ASR wrapper first (defines createOnlineRecognizer)
      await loadScript('/sherpa-onnx/sherpa-onnx-asr.js')

      // Load WASM module (triggers download of .wasm and .data files)
      await loadScript('/sherpa-onnx/sherpa-onnx-wasm-main-asr.js')

      // Wait for WASM to be ready
      await new Promise<void>((resolve, reject) => {
        const maxWait = 60000 // 60s for model download
        const startTime = Date.now()

        const check = () => {
          if (Date.now() - startTime > maxWait) {
            reject(new Error('Timeout waiting for WASM initialization'))
            return
          }

          const createFn = (window as any).createOnlineRecognizer
          const mod = (window as any).Module

          if (createFn && mod && mod.calledRun) {
            resolve()
          } else {
            setTimeout(check, 100)
          }
        }
        check()
      })

      // Create recognizer
      const createOnlineRecognizer = (window as any).createOnlineRecognizer
      recognizer = createOnlineRecognizer((window as any).Module)
      recognizerStream = recognizer.createStream()

      isReady.value = true
      console.log('sherpa-onnx recognizer ready')
    } catch (e: any) {
      error.value = e.message || 'Failed to load ASR model'
      console.error('Sherpa-onnx load error:', e)
    } finally {
      isLoading.value = false
    }
  }

  const startRecording = async (): Promise<void> => {
    if (!isReady.value || isRecording.value) return

    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        }
      })

      audioCtx = new AudioContext({ sampleRate: 16000 })
      const source = audioCtx.createMediaStreamSource(mediaStream)
      recorder = audioCtx.createScriptProcessor(4096, 1, 1)

      recorder.onaudioprocess = (e) => {
        if (!isRecording.value || !recognizer || !recognizerStream) return

        const inputSamples = e.inputBuffer.getChannelData(0)
        // Downsample if needed (browser may not support 16kHz directly)
        const samples = downsampleBuffer(inputSamples, audioCtx!.sampleRate, 16000)

        recognizerStream.acceptWaveform(16000, samples)

        while (recognizer.isReady(recognizerStream)) {
          recognizer.decode(recognizerStream)
        }

        // Check for endpoint (sentence boundary)
        const isEndpoint = recognizer.isEndpoint(recognizerStream)

        const resultObj = recognizer.getResult(recognizerStream)
        const currentText = resultObj?.text ?? ''

        // Build full result: history + current
        const fullResult = [...resultHistory, currentText].filter(s => s.length > 0).join(' ')

        if (fullResult.length > 0) {
          currentResult.value = fullResult
        }

        if (isEndpoint && currentText.length > 0) {
          // Save completed sentence to history
          resultHistory.push(currentText)
          // Reset recognizer for next sentence
          recognizer.reset(recognizerStream)
        }
      }

      source.connect(recorder)
      recorder.connect(audioCtx.destination)

      isRecording.value = true
      currentResult.value = ''
      resultHistory = []  // Clear history for new recording
    } catch (e: any) {
      error.value = e.message || 'Microphone access denied'
      console.error('Recording error:', e)
    }
  }

  const stopRecording = (): string => {
    isRecording.value = false

    if (recorder) {
      recorder.disconnect()
      recorder = null
    }

    if (audioCtx) {
      audioCtx.close()
      audioCtx = null
    }

    if (mediaStream) {
      mediaStream.getTracks().forEach(track => track.stop())
      mediaStream = null
    }

    // Get final result - use accumulated history + any current text
    if (recognizer && recognizerStream) {
      try {
        const resultObj = recognizer.getResult(recognizerStream)
        const currentText = resultObj?.text ?? ''

        // Build final result from history + current
        const allParts = [...resultHistory]
        if (currentText.length > 0) {
          allParts.push(currentText)
        }

        if (allParts.length > 0) {
          currentResult.value = allParts.join(' ')
        }

        recognizer.reset(recognizerStream)
      } catch (e) {
        // Ignore errors during cleanup
        console.warn('Error getting final result:', e)
      }
    }

    // Clear history after stop
    resultHistory = []

    return currentResult.value
  }

  onUnmounted(() => {
    if (isRecording.value) {
      stopRecording()
    }
  })

  return {
    isLoading,
    isReady,
    isRecording,
    currentResult,
    error,
    loadModel,
    startRecording,
    stopRecording,
  }
}
