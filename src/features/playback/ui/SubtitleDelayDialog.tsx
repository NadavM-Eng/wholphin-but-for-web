import { useTranslation } from 'react-i18next'
import { Button } from '../../../ui'
import { getPlaybackEngine, usePlaybackStore } from '../engine'
import { PlayerSheet } from './PlayerSheet'
import styles from './SubtitleDelayDialog.module.css'
import { kotlinDuration, plainT } from './text'

const INCREMENTS = [50, 250, 1000]

/**
 * `SubtitleDelay` in its plain Dialog (W/ui/playback/SubtitleDelay.kt, PlaybackDialog.kt:260-283): centered on
 * TransparentBlack50 with 16dp corners; "Subtitle delay: 1.5s" over -1s -250ms -50ms Reset +50ms +250ms +1s
 * (64dp wide, 33% rounded), initial focus on Reset. The engine saves the delay 1.5 s after the last change.
 */
export function SubtitleDelayDialog({ onClose }: { onClose: () => void }) {
  const t = plainT(useTranslation().t)
  const engine = getPlaybackEngine()
  const delay = usePlaybackStore((s) => s.subtitleDelayMs)
  return (
    <PlayerSheet label={t('subtitle_delay')} placement="center" surface="scrim" onClose={onClose} initialFocus="[data-reset]">
      <div className={styles.root}>
        {/* the values are left-to-right tokens: isolated, or a right-to-left line shows "-1.5s" as "1.5s-" */}
        <div className={styles.label}>
          {`${t('subtitle_delay')}: `}
          <span dir="ltr">{kotlinDuration(delay)}</span>
        </div>
        <div className={styles.row} data-focus-group>
          {[...INCREMENTS].reverse().map((ms) => (
            <Button key={-ms} className={styles.button} onClick={() => engine.adjustSubtitleDelay(-ms)}>
              <span dir="ltr">{`-${kotlinDuration(ms)}`}</span>
            </Button>
          ))}
          <span data-reset className={styles.resetSlot}>
            <Button className={styles.button} onClick={() => engine.adjustSubtitleDelay(-delay)}>
              {t('reset')}
            </Button>
          </span>
          {INCREMENTS.map((ms) => (
            <Button key={ms} className={styles.button} onClick={() => engine.adjustSubtitleDelay(ms)}>
              <span dir="ltr">{`+${kotlinDuration(ms)}`}</span>
            </Button>
          ))}
        </div>
      </div>
    </PlayerSheet>
  )
}
