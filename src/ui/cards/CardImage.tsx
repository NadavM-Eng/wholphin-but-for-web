import clsx from 'clsx'
import { useState, type CSSProperties, type ReactNode } from 'react'
import { DrawableIcon } from '../icons/DrawableIcon'
import { FaIcon } from '../icons/FaIcon'
import styles from './CardImage.module.css'
import { Pill } from './Pill'
import { ProgressBar } from './ProgressBar'
import { WatchedBadge } from './WatchedBadge'

/** Compose ContentScale -> object-fit: FillBounds = fill, Crop = cover, Fit = contain, None = none. */
export type ImageFit = 'fill' | 'cover' | 'contain' | 'none'

export type CardOverlayProps = {
  favorite?: boolean
  watched?: boolean
  /** Unplayed child count; pill shown when > 0. A string is shown as-is (pre-abbreviated). */
  unplayedCount?: number | string
  /** Played percentage 0-100. */
  playedPercent?: number | null
  /** Number of media sources; the versions pill shows when > 1. */
  versionCount?: number
}

export type CardImageProps = CardOverlayProps & {
  src?: string | null
  alt?: string
  /** Item name, used for the text fallback. */
  name?: string | null
  /** Text fallback (name) instead of the video icon when the image is missing. */
  useFallbackText?: boolean
  fit?: ImageFit
  showOverlay?: boolean
  /** Replaces the default fallback box (e.g. the person silhouette). */
  fallback?: ReactNode
  /** Image opacity (genre/studio cards draw the image at .75). */
  imageOpacity?: number
  className?: string
  style?: CSSProperties
}

/**
 * Port of `ItemCardImage` (`ui/cards/ItemCardImage.kt`): lazy image with fade-in, a fallback box when
 * the URL is missing or fails, and the overlay (versions pill, favorite heart, watched badge,
 * unplayed-count pill, progress bar). Fills its parent; the parent sets the size/aspect.
 */
export function CardImage({
  src,
  alt = '',
  name,
  useFallbackText = true,
  fit = 'contain',
  showOverlay = false,
  fallback,
  imageOpacity,
  className,
  style,
  ...overlay
}: CardImageProps) {
  const [state, setState] = useState<{ src: string | null | undefined; loaded: boolean; error: boolean }>({
    src,
    loaded: false,
    error: false,
  })
  // Reset when the URL changes (upstream: remember(imageUrl) { imageError }).
  const current = state.src === src ? state : { src, loaded: false, error: false }
  if (current !== state) setState(current)

  const showImage = !!src && !current.error
  return (
    <div className={clsx(styles.root, className)} style={style}>
      {showImage ? (
        <img
          key={src}
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          draggable={false}
          className={clsx(styles.img, current.loaded && styles.loaded)}
          style={{ objectFit: fit, ...(imageOpacity != null && current.loaded ? { opacity: imageOpacity } : null) }}
          onLoad={() => setState({ src, loaded: true, error: false })}
          onError={() => setState({ src, loaded: false, error: true })}
        />
      ) : (
        (fallback ?? <CardImageFallback name={name} useFallbackText={useFallbackText} />)
      )}
      {showOverlay && <CardOverlay {...overlay} />}
    </div>
  )
}

function CardImageFallback({ name, useFallbackText }: { name?: string | null; useFallbackText: boolean }) {
  return (
    <div className={styles.fallback}>
      {useFallbackText && name?.trim() ? (
        <span className={styles.fallbackText}>{name}</span>
      ) : (
        <DrawableIcon name="video_solid" className={styles.fallbackIcon} />
      )}
    </div>
  )
}

function CardOverlay({ favorite, watched, unplayedCount, playedPercent, versionCount }: CardOverlayProps) {
  const showWatched = watched && (playedPercent == null || playedPercent <= 0 || playedPercent >= 100)
  const showUnplayed = typeof unplayedCount === 'string' ? unplayedCount !== '' : (unplayedCount ?? 0) > 0
  return (
    <div className={styles.overlay}>
      {((versionCount ?? 0) > 1 || favorite) && (
        <div className={styles.topStart}>
          {(versionCount ?? 0) > 1 && <Pill>{versionCount}</Pill>}
          {favorite && <FaIcon name="heart" size={20} className={styles.heart} />}
        </div>
      )}
      {(showWatched || showUnplayed) && (
        <div className={styles.topEnd}>
          {showWatched && <WatchedBadge size={24} />}
          {showUnplayed && <Pill>{unplayedCount}</Pill>}
        </div>
      )}
      <ProgressBar percent={playedPercent} />
    </div>
  )
}
