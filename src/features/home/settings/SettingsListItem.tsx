import type { ReactNode, Ref } from 'react'
import { ListItem } from '../../../ui'
import styles from './HomeSettings.module.css'

export type SettingsListItemProps = {
  headline: string
  supporting?: ReactNode
  leading?: ReactNode
  trailing?: ReactNode
  disabled?: boolean
  /** A switch row: role=switch with this aria-checked. */
  switchChecked?: boolean
  onClick: () => void
  /** Stable key for focus restore when the inner page that this item opened is popped. */
  focusKey?: string
  className?: string
  ref?: Ref<HTMLElement>
}

/** `HomeSettingsListItem` / `ClickPreference`: a tv ListItem whose headline is a PreferenceTitle (titleSmall). */
export function SettingsListItem({ headline, supporting, leading, trailing, disabled, switchChecked, onClick, focusKey, className, ref }: SettingsListItemProps) {
  const item = (
    <ListItem
      ref={ref}
      className={className}
      headline={<span className={styles.prefTitle}>{headline}</span>}
      supporting={supporting != null ? <span className={styles.prefSummary}>{supporting}</span> : undefined}
      leading={leading}
      trailing={trailing}
      disabled={disabled}
      role={switchChecked != null ? 'switch' : undefined}
      checked={switchChecked}
      onClick={onClick}
    />
  )
  return focusKey ? <div data-hs-key={focusKey}>{item}</div> : item
}
