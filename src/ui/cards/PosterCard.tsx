import clsx from 'clsx'
import { useRef, type CSSProperties } from 'react'
import { dpCss } from '../../theme/scale'
import { clampAspect } from '../lib/gridMath'
import { useFocusedAfterDelay } from '../lib/useFocusedAfterDelay'
import { CardFrame, type CardActions } from './CardFrame'
import { CardImage, type CardOverlayProps, type ImageFit } from './CardImage'
import { CardTitle } from './CardTitle'
import layout from './cardLayout.module.css'

export type PosterCardProps = CardActions &
  CardOverlayProps & {
    title?: string | null
    subtitle?: string | null
    name?: string | null
    imageSrc?: string | null
    /** Image height in dp (`Cards.height2x3` = 172 typical). */
    height?: number
    /** Item's own aspect ratio; clamped to >= 2/3. Default 2/3. */
    aspectRatio?: number
    fit?: ImageFit
    /** Detail-page rows pass true; default false like upstream. */
    showOverlay?: boolean
    showTitle?: boolean
    label?: string
    className?: string
    style?: CSSProperties
    surfaceProps?: Record<string, string | number | boolean | undefined>
  }

/**
 * Generic poster card for rows (upstream `SeasonCard`, `ui/cards/SeasonCard.kt`): width =
 * height x aspect, transparent container, overlay only when asked, sliding title + subtitle.
 */
export function PosterCard({
  title,
  subtitle,
  name,
  imageSrc,
  height = 172,
  aspectRatio = 2 / 3,
  fit = 'contain',
  showOverlay = false,
  showTitle = true,
  label,
  className,
  style,
  surfaceProps,
  href,
  onClick,
  onContextMenu,
  onMore,
  moreLabel,
  ...overlay
}: PosterCardProps) {
  const root = useRef<HTMLDivElement>(null)
  const active = useFocusedAfterDelay(root, 500)
  const ratio = clampAspect(aspectRatio)
  return (
    <div ref={root} className={clsx(layout.root, className)} style={{ width: dpCss(height * ratio), ...style }} data-card-root>
      <CardFrame
        label={label ?? title ?? name ?? ''}
        {...{ href, onClick, onContextMenu, onMore, moreLabel, surfaceProps }}
        style={{ width: dpCss(height * ratio), height: dpCss(height) }}
      >
        <CardImage src={imageSrc} name={name} useFallbackText={false} fit={fit} showOverlay={showOverlay} {...overlay} />
      </CardFrame>
      {showTitle && <CardTitle title={title} subtitle={subtitle} active={active} />}
    </div>
  )
}
