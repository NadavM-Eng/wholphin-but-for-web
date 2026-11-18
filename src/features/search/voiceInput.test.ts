import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LISTENING_TIMEOUT_MS, mapRecognitionError, VoiceInput, type RecognitionLike } from './voiceInput'

class FakeRecognition implements RecognitionLike {
  static last: FakeRecognition | null = null
  lang = ''
  continuous = true
  interimResults = false
  maxAlternatives = 0
  onstart: (() => void) | null = null
  onaudiostart: (() => void) | null = null
  onspeechend: (() => void) | null = null
  onresult: RecognitionLike['onresult'] = null
  onerror: RecognitionLike['onerror'] = null
  onend: (() => void) | null = null
  constructor() {
    FakeRecognition.last = this
  }
  start() {}
  stop() {}
  abort() {}
  emitResult(text: string, isFinal: boolean) {
    const alt = Object.assign([{ transcript: text }], { isFinal })
    this.onresult?.({ resultIndex: 0, results: [alt] })
  }
}

const rec = () => FakeRecognition.last!

describe('VoiceInput', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    FakeRecognition.last = null
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  const make = (online = true) => new VoiceInput(FakeRecognition, () => 'he-IL', () => online)

  it('is unavailable without a recognizer', () => {
    expect(new VoiceInput(null, () => 'en').available).toBe(false)
  })

  it('goes starting -> listening -> result with the final transcript', () => {
    const v = make()
    v.start()
    expect(v.state.kind).toBe('starting')
    expect(rec().lang).toBe('he-IL')
    expect(rec().interimResults).toBe(true)
    rec().onstart?.()
    expect(v.state.kind).toBe('listening')
    rec().emitResult('big buck', false)
    expect(v.partial).toBe('big buck')
    rec().emitResult('big buck bunny', true)
    expect(v.state).toEqual({ kind: 'result', text: 'big buck bunny' })
    v.acknowledge()
    expect(v.state.kind).toBe('idle')
  })

  it('ignores start while starting or listening', () => {
    const v = make()
    v.start()
    const first = rec()
    v.start()
    expect(rec()).toBe(first)
  })

  it('times out after 8 s: a partial becomes the result, else a retryable error', () => {
    const v = make()
    v.start()
    rec().onaudiostart?.()
    rec().emitResult('hello', false)
    vi.advanceTimersByTime(LISTENING_TIMEOUT_MS)
    expect(v.state).toEqual({ kind: 'result', text: 'hello' })

    const w = make()
    w.start()
    rec().onstart?.()
    vi.advanceTimersByTime(LISTENING_TIMEOUT_MS)
    expect(w.state).toEqual({ kind: 'error', messageKey: 'voice_error_timeout', retryable: true })
  })

  it('maps errors and ignores callbacks of a stopped recognizer', () => {
    const v = make()
    v.start()
    const r = rec()
    r.onerror?.({ error: 'not-allowed' })
    expect(v.state).toEqual({ kind: 'error', messageKey: 'voice_error_permissions', retryable: false })
    v.stop()
    expect(v.state.kind).toBe('idle')
    r.onresult?.({ resultIndex: 0, results: [] })
    expect(v.state.kind).toBe('idle')
  })

  it('reports a network error when offline', () => {
    const v = make(false)
    v.start()
    expect(v.state).toEqual({ kind: 'error', messageKey: 'voice_error_network', retryable: true })
  })

  it('treats an end without a result as no match', () => {
    const v = make()
    v.start()
    rec().onstart?.()
    rec().onend?.()
    expect(v.state).toEqual({ kind: 'error', messageKey: 'voice_error_no_match', retryable: true })
  })

  it('maps Web Speech error codes', () => {
    expect(mapRecognitionError('no-speech')).toEqual({ messageKey: 'voice_error_speech_timeout', retryable: true })
    expect(mapRecognitionError('network').retryable).toBe(true)
    expect(mapRecognitionError('audio-capture').messageKey).toBe('voice_error_audio')
    expect(mapRecognitionError('weird').messageKey).toBe('voice_error_unknown')
  })
})
