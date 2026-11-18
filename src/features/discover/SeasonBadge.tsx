import clsx from 'clsx'
import { useTranslation } from 'react-i18next'
import { badgeFor, type Availability } from '../../api/seerr'
import { FaIcon } from '../../ui'
import { availabilityLabel, plainT } from './seerrText'
import styles from './SeasonBadge.module.css'

/** `PendingIndicator` / `PartiallyAvailableIndicator` / `AvailableIndicator` as an inline 16dp badge. */
export function SeasonBadge({ availability }: { availability: Availability }) {
  const { t } = useTranslation()
  const kind = badgeFor(availability)
  if (!kind) return <span className={styles.slot} />
  return (
    <span
      className={clsx(styles.badge, kind === 'pending' ? styles.pending : styles.available)}
      role="img"
      aria-label={availabilityLabel(availability, plainT(t))}
    >
      {kind === 'pending' && <FaIcon name="bell" size={10} />}
      {kind === 'available' && <FaIcon name="check" size={10} />}
      {kind === 'partially_available' && <span className={styles.bar} />}
    </span>
  )
}
