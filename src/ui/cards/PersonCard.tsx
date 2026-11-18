import clsx from 'clsx'
import { useRef, type CSSProperties } from 'react'
import { dpCss } from '../../theme/scale'
import { FaIcon } from '../icons/FaIcon'
import { useFocusedAfterDelay } from '../lib/useFocusedAfterDelay'
import { CardFrame, type CardActions } from './CardFrame'
import { CardImage } from './CardImage'
import { CardTitle } from './CardTitle'
import layout from './cardLayout.module.css'
import styles from './PersonCard.module.css'

export type PersonCardProps = CardActions & {
  name?: string | null
  /** Role / character, shown under the name. */
  role?: string | null
  imageSrc?: string | null
  /** Width in dp (`personRowCardWidth` = 108). */
  width?: number
  label?: string
  className?: string
  style?: CSSProperties
  surfaceProps?: Record<string, string | number | boolean | undefined>
}

/**
 * Cast/crew card (upstream `PersonCard`, `ui/cards/PersonCard.kt`): square, circle-clipped, Crop,
 * 3dp `border` ring, `fa_user` 64sp fallback, marquee after 1000ms of focus.
 */
export function PersonCard({
  name,
  role,
  imageSrc,
  width = 108,
  label,
  className,
  style,
  surfaceProps,
  href,
  onClick,
  onContextMenu,
  onMore,
  moreLabel,
}: PersonCardProps) {
  const root = useRef<HTMLDivElement>(null)
  const active = useFocusedAfterDelay(root, 1000)
  return (
    <div ref={root} className={clsx(layout.root, className)} style={{ width: dpCss(width), ...style }} data-card-root>
      <CardFrame
        label={label ?? name ?? ''}
        shape="circle"
        {...{ href, onClick, onContextMenu, onMore, moreLabel, surfaceProps }}
        style={{ width: '100%', aspectRatio: 1, minHeight: 0 }}
      >
        <CardImage
          src={imageSrc}
          name={name}
          fit="cover"
          fallback={
            <span className={styles.fallback}>
              <FaIcon name="user" size={64} />
            </span>
          }
        />
      </CardFrame>
      <CardTitle title={name} subtitle={role} reserveSubtitle={false} active={active} />
    </div>
  )
}
