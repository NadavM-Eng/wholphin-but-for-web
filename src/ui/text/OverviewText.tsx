import clsx from 'clsx'
import { useState, type CSSProperties } from 'react'
import { dpCss } from '../../theme/scale'
import styles from './OverviewText.module.css'

export type OverviewTextProps = {
  text: string
  /** Visible lines (fixed height = lines x 20dp, as upstream). */
  maxLines: number
  /** Upstream opens the full overview in a dialog. Without it, activating toggles in-place expansion. */
  onClick?: () => void
  /** Accessible hint, e.g. "Show full overview". */
  label?: string
  className?: string
  style?: CSSProperties
  /**
   * Text direction of the paragraph. Default `auto`: it follows the text, as a Compose Text does
   * (TextDirection.Content), so an English overview on a Hebrew page reads and aligns left to right.
   */
  dir?: 'auto' | 'ltr' | 'rtl'
}

/**
 * Upstream `OverviewText`: clickable bodyMedium text clamped to `maxLines` in a box of fixed height
 * (lines x 20dp) with 8dp padding; focused background onPrimary@.4 with 8dp corners.
 */
export function OverviewText({ text, maxLines, onClick, label, className, style, dir = 'auto' }: OverviewTextProps) {
  const [expanded, setExpanded] = useState(false)
  const activate = () => (onClick ? onClick() : setExpanded((v) => !v))
  return (
    <div
      role="button"
      tabIndex={0}
      data-focusable
      aria-label={label}
      aria-expanded={onClick ? undefined : expanded}
      className={clsx(styles.box, className)}
      style={style}
      onClick={activate}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          activate()
        }
      }}
    >
      <p
        dir={dir}
        className={clsx(styles.text, !expanded && styles.clamped)}
        style={expanded ? undefined : { WebkitLineClamp: maxLines, lineClamp: maxLines, height: dpCss(maxLines * 20) } as CSSProperties}
      >
        {text}
      </p>
    </div>
  )
}
