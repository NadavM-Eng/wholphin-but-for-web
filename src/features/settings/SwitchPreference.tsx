import { Switch } from '../../ui'
import { ClickPreference } from './ClickPreference'

export type SwitchPreferenceProps = {
  id: string
  title: string
  value: boolean
  summary?: string | null
  onToggle: () => void
}

/** `SwitchPreference` (SwitchPreference.kt): ListItem with a trailing Switch; a click anywhere toggles. */
export function SwitchPreference({ id, title, value, summary, onToggle }: SwitchPreferenceProps) {
  return (
    <ClickPreference
      id={id}
      title={title}
      summary={summary ?? undefined}
      onClick={onToggle}
      trailing={<Switch checked={value} presentational />}
    />
  )
}
