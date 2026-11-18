import { useState, type CSSProperties } from 'react'
import { dpCss } from '../../theme/scale'
import { CardFrame, type CardActions } from './CardFrame'
import styles from './ChapterCard.module.css'

export type ChapterCardProps = CardActions & {
  name?: string | null
  /** Formatted start position, e.g. "12m 30s". */
  time: string
  imageSrc?: string | null
  /** Card height in dp (default 120). */
  height?: number
  label?: string
  className?: string
  style?: CSSProperties
  surfaceProps?: Record<string, string | number | boolean | undefined>
}

/**
 * Chapter thumbnail (upstream `ChapterCard`): height fixed, width = 16:9 until the image loads, then the
 * image's own aspect; ContentScale.Fit; bottom label bar on TransparentBlack50 with name + time.
 */
export function ChapterCard({ name, time, imageSrc, height = 120, label, className, style, surfaceProps, ...actions }: ChapterCardProps) {
  const [ratio, setRatio] = useState(16 / 9)
  return (
    <CardFrame
      label={label ?? [name, time].filter(Boolean).join(', ')}
      {...actions}
      surfaceProps={surfaceProps}
      container="var(--c-surface-variant)"
      className={className}
      style={{ height: dpCss(height), width: dpCss(height * ratio), ...style }}
    >
      {imageSrc && (
        <img
          src={imageSrc}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          className={styles.img}
          onLoad={(e) => {
            const img = e.currentTarget
            if (img.naturalWidth && img.naturalHeight) setRatio(img.naturalWidth / img.naturalHeight)
          }}
        />
      )}
      <span className={styles.bar}>
        {name && <span className={styles.name}>{name}</span>}
        <span className={styles.time}>{time}</span>
      </span>
    </CardFrame>
  )
}
