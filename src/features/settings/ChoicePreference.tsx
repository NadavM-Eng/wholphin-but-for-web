import { useState, type ReactNode } from 'react'
import { DialogPopup, SelectedDot } from '../../ui'
import { ClickPreference } from './ClickPreference'
import styles from './Preference.module.css'

export type ChoiceOption = {
  label: ReactNode
  subtitle?: ReactNode
}

export type ChoicePreferenceProps = {
  id: string
  title: string
  summary?: ReactNode
  options: readonly ChoiceOption[]
  selectedIndex: number
  onSelect: (index: number) => void
}

/**
 * `ChoicePreference` (ChoicePreference.kt): a click row whose dialog lists the options with the
 * selected-dot leading content and optional supporting text; choosing one commits and closes. Web: the
 * dialog opens with focus on the current choice, so keyboard users start from it.
 */
export function ChoicePreference({ id, title, summary, options, selectedIndex, onSelect }: ChoicePreferenceProps) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <ClickPreference id={id} title={title} summary={summary} onClick={() => setOpen(true)} />
      <DialogPopup
        open={open}
        title={title}
        onClose={() => setOpen(false)}
        initialFocusIndex={selectedIndex}
        items={options.map((o, i) => ({
          key: String(i),
          headline: <span className={styles.itemText}>{o.label}</span>,
          supporting: o.subtitle ? <span className={styles.itemText}>{o.subtitle}</span> : undefined,
          leading: <SelectedDot selected={i === selectedIndex} />,
          onSelect: () => onSelect(i),
        }))}
      />
    </>
  )
}
