import clsx from 'clsx'
import styles from './SwitchWithLabel.module.css'
import { Switch } from './Switch'

export type SwitchWithLabelProps = {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  className?: string
}

/**
 * Upstream `SwitchWithLabel`: the whole row is the focusable switch; 20dp corners, 8dp padding,
 * surfaceVariant@.8 / onSurfaceVariant label, inverted to onSurface / surfaceVariant when focused.
 */
export function SwitchWithLabel({ label, checked, onChange, disabled, className }: SwitchWithLabelProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-disabled={disabled || undefined}
      data-focusable
      className={clsx(styles.row, className)}
      onClick={() => !disabled && onChange(!checked)}
    >
      <span className={styles.label}>{label}</span>
      <Switch checked={checked} disabled={disabled} themed={false} presentational />
    </button>
  )
}
