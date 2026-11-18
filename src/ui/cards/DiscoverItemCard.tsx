import clsx from 'clsx'
import { useRef, type CSSProperties } from 'react'
import { dpCss } from '../../theme/scale'
import { FaIcon } from '../icons/FaIcon'
import { useFocusedAfterDelay } from '../lib/useFocusedAfterDelay'
import { CardFrame, type CardActions } from './CardFrame'
import { CardImage } from './CardImage'
import { CardTitle } from './CardTitle'
import layout from './cardLayout.module.css'
import styles from './DiscoverItemCard.module.css'

export type DiscoverMediaType = 'movie' | 'tv' | 'person' | 'unknown'
export type DiscoverAvailability =
  | 'pending'
  | 'processing'
  | 'partially_available'
  | 'available'
  | 'blocklisted'
  | 'deleted'
  | 'unknown'

export type DiscoverItemCardProps = CardActions & {
  title?: string | null
  /** Release year. */
  subtitle?: string | null
  posterSrc?: string | null
  mediaType?: DiscoverMediaType | null
  /** Chip text for the type ("Movie", "TV Show", "Person"), localized by the caller. */
  typeLabel?: string | null
  availability?: DiscoverAvailability | null
  /** Accessible text for the availability badge. */
  availabilityLabel?: string
  showOverlay?: boolean
  /** Width in dp (default 172 x 2/3). Omit-able in grids via `width="fill"`. */
  width?: number | 'fill'
  label?: string
  className?: string
  style?: CSSProperties
  surfaceProps?: Record<string, string | number | boolean | undefined>
}

const CHIP_COLOR: Record<DiscoverMediaType, string> = {
  movie: 'var(--fx-discover-blue)',
  tv: 'var(--fx-discover-purple)',
  person: 'var(--fx-discover-green)',
  unknown: 'var(--fx-black)',
}

/**
 * Seerr result card (upstream `DiscoverItemCard`): 2:3 poster, availability badge top-end, type chip
 * top-start (color @.8, pill, 10sp), title + year below.
 */
export function DiscoverItemCard({
  title,
  subtitle,
  posterSrc,
  mediaType,
  typeLabel,
  availability,
  availabilityLabel,
  showOverlay = true,
  width = (172 * 2) / 3,
  label,
  className,
  style,
  surfaceProps,
  ...actions
}: DiscoverItemCardProps) {
  const root = useRef<HTMLDivElement>(null)
  const active = useFocusedAfterDelay(root, 500)
  return (
    <div
      ref={root}
      className={clsx(layout.root, className)}
      style={{ width: width === 'fill' ? '100%' : dpCss(width), ...style }}
      data-card-root
    >
      <CardFrame label={label ?? title ?? ''} {...actions} surfaceProps={surfaceProps} style={{ width: '100%', aspectRatio: 2 / 3 }}>
        <CardImage src={posterSrc} name={title} useFallbackText={false} fit="fill" />
        <AvailabilityBadge availability={availability} label={availabilityLabel} />
        {showOverlay && mediaType && typeLabel && (
          <span
            className={styles.chip}
            style={{ background: `rgb(from ${CHIP_COLOR[mediaType]} r g b / 0.8)` }}
          >
            {typeLabel}
          </span>
        )}
      </CardFrame>
      <CardTitle title={title} subtitle={subtitle} active={active} />
    </div>
  )
}

function AvailabilityBadge({ availability, label }: { availability?: DiscoverAvailability | null; label?: string }) {
  switch (availability) {
    case 'pending':
    case 'processing':
      return (
        <span className={clsx(styles.badge, styles.pending)} role="img" aria-label={label}>
          <FaIcon name="bell" size={10} />
        </span>
      )
    case 'partially_available':
      return (
        <span className={clsx(styles.badge, styles.available)} role="img" aria-label={label}>
          <span className={styles.bar} />
        </span>
      )
    case 'available':
      return (
        <span className={clsx(styles.badge, styles.available)} role="img" aria-label={label}>
          <FaIcon name="check" size={10} />
        </span>
      )
    // Upstream draws nothing for BLOCKLISTED (its indicator is commented out), DELETED or UNKNOWN.
    default:
      return null
  }
}
