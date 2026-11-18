import type { CSSProperties } from 'react'
import { dpCss } from '../../theme/scale'
import { FaIcon } from '../icons/FaIcon'
import { CardFrame, type CardActions } from './CardFrame'
import { CardImage, type ImageFit } from './CardImage'
import styles from './BannerCard.module.css'
import { Pill } from './Pill'
import { ProgressBar } from './ProgressBar'
import { WatchedBadge } from './WatchedBadge'

export type BannerCardProps = CardActions & {
  /** Shown centered (titleMedium) when there is no image. */
  name?: string | null
  imageSrc?: string | null
  /** Corner pill text, e.g. an episode's unplayed count. */
  cornerText?: string | null
  played?: boolean
  favorite?: boolean
  playedPercent?: number
  /** Card height in dp (default 120; home rows use the row's height, 172 by default). */
  height?: number
  /** Width / height (default 16/9). */
  aspectRatio?: number
  fit?: ImageFit
  label?: string
  className?: string
  style?: CSSProperties
  surfaceProps?: Record<string, string | number | boolean | undefined>
}

/**
 * Home-row / episode card (upstream `BannerCard`, `ui/cards/BannerCard.kt:56-199`): default Card
 * container (surfaceVariant), FillBounds image, name fallback, watched badge + corner pill top-end,
 * 16sp favorite heart top-start, 6dp tertiary progress bar.
 */
export function BannerCard({
  name,
  imageSrc,
  cornerText,
  played,
  favorite,
  playedPercent = 0,
  height = 120,
  aspectRatio = 16 / 9,
  fit = 'fill',
  label,
  className,
  style,
  surfaceProps,
  href,
  onClick,
  onContextMenu,
  onMore,
  moreLabel,
}: BannerCardProps) {
  const showWatched = played && (playedPercent <= 0 || playedPercent >= 100)
  return (
    <CardFrame
      label={label ?? name ?? ''}
      {...{ href, onClick, onContextMenu, onMore, moreLabel, surfaceProps }}
      container="var(--c-surface-variant)"
      className={className}
      style={{ width: dpCss(height * aspectRatio), height: dpCss(height), ...style }}
    >
      <CardImage
        src={imageSrc}
        fit={fit}
        fallback={<span className={styles.fallback}>{name ?? ''}</span>}
      />
      {(showWatched || cornerText != null) && (
        <span className={styles.topEnd}>
          {showWatched && <WatchedBadge size={24} />}
          {cornerText != null && <Pill size="small">{cornerText}</Pill>}
        </span>
      )}
      {favorite && <FaIcon name="heart" size={16} className={styles.heart} />}
      <ProgressBar percent={playedPercent} />
    </CardFrame>
  )
}
