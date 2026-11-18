import clsx from 'clsx'
import { FaIcon } from '../icons/FaIcon'
import type { FaName } from '../icons/faCodepoints'
import styles from './StreamChip.module.css'

export type StreamChipProps = {
  text: string
  icon?: FaName
  /** Number of streams of this kind; shows "(+n)" for the others (upstream `StreamLabel`). */
  count?: number
  /** When the stream is off (e.g. subtitles disabled) every stream counts as "other". */
  disabled?: boolean
  /** Cap the width (subtitle chips use 160dp). */
  maxWidth?: boolean
  className?: string
}

/** Upstream `StreamLabel` (`VideoStreamDetails.kt:166-215`): secondaryContainer@.5, 4dp radius, 4/6dp padding, 12sp SemiBold with bodyLarge letter spacing, 22dp tall. */
export function StreamChip({ text, icon, count = 0, disabled, maxWidth, className }: StreamChipProps) {
  const others = disabled ? count : count - 1
  const label = others > 0 ? `${text} (+${others})` : text
  return (
    <span className={clsx(styles.chip, maxWidth && styles.capped, className)}>
      {icon && <FaIcon name={icon} />}
      {/* dir="auto": a Compose Text takes its direction from its content, and codec tokens are left-to-right
          text ("HDR10+" keeps its plus sign at the end in Hebrew); the chip itself follows the page */}
      <span className={styles.text} dir="auto">
        {label}
      </span>
    </span>
  )
}
