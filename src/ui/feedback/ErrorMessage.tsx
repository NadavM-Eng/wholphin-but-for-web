import clsx from 'clsx'
import type { ReactNode } from 'react'
import styles from './ErrorMessage.module.css'

export type ErrorMessageProps = {
  /** Heading ("An error occurred", upstream `compose_error_message_title`). */
  title: string
  /** Caller-supplied message (titleLarge). */
  message?: string | null
  /** Exception message (titleMedium). */
  detail?: string | null
  /** Cause chain, already prefixed by the caller ("Caused by: …"), titleSmall. */
  causes?: string[]
  /** Usually a `TextButton` ("Send app logs"). */
  action?: ReactNode
  className?: string
}

/** Upstream `ErrorMessage` (`ui/components/ErrorMessage.kt`): column, 16dp gap and padding, all text in `error`. */
export function ErrorMessage({ title, message, detail, causes, action, className }: ErrorMessageProps) {
  return (
    <div className={clsx(styles.root, className)} role="alert">
      <p className={styles.title}>{title}</p>
      {action && <div>{action}</div>}
      {message && <p className={styles.message}>{message}</p>}
      {detail && <p className={styles.detail}>{detail}</p>}
      {causes?.map((c, i) => (
        <p key={i} className={styles.cause}>
          {c}
        </p>
      ))}
    </div>
  )
}
