import { Switch } from '../../ui'
import styles from './ClickSwitch.module.css'

export type ClickSwitchProps = {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}

/**
 * Upstream `ClickSwitch` (RequestSeasons.kt): a transparent clickable surface, 54dp tall with 8dp side
 * padding, holding the switch first and then its label; inverseSurface when focused. Used for "Select all"
 * and "Request in 4K" in the request dialogs.
 */
export function ClickSwitch({ label, checked, onChange }: ClickSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      data-focusable
      className={styles.row}
      onClick={() => onChange(!checked)}
    >
      <Switch checked={checked} presentational className={styles.switch} />
      <span className={styles.label}>{label}</span>
    </button>
  )
}
