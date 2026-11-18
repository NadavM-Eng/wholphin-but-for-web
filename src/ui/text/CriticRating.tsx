import clsx from 'clsx'
import { DrawableIcon } from '../icons/DrawableIcon'
import styles from './Rating.module.css'

export type CriticRatingProps = {
  /** Rotten Tomatoes 0-100. Fresh tomato at >= 60, splat below (upstream `TomatoRating`). */
  value: number | null | undefined
  /** Part of a text line (QuickDetails): the icon follows the number directly as a 1em inline box. */
  inline?: boolean
  className?: string
}

/** "NN%" + Rotten Tomatoes icon at 0.8x the font size, 2dp gap; `inline` is the quick-details form (`BaseItem.kt:246-256`). */
export function CriticRating({ value, inline, className }: CriticRatingProps) {
  if (value == null || !Number.isFinite(value)) return null
  if (inline) {
    return (
      <span className={clsx(styles.text, className)}>
        {Math.trunc(value)}%
        <DrawableIcon name={value >= 60 ? 'rt_fresh' : 'rt_rotten'} />
      </span>
    )
  }
  return (
    <span className={clsx(styles.inline, className)}>
      <span>{Math.trunc(value)}%</span>
      <DrawableIcon name={value >= 60 ? 'rt_fresh' : 'rt_rotten'} className={styles.tomato} />
    </span>
  )
}
