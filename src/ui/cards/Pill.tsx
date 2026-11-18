import clsx from 'clsx'
import type { ReactNode } from 'react'
import styles from './Pill.module.css'

export type PillProps = {
  children: ReactNode
  /** `medium` = bodyMedium (grid/poster overlay counts), `small` = bodySmall (banner corner text). */
  size?: 'medium' | 'small'
  label?: string
  className?: string
}

/** Corner count pill: TransparentBlack50, `RoundedCornerShape(25)`, 4dp padding, onSurface (`ItemCardImage.kt:213-231`). */
export function Pill({ children, size = 'medium', label, className }: PillProps) {
  return (
    <span className={clsx(styles.pill, styles[size], className)} aria-label={label}>
      {children}
    </span>
  )
}
