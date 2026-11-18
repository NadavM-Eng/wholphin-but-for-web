import { useState } from 'react'
import { DialogPopup, Switch } from '../../ui'
import type { ChoiceOption } from './ChoicePreference'
import { ClickPreference } from './ClickPreference'
import styles from './Preference.module.css'

export type MultiChoicePreferenceProps<T> = {
  id: string
  title: string
  summary?: string | null
  values: readonly T[]
  options: readonly ChoiceOption[]
  selected: readonly T[]
  onChange: (next: T[]) => void
}

/**
 * `MultiChoicePreference` (MultiChoicePreference.kt): the dialog stays open, each option has a trailing
 * Switch and every toggle commits the whole list immediately. Upstream always passes `supportingContent`
 * (empty without a subtitle), so every option is a two-line ListItem (min 64dp): the supporting slot is always filled.
 */
export function MultiChoicePreference<T>({ id, title, summary, values, options, selected, onChange }: MultiChoicePreferenceProps<T>) {
  const [open, setOpen] = useState(false)
  const toggle = (v: T) => {
    // Keep the stored order stable: remove, or append at the end (upstream mutableStateSet insertion order).
    onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v])
  }
  return (
    <>
      <ClickPreference id={id} title={title} summary={summary ?? undefined} onClick={() => setOpen(true)} />
      <DialogPopup
        open={open}
        title={title}
        dismissOnClick={false}
        onClose={() => setOpen(false)}
        items={values.map((v, i) => ({
          key: String(i),
          headline: <span className={styles.itemText}>{options[i]?.label}</span>,
          supporting: <span className={styles.itemText}>{options[i]?.subtitle}</span>,
          trailing: <Switch checked={selected.includes(v)} presentational />,
          onSelect: () => toggle(v),
        }))}
      />
    </>
  )
}
