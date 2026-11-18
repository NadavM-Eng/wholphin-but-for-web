import clsx from 'clsx'
import { useRef, useState } from 'react'
import { MaterialIcon } from '../icons/MaterialIcon'
import { nextStarRating, starForRating, type StarPrecision } from '../lib/starRating'
import styles from './StarRating.module.css'

export type StarRatingProps = {
  /** Current rating 0-100 (20 per star). */
  rating100: number
  onChange?: (rating100: number) => void
  precision?: StarPrecision
  /** Read-only display when false. */
  enabled?: boolean
  /** Accessible name of the group, e.g. "Your rating". */
  label: string
  /** Accessible name per star, e.g. (n) => `${n} stars`. */
  starLabel?: (n: number) => string
  className?: string
}

/**
 * Upstream `StarRating` (`Rating.kt:159-304`): 5 stars in a 16dp-radius TransparentBlack75 pill, 4dp
 * padding; the part above the rating is painted over with the pill color (stars show at 25%); focusing a
 * star previews that rating and gives it a 16dp `border` highlight. Left/right wrap around.
 */
export function StarRating({ rating100, onChange, precision = 'full', enabled = true, label, starLabel, className }: StarRatingProps) {
  const [preview, setPreview] = useState<number | null>(null)
  const shown = enabled && preview != null ? preview : rating100
  const pct = Math.min(100, Math.max(0, shown))
  const group = useRef<HTMLDivElement>(null)
  const entry = starForRating(rating100)

  const stars = [1, 2, 3, 4, 5]
  return (
    <div
      ref={group}
      role="radiogroup"
      aria-label={label}
      className={clsx(styles.pill, className)}
      onKeyDown={(e) => {
        if (!enabled || e.defaultPrevented) return
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
        const items = Array.from(group.current?.querySelectorAll<HTMLElement>('[data-star]') ?? [])
        const idx = items.indexOf(document.activeElement as HTMLElement)
        if (idx < 0) return
        const rtl = getComputedStyle(e.currentTarget).direction === 'rtl'
        const forward = (e.key === 'ArrowRight') !== rtl
        // Upstream wraps from star 1 to 5 and back (focusProperties left/right).
        const next = items[(idx + (forward ? 1 : -1) + items.length) % items.length]
        e.preventDefault()
        e.stopPropagation()
        next.focus()
      }}
    >
      <div className={styles.row}>
        {stars.map((i) => (
          <button
            key={i}
            type="button"
            role="radio"
            aria-checked={shown >= i * 20}
            aria-label={starLabel?.(i) ?? String(i)}
            data-star
            data-focusable={enabled || undefined}
            tabIndex={enabled ? (i === entry ? 0 : -1) : -1}
            disabled={!enabled}
            className={styles.star}
            onFocus={() => setPreview(i * 20)}
            onBlur={() => setPreview(null)}
            onPointerEnter={(e) => e.pointerType === 'mouse' && setPreview(i * 20)}
            onPointerLeave={() => setPreview(null)}
            onClick={() => {
              const next = nextStarRating(i, rating100, precision)
              setPreview(next)
              onChange?.(next)
            }}
          >
            <span className={styles.empty}>
              <MaterialIcon name="star" className={styles.icon} />
            </span>
            <span className={styles.full} style={{ clipPath: clipFor(i, pct) }}>
              <MaterialIcon name="star" className={styles.icon} />
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

/** Visible share of star `i` for a 0-100 rating, as a logical-direction clip. */
function clipFor(i: number, pct: number): string {
  const share = Math.min(1, Math.max(0, (pct - (i - 1) * 20) / 20))
  const hidden = (1 - share) * 100
  return `inset(0 ${hidden}% 0 0)`
}
