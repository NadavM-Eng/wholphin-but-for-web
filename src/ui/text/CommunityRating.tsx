import clsx from 'clsx'
import { MaterialIcon } from '../icons/MaterialIcon'
import styles from './Rating.module.css'

export type CommunityRatingProps = {
  /** 0-10 community rating; formatted "%.1f" in the page locale. */
  value: number | null | undefined
  locale?: string
  /** Part of a text line (QuickDetails): the star follows the number directly as inline content. */
  inline?: boolean
  className?: string
}

/**
 * Upstream `SimpleStarRating`: number + filled star (#FFC700) at font-size height, 2dp gap. `inline` is the
 * quick-details form (`BaseItem.kt:238-244`): the star is an inline placeholder right after the number.
 */
export function CommunityRating({ value, locale, inline, className }: CommunityRatingProps) {
  if (value == null || !Number.isFinite(value)) return null
  const text = new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value)
  if (inline) {
    return (
      <span className={clsx(styles.text, className)}>
        {text}
        <MaterialIcon name="star" className={styles.star} />
      </span>
    )
  }
  return (
    <span className={clsx(styles.inline, className)}>
      <span>{text}</span>
      <MaterialIcon name="star" className={styles.star} />
    </span>
  )
}
