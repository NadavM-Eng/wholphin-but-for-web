import { useLayoutEffect, useRef, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { plainT } from './text'
import { formatDuration } from '../../../lib/format'
import styles from './DpadSeekOverlay.module.css'
import { TrickplayPreview } from './TrickplayPreview'

/**
 * `DpadSeekOverlay` (overlay/DpadSeekOverlay.kt): with "D-pad seek: trickplay" the arrows move a pending position
 * shown here (preview at that point, a static seek bar, timecodes), bottom-center at 95% width.
 */
export function DpadSeekOverlay({ positionMs, durationMs, bufferedMs }: { positionMs: number; durationMs: number; bufferedMs: number }) {
  const t = plainT(useTranslation().t)
  const box = useRef<HTMLDivElement>(null)
  const preview = useRef<HTMLDivElement>(null)
  const pct = durationMs > 0 ? Math.min(1, Math.max(0, positionMs / durationMs)) : 0
  const buf = durationMs > 0 ? Math.min(1, Math.max(0, bufferedMs / durationMs)) : 0
  useLayoutEffect(() => {
    const p = preview.current
    const b = box.current
    if (!p || !b) return
    const x = Math.min(Math.max(0, b.clientWidth * pct - p.offsetWidth / 2), Math.max(0, b.clientWidth - p.offsetWidth))
    p.style.transform = `translateX(${x}px)`
  })
  return (
    <div ref={box} className={styles.root} aria-hidden>
      <div ref={preview} className={styles.preview}>
        <TrickplayPreview positionMs={positionMs} />
      </div>
      <div className={styles.track}>
        <div className={styles.buffered} style={{ '--p': buf } as CSSProperties} />
        <div className={styles.progress} style={{ '--p': pct } as CSSProperties} />
        <div className={styles.knob} style={{ left: `${pct * 100}%` }} />
      </div>
      <div className={styles.timecodes}>
        <span>{formatDuration(t, Math.floor(positionMs / 1000) * 1000)}</span>
        <span>{`-${formatDuration(t, Math.floor(Math.max(0, durationMs - positionMs) / 1000) * 1000)}`}</span>
      </div>
    </div>
  )
}
