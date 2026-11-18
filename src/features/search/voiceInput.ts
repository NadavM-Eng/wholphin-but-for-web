// `VoiceInputManager` (W/ui/components/VoiceInputManager.kt) on top of the Web Speech API
// (`SpeechRecognition`, prefixed `webkitSpeechRecognition` in Chromium and Safari).
// States: idle -> starting -> listening -> processing -> result | error. An 8 s timer runs from the
// moment audio capture starts; when it fires a non-blank partial transcript becomes the result.

export type VoiceState =
  | { kind: 'idle' }
  | { kind: 'starting' }
  | { kind: 'listening' }
  | { kind: 'processing' }
  | { kind: 'result'; text: string }
  | { kind: 'error'; messageKey: string; retryable: boolean }

/** The subset of the Web Speech API used here (not in TypeScript's DOM lib). */
export interface RecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  onstart: (() => void) | null
  onaudiostart: (() => void) | null
  onspeechend: (() => void) | null
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
  abort(): void
}
export type RecognitionCtor = new () => RecognitionLike

export const LISTENING_TIMEOUT_MS = 8000

/** The browser's recognizer, or null when there is none (then the microphone button is hidden). */
export function speechRecognitionCtor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

/** Web Speech `error` codes -> upstream messages / retryability (ERROR_TO_RESOURCE_MAP, RETRYABLE_ERRORS). */
export function mapRecognitionError(code: string): { messageKey: string; retryable: boolean } {
  switch (code) {
    case 'no-speech':
      return { messageKey: 'voice_error_speech_timeout', retryable: true }
    case 'audio-capture':
      return { messageKey: 'voice_error_audio', retryable: false }
    case 'not-allowed':
    case 'service-not-allowed':
      return { messageKey: 'voice_error_permissions', retryable: false }
    case 'network':
      return { messageKey: 'voice_error_network', retryable: true }
    case 'language-not-supported':
    case 'bad-grammar':
      return { messageKey: 'voice_error_client', retryable: false }
    default:
      return { messageKey: 'voice_error_unknown', retryable: false }
  }
}

type Listener = () => void

export class VoiceInput {
  private readonly ctor: RecognitionCtor | null
  private readonly lang: () => string
  private readonly isOnline: () => boolean
  private rec: RecognitionLike | null = null
  private generation = 0
  private timer: ReturnType<typeof setTimeout> | null = null
  private listeners = new Set<Listener>()
  state: VoiceState = { kind: 'idle' }
  partial = ''

  constructor(ctor: RecognitionCtor | null, lang: () => string, isOnline: () => boolean = () => navigator.onLine) {
    this.ctor = ctor
    this.lang = lang
    this.isOnline = isOnline
  }

  get available(): boolean {
    return this.ctor != null
  }

  subscribe = (l: Listener) => {
    this.listeners.add(l)
    return () => {
      this.listeners.delete(l)
    }
  }

  private set(state: VoiceState, partial = this.partial) {
    this.state = state
    this.partial = partial
    this.listeners.forEach((l) => l())
  }

  private cancelTimeout() {
    if (this.timer != null) clearTimeout(this.timer)
    this.timer = null
  }

  private destroy() {
    this.generation++
    const rec = this.rec
    this.rec = null
    if (rec) {
      rec.onstart = rec.onaudiostart = rec.onspeechend = rec.onend = null
      rec.onresult = null
      rec.onerror = null
      try {
        rec.abort()
      } catch {
        // already stopped
      }
    }
  }

  start() {
    if (!this.ctor) return
    if (this.state.kind === 'starting' || this.state.kind === 'listening') return
    this.destroy()
    this.cancelTimeout()
    if (!this.isOnline()) {
      this.set({ kind: 'error', messageKey: 'voice_error_network', retryable: true })
      return
    }
    this.set({ kind: 'starting' }, '')
    const gen = this.generation
    const valid = () => gen === this.generation
    const rec = new this.ctor()
    this.rec = rec
    rec.lang = this.lang()
    rec.continuous = false
    rec.interimResults = true
    rec.maxAlternatives = 1
    const listening = () => {
      if (!valid() || this.state.kind !== 'starting') return
      this.set({ kind: 'listening' })
      this.startTimeout(gen)
    }
    rec.onstart = listening
    rec.onaudiostart = listening
    rec.onspeechend = () => {
      if (!valid()) return
      this.cancelTimeout()
      if (this.state.kind === 'listening' || this.state.kind === 'starting') this.set({ kind: 'processing' })
    }
    rec.onresult = (e) => {
      if (!valid()) return
      let text = ''
      let final = false
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i]
        text += r[0]?.transcript ?? ''
        if (r.isFinal) final = true
      }
      if (final) {
        this.cancelTimeout()
        this.destroy()
        this.set(text.trim() ? { kind: 'result', text: text.trim() } : { kind: 'error', messageKey: 'voice_error_no_match', retryable: true }, '')
      } else {
        this.set(this.state, text)
      }
    }
    rec.onerror = (e) => {
      if (!valid() || e.error === 'aborted') return
      this.cancelTimeout()
      this.destroy()
      const m = mapRecognitionError(e.error)
      this.set({ kind: 'error', ...m }, '')
    }
    rec.onend = () => {
      if (!valid()) return
      // ended without a final result (Chromium does this after a silent pause)
      this.cancelTimeout()
      const partial = this.partial.trim()
      this.destroy()
      this.set(partial ? { kind: 'result', text: partial } : { kind: 'error', messageKey: 'voice_error_no_match', retryable: true }, '')
    }
    try {
      rec.start()
    } catch {
      this.destroy()
      this.set({ kind: 'error', messageKey: 'voice_error_start_failed', retryable: true }, '')
    }
  }

  private startTimeout(gen: number) {
    this.cancelTimeout()
    this.timer = setTimeout(() => {
      this.timer = null
      if (gen !== this.generation || this.state.kind !== 'listening') return
      const partial = this.partial.trim()
      this.destroy()
      this.set(partial ? { kind: 'result', text: partial } : { kind: 'error', messageKey: 'voice_error_timeout', retryable: true }, '')
    }, LISTENING_TIMEOUT_MS)
  }

  /** Stop or dismiss: back to idle. */
  stop() {
    this.cancelTimeout()
    this.destroy()
    if (this.state.kind !== 'idle' || this.partial) this.set({ kind: 'idle' }, '')
  }

  /** The page consumed a result / the error was shown long enough. */
  acknowledge() {
    if (this.state.kind === 'result' || this.state.kind === 'error') this.set({ kind: 'idle' }, '')
  }
}
