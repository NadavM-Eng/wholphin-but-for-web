import clsx from 'clsx'
import { useEffect, useState } from 'react'
import type { Translate } from '../../lib/format'
import { Button, Dialog, FaIcon } from '../../ui'
import styles from './VoiceSearchOverlay.module.css'
import type { VoiceState } from './voiceInput'

type Props = {
  open: boolean
  state: VoiceState
  partial: string
  t: Translate
  onRetry: () => void
  onDismiss: () => void
}

/** Dots animation: 0..3 dots over 1200 ms (DOTS_ANIM_MS, animateFloat 0f..4f). */
function useDots(active: boolean): number {
  const [n, setN] = useState(0)
  useEffect(() => {
    if (!active) return
    const id = setInterval(() => setN((v) => (v + 1) % 4), 300)
    return () => clearInterval(id)
  }, [active])
  return active ? n : 0
}

/**
 * `VoiceSearchOverlay` (VoiceSearchButton.kt:237-414): 85% wide dialog, a 160dp primary mic bubble that
 * pulses (1.0-1.05, 800 ms) with three ripple rings while listening, the status text (error >
 * "Processing..." > "Starting..." > live transcript > "Speak to search..."), a Retry pill for retryable
 * errors and the "Press back to cancel" hint. Escape / a click outside stops listening.
 */
export function VoiceSearchOverlay({ open, state, partial, t, onRetry, onDismiss }: Props) {
  const error = state.kind === 'error' ? state : null
  const starting = state.kind === 'starting'
  const processing = state.kind === 'processing'
  const listening = !starting && !processing && !error
  const dots = '.'.repeat(useDots(open && !error && (starting || processing || !partial.trim())))
  let status: string
  let a11y: string
  if (error) status = a11y = t(error.messageKey)
  else if (processing) [status, a11y] = [t('processing') + dots, t('processing')]
  else if (starting) [status, a11y] = [t('voice_starting') + dots, t('voice_starting')]
  else if (partial.trim()) status = a11y = partial
  else [status, a11y] = [t('voice_search_prompt') + dots, t('voice_search_prompt')]

  return (
    <Dialog open={open} onClose={onDismiss} variant="basic" elevation={3} label={t('voice_search')} className={styles.panel}>
      <div className={styles.row}>
        <div className={styles.bubbleBox}>
          {listening && (
            <div className={styles.rings} aria-hidden>
              <span />
              <span />
              <span />
            </div>
          )}
          <div className={clsx(styles.bubble, error && styles.bubbleError)}>
            <FaIcon name="microphone" size={56} label={t('voice_search')} />
          </div>
        </div>
        <div className={styles.column} tabIndex={-1}>
          <p className={clsx(styles.status, error && styles.statusError)} aria-live="polite" aria-label={a11y}>
            {status}
          </p>
          {error?.retryable && (
            <Button className={styles.retry} onClick={onRetry}>
              {t('retry')}
            </Button>
          )}
        </div>
      </div>
      <p className={styles.hint}>{t('press_back_to_cancel')}</p>
    </Dialog>
  )
}
