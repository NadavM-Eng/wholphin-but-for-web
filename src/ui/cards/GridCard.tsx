import clsx from 'clsx'
import { useRef, type CSSProperties } from 'react'
import { dpCss } from '../../theme/scale'
import { clampAspect } from '../lib/gridMath'
import { useFocusedAfterDelay } from '../lib/useFocusedAfterDelay'
import { CardFrame, type CardActions } from './CardFrame'
import { CardImage, type CardOverlayProps, type ImageFit } from './CardImage'
import { CardTitle } from './CardTitle'
import layout from './cardLayout.module.css'

export type GridCardProps = CardActions &
  CardOverlayProps & {
    title?: string | null
    subtitle?: string | null
    /** Item name for the image alt text. */
    name?: string | null
    imageSrc?: string | null
    /** Image aspect ratio (width / height); clamped to >= 2/3. Default 2/3 (poster). */
    aspectRatio?: number
    /** Poster/square grids use `fill` (FillBounds), wide grids `cover` (Crop); default `contain` (Fit). */
    fit?: ImageFit
    showTitle?: boolean
    /** Width in dp; omit to fill the grid cell. */
    width?: number
    label?: string
    className?: string
    style?: CSSProperties
    /** Attributes for the focusable surface (CardGrid passes data-index). */
    surfaceProps?: Record<string, string | number | boolean | undefined>
  }

/**
 * Library grid card (upstream `GridCard`, `ui/cards/GridCard.kt`): transparent Card, image on a
 * surfaceVariant box with the full overlay always on, title + subtitle below, marquee after 500ms focus.
 */
export function GridCard({
  title,
  subtitle,
  name,
  imageSrc,
  aspectRatio = 2 / 3,
  fit = 'contain',
  showTitle = true,
  width,
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
}: GridCardProps) {
  const root = useRef<HTMLDivElement>(null)
  const active = useFocusedAfterDelay(root, 500)
  return (
    <div
      ref={root}
      className={clsx(layout.root, className)}
      style={{ width: width != null ? dpCss(width) : '100%', ...style }}
      data-card-root
    >
      <CardFrame
        label={label ?? title ?? name ?? ''}
        {...{ href, onClick, onContextMenu, onMore, moreLabel, surfaceProps }}
        style={{ aspectRatio: clampAspect(aspectRatio), width: '100%' }}
      >
        <CardImage
          src={imageSrc}
          alt=""
          name={name}
          useFallbackText={false}
          fit={fit}
          showOverlay
          {...overlay}
          style={{ background: 'var(--c-surface-variant)' }}
        />
      </CardFrame>
      {/* GridCard.kt:115 asks for TextOverflow.Ellipsis, but the same Text carries enableMarquee (basicMarquee in
          both branches, Extensions.kt:192-201), which measures it unbounded: no ellipsis is ever drawn and a long
          title is cut at the card edge like the subtitle (refshots 07-library-music-albums). */}
      {showTitle && <CardTitle title={title} subtitle={subtitle} active={active} />}
    </div>
  )
}
