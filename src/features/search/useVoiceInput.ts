import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { speechRecognitionCtor, VoiceInput, type VoiceState } from './voiceInput'

/** One recognizer per page (upstream: the ViewModel's VoiceInputManager), stopped when the page goes away. */
export function useVoiceInput(lang: string): { voice: VoiceInput; state: VoiceState; partial: string } {
  const voice = useMemo(() => new VoiceInput(speechRecognitionCtor(), () => lang), [lang])
  const state = useSyncExternalStore(voice.subscribe, () => voice.state, () => voice.state)
  const partial = useSyncExternalStore(voice.subscribe, () => voice.partial, () => voice.partial)
  // LifecycleResumeEffect onPauseOrDispose -> stopListening
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') voice.stop()
    }
    document.addEventListener('visibilitychange', onHide)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      voice.stop()
    }
  }, [voice])
  return { voice, state, partial }
}
