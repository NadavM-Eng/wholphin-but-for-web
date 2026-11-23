import { useLayoutEffect, useRef, type CSSProperties } from 'react'
import { formatClock } from '../../../lib/format'
import styles from './DpadSeekOverlay.module.css'
import { TrickplayPreview } from './TrickplayPreview'

/**
 * `DpadSeekOverlay` (overlay/DpadSeekOverlay.kt): with "D-pad seek: trickplay" the arrows move a pending position
 * shown here (preview at that point, a static seek bar, timecodes), bottom-center at 95% width. The timecodes are
 * clocks ("52:53", "-1:07:20"), like the control strip's (owner request; upstream writes them in words).
 */
export function DpadSeekOverlay({ positionMs, durationMs, bufferedMs }: { positionMs: number; durationMs: number; bufferedMs: number }) {
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
        <span>{formatClock(positionMs)}</span>
        <span>{`-${formatClock(Math.max(0, durationMs - positionMs))}`}</span>
      </div>
    </div>
  )
}
