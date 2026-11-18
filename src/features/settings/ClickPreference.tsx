import type { ReactNode } from 'react'
import { ListItem } from '../../ui'
import styles from './Preference.module.css'

export type ClickPreferenceProps = {
  id: string
  title: ReactNode
  summary?: ReactNode
  onClick?: () => void
  /**
   * Upstream onLongClick: right-click, the Menu key, or a touch long-press. The ListItem times the touch press
   * itself (src/ui/lib/useLongPress.ts: iOS sends no contextmenu) and swallows the click of the release.
   */
  onLongClick?: () => void
  trailing?: ReactNode
  leading?: ReactNode
  disabled?: boolean
  titleClassName?: string
}

/** `ClickPreference` (ClickPreference.kt): tv ListItem, headline titleSmall, supporting bodySmall. */
export function ClickPreference({
  id,
  title,
  summary,
  onClick,
  onLongClick,
  trailing,
  leading,
  disabled,
  titleClassName,
}: ClickPreferenceProps) {
  return (
    <div className={styles.row} data-pref-id={id}>
      <ListItem
        className={styles.item}
        headline={<span className={titleClassName ?? styles.title}>{title}</span>}
        supporting={summary ? <span className={styles.summary}>{summary}</span> : undefined}
        trailing={trailing}
        leading={leading}
        disabled={disabled}
        onClick={() => onClick?.()}
        onContextMenu={
          onLongClick
            ? (e) => {
                e.preventDefault()
                onLongClick()
              }
            : undefined
        }
      />
    </div>
  )
}
