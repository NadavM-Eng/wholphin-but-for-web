import type { CSSProperties } from 'react'
import { dpCss } from '../../theme/scale'
import { idColorCss } from '../lib/idColor'
import { CardFrame, type CardActions } from './CardFrame'
import { CardImage } from './CardImage'
import styles from './GenreCard.module.css'

export type GenreCardProps = CardActions & {
  /** Genre id; drives the tint color (`rememberIdColor`). */
  id?: string | null
  name?: string | null
  /** A backdrop of a random item in the genre. */
  imageSrc?: string | null
  /** Width in dp; omit to fill the parent (grid cell). Height follows 16:9. */
  width?: number
  label?: string
  className?: string
  style?: CSSProperties
  surfaceProps?: Record<string, string | number | boolean | undefined>
}

/**
 * Upstream `GenreCard` (`ui/cards/GenreCard.kt`): 16:9, image FillBounds at alpha .75 clipped 8dp,
 * the id color at .6 over the whole card, name titleLarge Bold onSurfaceVariant centered.
 */
export function GenreCard({ id, name, imageSrc, width, label, className, style, surfaceProps, ...actions }: GenreCardProps) {
  return (
    <CardFrame
      label={label ?? name ?? ''}
      {...actions}
      surfaceProps={surfaceProps}
      className={className}
      style={{ width: width != null ? dpCss(width) : '100%', aspectRatio: 16 / 9, ...style }}
    >
      <span className={styles.clip}>
        {imageSrc && <CardImage src={imageSrc} fit="fill" imageOpacity={0.75} fallback={<span />} />}
        <span className={styles.tint} style={{ background: idColorCss(id, 0.6) }}>
          <span className={styles.name}>{name}</span>
        </span>
      </span>
    </CardFrame>
  )
}
