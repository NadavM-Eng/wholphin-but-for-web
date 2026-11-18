import clsx from 'clsx'
import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { dp } from '../../theme/scale'
import { MARQUEE, planMarquee, type MarqueePlan } from '../lib/marquee'
import styles from './MarqueeText.module.css'

export type MarqueeTextProps = {
  text: string
  /** Scroll when true and the text overflows (cards pass "focused after delay"). */
  active: boolean
  /** Show an ellipsis while not scrolling (upstream GridCard titles use TextOverflow.Ellipsis). */
  ellipsis?: boolean
  className?: string
  style?: CSSProperties
}

const reducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Single-line text that scrolls like Compose `basicMarquee` (40dp/s, 250ms initial delay, 1200ms pause
 * between 3 iterations, gap = 1/3 of the width) while `active` and too long to fit.
 */
export function MarqueeText({ text, active, ellipsis, className, style }: MarqueeTextProps) {
  const outer = useRef<HTMLSpanElement>(null)
  const inner = useRef<HTMLSpanElement>(null)
  const track = useRef<HTMLSpanElement>(null)
  const [plan, setPlan] = useState<(MarqueePlan & { rtl: boolean }) | null>(null)

  useLayoutEffect(() => {
    if (!active || reducedMotion()) {
      setPlan(null)
      return
    }
    const o = outer.current
    if (!o || !inner.current) return
    const p = planMarquee(o.scrollWidth, o.clientWidth, dp(1))
    setPlan(p ? { ...p, rtl: getComputedStyle(o).direction === 'rtl' } : null)
  }, [active, text])

  useLayoutEffect(() => {
    const t = track.current
    if (!plan || !t || typeof t.animate !== 'function') return
    const end = `translateX(${(plan.rtl ? 1 : -1) * plan.distancePx}px)`
    const anim = t.animate(
      [
        { transform: 'translateX(0)', offset: 0 },
        { transform: end, offset: plan.movePercent / 100 },
        { transform: end, offset: 1 },
      ],
      { duration: plan.iterationMs, delay: MARQUEE.initialDelayMs, iterations: MARQUEE.iterations, easing: 'linear' },
    )
    // After the last iteration Compose leaves the text at its start position.
    anim.onfinish = () => anim.cancel()
    return () => anim.cancel()
  }, [plan])

  return (
    // dir="auto": Compose resolves text direction from the content (TextDirection.Content), so a Hebrew title in an
    // LTR page aligns, ellipsizes and scrolls as RTL text.
    <span ref={outer} dir="auto" className={clsx(styles.outer, ellipsis && !plan && styles.ellipsis, className)} style={style}>
      {plan ? (
        <span ref={track} className={styles.track} style={{ gap: `${plan.gapPx}px` }} aria-label={text}>
          <span aria-hidden>{text}</span>
          <span aria-hidden>{text}</span>
        </span>
      ) : (
        <span ref={inner} className={styles.inner}>
          {text}
        </span>
      )}
    </span>
  )
}
