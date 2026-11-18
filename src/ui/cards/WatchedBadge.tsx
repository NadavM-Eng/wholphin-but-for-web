import clsx from 'clsx'
import { dpCss } from '../../theme/scale'
import { MaterialIcon } from '../icons/MaterialIcon'
import styles from './WatchedBadge.module.css'

export type WatchedBadgeProps = {
  /** Diameter in dp (cards use 24). */
  size?: number
  label?: string
  className?: string
}

/** Upstream `WatchedIcon` (`ui/cards/WatchedIcon.kt`): white check in an accent circle with a .5dp black ring. */
export function WatchedBadge({ size = 24, label, className }: WatchedBadgeProps) {
  return (
    <span
      className={clsx(styles.badge, className)}
      style={{ width: dpCss(size), height: dpCss(size) }}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <MaterialIcon name="check" className={styles.icon} />
    </span>
  )
}
