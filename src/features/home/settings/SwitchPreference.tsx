import { Switch } from '../../../ui'
import { SettingsListItem } from './SettingsListItem'

export type SwitchPreferenceProps = {
  title: string
  value: boolean
  summary?: string | null
  onChange: (value: boolean) => void
}

/** Upstream `SwitchPreference`: a ListItem with the title, an optional summary and a trailing Switch. */
export function SwitchPreference({ title, value, summary, onChange }: SwitchPreferenceProps) {
  return (
    <SettingsListItem
      headline={title}
      supporting={summary ?? undefined}
      trailing={<Switch checked={value} presentational />}
      switchChecked={value}
      onClick={() => onChange(!value)}
    />
  )
}
