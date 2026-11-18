import clsx from 'clsx'
import type { ReactNode, Ref } from 'react'
import styles from './PlaybackButton.module.css'

export interface PlaybackButtonProps {
  icon: ReactNode
  label: string
  /** shown as the tooltip, e.g. "Pause (K)" */
  title?: string
  onClick: () => void
  disabled?: boolean
  focusDefault?: boolean
  pressed?: boolean
  /**
   * The video player's control strip: no circle behind the icon until the button is focused or hovered, and the
   * size comes from the strip (`--pb-size`), not from the 36dp of the TV button.
   */
  flat?: boolean
  /** the button opens a panel: `aria-haspopup="dialog"` and `aria-expanded` */
  expanded?: boolean
  /** `data-player-button`: a stable name for tests and the screenshot scenes */
  name?: string
  className?: string
  ref?: Ref<HTMLButtonElement>
}

/**
 * `PlaybackButton` / `PlaybackFaButton` (overlay/PlaybackControls.kt:468-554): a 36dp tv Button (circle) with
 * container TransparentBlack25, the theme border color when focused or hovered, 4dp padding, onSurface icon.
 * `flat` is the web player's variant of it (owner request: flat icons as in Jellyfin's web player); the focused
 * and hovered look stays the TV's.
 */
export function PlaybackButton({ icon, label, title, onClick, disabled, focusDefault, pressed, flat, expanded, name, className, ref }: PlaybackButtonProps) {
  return (
    <button
      ref={ref}
      type="button"
      className={clsx(styles.button, flat && styles.flat, className)}
      aria-label={label}
      title={title ?? label}
      aria-disabled={disabled || undefined}
      aria-pressed={pressed}
      aria-haspopup={expanded == null ? undefined : 'dialog'}
      aria-expanded={expanded}
      data-focusable
      data-focus-default={focusDefault || undefined}
      data-player-button={name}
      onClick={() => {
        if (!disabled) onClick()
      }}
    >
      {icon}
    </button>
  )
}
