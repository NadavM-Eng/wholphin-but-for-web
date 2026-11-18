import clsx from 'clsx'
import { useRef, type CSSProperties } from 'react'
import { dpCss } from '../../theme/scale'
import { MaterialIcon } from '../icons/MaterialIcon'
import { useFocusedAfterDelay } from '../lib/useFocusedAfterDelay'
import { CardFrame, type CardActions } from './CardFrame'
import { CardTitle } from './CardTitle'
import layout from './cardLayout.module.css'
import styles from './ViewMoreCard.module.css'

export type ViewMoreCardProps = CardActions & {
  /** "View more" (localized by the caller); also the accessible name. */
  label: string
  /** Card height in dp (default 172). */
  height?: number
  /** Width / height (default 2/3). */
  aspectRatio?: number
  showTitle?: boolean
  className?: string
  style?: CSSProperties
  surfaceProps?: Record<string, string | number | boolean | undefined>
}

/**
 * End-of-row "View more" card (upstream `ViewMoreCard`): surface at 1dp elevation, ArrowForward at
 * 66% in onSurface, label bodyMedium SemiBold below when titles are shown.
 */
export function ViewMoreCard({
  label,
  height = 172,
  aspectRatio = 2 / 3,
  showTitle = true,
  className,
  style,
  surfaceProps,
  ...actions
}: ViewMoreCardProps) {
  const root = useRef<HTMLDivElement>(null)
  const active = useFocusedAfterDelay(root, 500)
  const w = height * aspectRatio
  return (
    <div ref={root} className={clsx(layout.root, className)} style={{ width: dpCss(w), ...style }} data-card-root>
      <CardFrame
        label={label}
        {...actions}
        surfaceProps={surfaceProps}
        container="var(--c-surface-1)"
        style={{ width: dpCss(w), height: dpCss(height) }}
      >
        <span className={styles.center}>
          <MaterialIcon name="arrow_forward" className={styles.icon} />
        </span>
      </CardFrame>
      {showTitle && <CardTitle title={label} reserveSubtitle={false} active={active} />}
    </div>
  )
}
