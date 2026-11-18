import { useState } from 'react'
import { DialogPopup, SelectedDot } from '../../../ui'
import { SettingsListItem } from './SettingsListItem'

export type ChoicePreferenceProps = {
  title: string
  /** Display labels, in value order. */
  labels: readonly string[]
  selectedIndex: number
  onChange: (index: number) => void
}

/**
 * Upstream `ChoicePreference`: a ClickPreference whose summary is the selected label; clicking opens a
 * DialogPopup of all values with the selected-dot marker.
 */
export function ChoicePreference({ title, labels, selectedIndex, onChange }: ChoicePreferenceProps) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <SettingsListItem headline={title} supporting={labels[selectedIndex] ?? ''} onClick={() => setOpen(true)} />
      <DialogPopup
        open={open}
        title={title}
        onClose={() => setOpen(false)}
        items={labels.map((label, i) => ({
          key: String(i),
          headline: label,
          leading: <SelectedDot selected={i === selectedIndex} />,
          selected: false,
          onSelect: () => onChange(i),
        }))}
      />
    </>
  )
}
