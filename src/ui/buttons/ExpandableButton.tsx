import clsx from 'clsx'
import type { ReactNode } from 'react'
import { Button, type ButtonProps } from './Button'
import styles from './ExpandableButton.module.css'

export type ExpandableButtonProps = Omit<ButtonProps, 'variant' | 'children' | 'label'> & {
  /** The icon: a `MaterialIcon`/`DrawableIcon` (28dp) or a `FaIcon` (16sp). */
  icon: ReactNode
  /**
   * `material`: 28dp painter icon (ExpandablePlayButton); `fa`: 32dp glyph box (ExpandableFaButton). Upstream
   * puts a Spacer(8dp) and the Text inside one AnimatedVisibility, whose layout stacks its children, so the
   * spacer takes no width (PlayButtons.kt:321-329; focused Play is 70dp wide in refshots 09-movie-detail-top).
   */
  iconKind?: 'material' | 'fa'
  label: string
  /** Glyph color, e.g. red for a favorited heart (`PlayButtons.kt:180`). */
  iconColor?: string
  /** Delete button: icon turns `Color.Red`@.8 while focused (`PlayButtons.kt:425-446`). */
  destructive?: boolean
  /**
   * On touch screens (no hover, so no "focus" to reveal the label) show the label anyway.
   * PlayButtons sets this on the first (play/resume) button only; the rest stay icon-only with an
   * accessible name and tooltip.
   */
  labelOnTouch?: boolean
}

/**
 * Icon-only pill that reveals its label on focus/hover (upstream `ExpandablePlayButton` /
 * `ExpandableFaButton`, `PlayButtons.kt:233-386`). The label slides open like `AnimatedVisibility`'s
 * default fadeIn + expandHorizontally.
 */
export function ExpandableButton({
  icon,
  iconKind = 'material',
  label,
  iconColor,
  destructive,
  labelOnTouch,
  className,
  title,
  ...rest
}: ExpandableButtonProps) {
  return (
    <Button
      {...rest}
      variant="expandable"
      label={label}
      title={title ?? label}
      data-touch-label={labelOnTouch}
      className={clsx(styles.button, destructive && styles.destructive, className)}
    >
      <span
        className={iconKind === 'fa' ? styles.faBox : styles.iconBox}
        style={iconColor ? { color: iconColor } : undefined}
      >
        {icon}
      </span>
      <span className={styles.reveal} aria-hidden>
        <span className={styles.revealInner}>
          <span className={styles.label}>{label}</span>
        </span>
      </span>
    </Button>
  )
}
