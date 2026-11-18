import clsx from 'clsx'
import type { ReactNode } from 'react'
import styles from './PlayButtons.module.css'

export type PlayButtonsProps = {
  children: ReactNode
  label?: string
  className?: string
}

/**
 * The row holding the detail-page `ExpandableButton`s (upstream `ExpandablePlayButtons`, a LazyRow with
 * 16dp spacing and 8dp content padding). Scrolls horizontally when the buttons do not fit.
 */
export function PlayButtons({ children, label, className }: PlayButtonsProps) {
  return (
    // PlayButtons.kt focusRestorer(firstFocus): entering the row focuses the button used last, else the first
    <div role="toolbar" aria-label={label} data-focus-enter="restore" className={clsx(styles.row, className)}>
      {children}
    </div>
  )
}
