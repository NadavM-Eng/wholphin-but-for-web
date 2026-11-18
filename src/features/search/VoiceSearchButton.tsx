import { useEffect, useRef } from 'react'
import type { Translate } from '../../lib/format'
import { FaIcon, IconButton } from '../../ui'
import type { VoiceInput, VoiceState } from './voiceInput'
import { VoiceSearchOverlay } from './VoiceSearchOverlay'

const ERROR_AUTO_DISMISS_DELAY_MS = 3000

type Props = {
  voice: VoiceInput
  state: VoiceState
  partial: string
  t: Translate
  onSpeechResult: (text: string) => void
  className?: string
}

/**
 * `VoiceSearchButton` (W/ui/components/VoiceSearchButton.kt): 40dp button with the Font Awesome
 * microphone; while starting/listening a click stops. The overlay shows while starting, listening,
 * processing or on an error; a non-retryable error closes itself after 3 s. Rendered only when the
 * browser has speech recognition.
 */
export function VoiceSearchButton({ voice, state, partial, t, onSpeechResult, className }: Props) {
  const onResult = useRef(onSpeechResult)
  useEffect(() => {
    onResult.current = onSpeechResult
  })

  useEffect(() => {
    if (state.kind === 'result') {
      onResult.current(state.text)
      const id = setTimeout(() => voice.acknowledge(), 50)
      return () => clearTimeout(id)
    }
    if (state.kind === 'error' && !state.retryable) {
      const id = setTimeout(() => voice.acknowledge(), ERROR_AUTO_DISMISS_DELAY_MS)
      return () => clearTimeout(id)
    }
    return undefined
  }, [state, voice])

  if (!voice.available) return null
  const showOverlay = state.kind === 'starting' || state.kind === 'listening' || state.kind === 'processing' || state.kind === 'error'
  return (
    <>
      <IconButton
        className={className}
        label={t('voice_search')}
        icon={<FaIcon name="microphone" size={20} />}
        onClick={() => {
          if (state.kind === 'starting' || state.kind === 'listening') voice.stop()
          else voice.start()
        }}
      />
      <VoiceSearchOverlay
        open={showOverlay}
        state={state}
        partial={partial}
        t={t}
        onRetry={() => voice.start()}
        onDismiss={() => voice.stop()}
      />
    </>
  )
}
