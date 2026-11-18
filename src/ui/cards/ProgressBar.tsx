import clsx from 'clsx'
import styles from './ProgressBar.module.css'

export type ProgressBarProps = {
  /** Played percentage 0-100. Nothing renders unless 0 < percent < 100, as upstream. */
  percent: number | null | undefined
  className?: string
}

/** Card resume bar: 6dp, `tertiary`, no track, bottom-start (`ItemCardImage.kt:263-279`). */
export function ProgressBar({ percent, className }: ProgressBarProps) {
  if (percent == null || !(percent > 0 && percent < 100)) return null
  return (
    <span
      className={clsx(styles.bar, className)}
      style={{ inlineSize: `${percent}%` }}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(percent)}
    />
  )
}
