import { useState, type CSSProperties } from 'react'
import { dpCss } from '../../theme/scale'
import { idColorCss } from '../lib/idColor'
import { CardFrame, type CardActions } from './CardFrame'
import styles from './GenreCard.module.css'

export type StudioCardProps = CardActions & {
  id?: string | null
  name?: string | null
  /** The studio's THUMB image. */
  imageSrc?: string | null
  width?: number
  label?: string
  className?: string
  style?: CSSProperties
  surfaceProps?: Record<string, string | number | boolean | undefined>
}

/**
 * Upstream `StudioCard` (`ui/cards/StudioCard.kt`): like GenreCard, but the image (alpha .75) is shown
 * alone; only without an image (or on error) does it show the id color at .4 with the name.
 */
export function StudioCard({ id, name, imageSrc, width, label, className, style, surfaceProps, ...actions }: StudioCardProps) {
  const [failed, setFailed] = useState<string | null>(null)
  const showImage = !!imageSrc && failed !== imageSrc
  return (
    <CardFrame
      label={label ?? name ?? ''}
      {...actions}
      surfaceProps={surfaceProps}
      className={className}
      style={{ width: width != null ? dpCss(width) : '100%', aspectRatio: 16 / 9, ...style }}
    >
      <span className={styles.clip}>
        {showImage ? (
          <img
            src={imageSrc}
            alt=""
            loading="lazy"
            decoding="async"
            draggable={false}
            style={{ width: '100%', height: '100%', objectFit: 'fill', opacity: 0.75 }}
            onError={() => setFailed(imageSrc)}
          />
        ) : (
          <span className={styles.tint} style={{ background: idColorCss(id, 0.4) }}>
            <span className={styles.name}>{name}</span>
          </span>
        )}
      </span>
    </CardFrame>
  )
}
