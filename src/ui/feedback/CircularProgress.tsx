import clsx from 'clsx'
import type { CSSProperties } from 'react'
import { dpCss } from '../../theme/scale'
import styles from './CircularProgress.module.css'

export type CircularProgressProps = {
  /** Diameter in dp (Material3 default 40; pages use 48). */
  size?: number
  /** Accessible label, e.g. "Loading". */
  label?: string
  className?: string
  style?: CSSProperties
}

/**
 * Upstream `CircularProgress`: Material3 indeterminate `CircularProgressIndicator` (4dp stroke) in the
 * theme accent (`colorScheme.border`).
 */
export function CircularProgress({ size = 40, label, className, style }: CircularProgressProps) {
  return (
    <span
      className={clsx(styles.root, className)}
      style={{ width: dpCss(size), height: dpCss(size), ...style }}
      role="progressbar"
      aria-label={label}
      aria-busy
    >
      <svg viewBox="0 0 40 40" className={styles.svg} aria-hidden>
        {/* r = (40 - 4) / 2 so the 4dp stroke sits inside the box. */}
        <circle cx="20" cy="20" r="18" className={styles.arc} />
      </svg>
    </span>
  )
}
