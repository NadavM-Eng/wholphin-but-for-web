import type { CSSProperties } from 'react'
import { CircularProgress } from '../feedback/CircularProgress'
import { MaterialIcon } from '../icons/MaterialIcon'
import type { CardActions } from './CardFrame'
import styles from './ServerCircleCard.module.css'
import { UserCircleCard } from './UserCircleCard'

export type ServerStatus = 'ok' | 'pending' | 'error' | 'unsupported' | 'unsupported_future'

export type ServerCircleCardProps = CardActions & {
  /** Server id; drives the circle color. */
  id?: string | null
  /** Server name, or its URL when unnamed. */
  name: string
  status?: ServerStatus
  /** Text for the warning icon (connection error message). */
  statusLabel?: string
  isCurrent?: boolean
  /** "Add server" variant: + icon on surfaceVariant (upstream `AddServerCard`). */
  add?: boolean
  className?: string
  style?: CSSProperties
  surfaceProps?: Record<string, string | number | boolean | undefined>
}

/**
 * Login server circle (upstream `ServerIconCard`, `ui/setup/ServerList.kt:100-245`): same circle as the
 * user card; shows the first letter of the name (URL scheme stripped), a warning icon (errorContainer, or
 * GoldenYellow when the version will be unsupported) above a smaller letter, or a spinner while pending.
 */
export function ServerCircleCard({ id, name, status = 'ok', statusLabel, isCurrent, add, ...rest }: ServerCircleCardProps) {
  const letter = name.replace(/^https?:\/\//, '').charAt(0).toUpperCase() || '?'
  let content
  if (add) {
    content = <MaterialIcon name="add" className={styles.add} />
  } else if (status === 'pending') {
    content = <CircularProgress size={129 * 0.4} />
  } else if (status !== 'ok') {
    content = (
      <>
        <MaterialIcon
          name="warning"
          size={129 * 0.3}
          label={statusLabel}
          color={status === 'unsupported_future' ? 'var(--fx-golden-yellow)' : 'var(--c-error-container)'}
        />
        <span className={styles.smallLetter}>{letter}</span>
      </>
    )
  }
  return (
    <UserCircleCard
      {...rest}
      id={id}
      name={name}
      isCurrent={isCurrent}
      color={add ? 'var(--c-surface-variant)' : undefined}
      tintAlphas={add ? [0.4, 0.6] : undefined}
      content={content}
    />
  )
}
