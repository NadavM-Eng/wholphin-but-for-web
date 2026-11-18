import { useEffect, useRef } from 'react'
import { DrawableIcon } from '../../../ui'
import styles from './SkipIndicator.module.css'

/**
 * `SkipIndicator` (overlay/SkipIndicator.kt): a 55dp circular arrow that turns 270 degrees in 800 ms (mirrored for
 * backward) around the accumulated seconds. Every change restarts the turn; finishing it calls `onFinish`, which
 * resets the accumulated total (spec 08 PB-8).
 */
export function SkipIndicator({ durationMs, seq, onFinish }: { durationMs: number; seq: number; onFinish: () => void }) {
  const icon = useRef<HTMLSpanElement>(null)
  const rotation = useRef(0)
  const finish = useRef(onFinish)
  useEffect(() => {
    finish.current = onFinish
  })
  const backward = durationMs < 0

  useEffect(() => {
    const el = icon.current
    if (!el) return
    const from = rotation.current
    const to = from + (backward ? -270 : 270)
    const anim = el.animate([{ transform: `rotate(${from}deg)` }, { transform: `rotate(${to}deg)` }], { duration: 800, fill: 'forwards' })
    let done = false
    anim.onfinish = () => {
      done = true
      rotation.current = to
      finish.current()
    }
    return () => {
      if (!done) {
        // keep the angle reached so the next press continues from there
        const tr = getComputedStyle(el).transform
        const m = /matrix\(([^,]+),\s*([^,]+)/.exec(tr)
        if (m) rotation.current = (Math.atan2(Number(m[2]), Number(m[1])) * 180) / Math.PI
      }
      anim.cancel()
    }
  }, [seq, backward])

  return (
    <div className={styles.root} aria-hidden>
      <span className={styles.flip} style={backward ? { transform: 'scaleX(-1)' } : undefined}>
        <span ref={icon} className={styles.icon}>
          <DrawableIcon name="circular_arrow_right" size={55} />
        </span>
      </span>
      <span className={styles.text}>{Math.abs(Math.trunc(durationMs / 1000))}</span>
    </div>
  )
}
