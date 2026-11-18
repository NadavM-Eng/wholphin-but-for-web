import clsx from 'clsx'
import styles from './Switch.module.css'

export type SwitchProps = {
  checked: boolean
  onChange?: (checked: boolean) => void
  label?: string
  disabled?: boolean
  /**
   * Apply the settings-screen thumb colors (`SwitchPreference.kt:67-93`: onPrimary thumbs for every theme
   * except PURPLE/BLUE). `false` = plain tv-material `SwitchDefaults.colors()` (as in SwitchWithLabel).
   */
  themed?: boolean
  /** Draw only (no focus/click), for use inside a focusable row. */
  presentational?: boolean
  className?: string
}

/**
 * tv-material3 `Switch`: 40x24dp track with a 1.5dp outline, 12dp thumb unchecked / 18dp checked
 * (100ms tween). Colors: checked thumb onPrimary on a primary track; unchecked thumb and outline in
 * `border` on surfaceVariant.
 */
export function Switch({ checked, onChange, label, disabled, themed = true, presentational, className }: SwitchProps) {
  const cls = clsx(styles.switch, checked && styles.checked, themed && styles.themed, disabled && styles.disabled, className)
  const visual = (
    <>
      <span className={styles.track} />
      <span className={styles.thumb} />
    </>
  )
  if (presentational) {
    return (
      <span className={cls} aria-hidden>
        {visual}
      </span>
    )
  }
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      aria-disabled={disabled || undefined}
      data-focusable
      className={clsx(cls, styles.interactive)}
      onClick={() => !disabled && onChange?.(!checked)}
    >
      {visual}
    </button>
  )
}
