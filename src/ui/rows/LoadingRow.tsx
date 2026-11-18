import clsx from 'clsx'
import styles from './LoadingRow.module.css'

export type LoadingRowProps = {
  title: string
  /** "Loading…", "No results", or the error text, localized by the caller. */
  message: string
  error?: boolean
  /** Focusable placeholder (upstream `FocusableItemRow`): accent@.25 background on focus. */
  focusable?: boolean
  className?: string
}

/**
 * Row placeholder while a row loads, fails or is empty (upstream `LoadingRowPlaceholder` /
 * `FocusableItemRow`): titleLarge title, titleMedium message (error color on failure), 8dp gap,
 * 32dp bottom padding.
 */
export function LoadingRow({ title, message, error, focusable, className }: LoadingRowProps) {
  return (
    <div
      className={clsx(styles.row, focusable && styles.focusable, className)}
      tabIndex={focusable ? 0 : undefined}
      data-focusable={focusable || undefined}
      role={error ? 'alert' : 'status'}
    >
      <p className={styles.title}>{title}</p>
      <p className={clsx(styles.message, error && styles.error)}>{message}</p>
    </div>
  )
}
