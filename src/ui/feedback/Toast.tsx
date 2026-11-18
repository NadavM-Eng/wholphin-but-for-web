import clsx from 'clsx'
import type { ReactNode } from 'react'
import styles from './Toast.module.css'

export type ToastProps = {
  message: string
  /** Optional trailing action (e.g. a `TextButton`). */
  action?: ReactNode
  tone?: 'default' | 'error'
  className?: string
}

/**
 * Toast visuals. Upstream shows Android system toasts (`Toast.makeText`), which have no theme values;
 * this uses the Material3 snackbar look (inverseSurface, 4dp radius, bodyMedium) so it fits every theme.
 * Place inside a `ToastViewport` for positioning; timing/queueing belongs to the caller.
 */
export function Toast({ message, action, tone = 'default', className }: ToastProps) {
  return (
    <div className={clsx(styles.toast, tone === 'error' && styles.error, className)} role="status" aria-live="polite">
      <span className={styles.message}>{message}</span>
      {action}
    </div>
  )
}
