import type { MediaSegmentType } from '@jellyfin/sdk/lib/generated-client/models'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { plainT, skipSegmentKey } from './text'
import { TextButton } from '../../../ui'
import { SKIP_BUTTON_TIMEOUT_MS } from '../engine'
import styles from './SkipSegmentButton.module.css'

/**
 * The floating "Skip Intro" button (overlay/SkipSegmentButton.kt, PlaybackPage.kt:606-628): bottom-end, takes
 * focus, a halo pulsing onSurface <-> transparent every 1.5 s, dismisses itself after 10 s (the timer restarts
 * every time the button reappears).
 */
export function SkipSegmentButton({ type, onSkip, onDismiss }: { type: MediaSegmentType | undefined; onSkip: () => void; onDismiss: () => void }) {
  const t = plainT(useTranslation().t)
  const ref = useRef<HTMLElement>(null)
  const dismiss = useRef(onDismiss)
  useEffect(() => {
    dismiss.current = onDismiss
  })
  useEffect(() => {
    ref.current?.focus({ preventScroll: true })
    const id = setTimeout(() => dismiss.current(), SKIP_BUTTON_TIMEOUT_MS)
    return () => clearTimeout(id)
  }, [])
  return (
    <div className={styles.root} data-skip-segment>
      <span className={styles.halo} aria-hidden />
      <TextButton ref={ref} onClick={onSkip} title={`${t(skipSegmentKey(type))} (S)`}>
        {t(skipSegmentKey(type))}
      </TextButton>
    </div>
  )
}
