import { useTranslation } from 'react-i18next'
import { useSession } from '../../api/session'
import { setPref, usePrefs, type PreferenceMeta } from '../../stores/preferences'
import { ChoicePreference } from './ChoicePreference'
import { optionIndex } from './prefModel'

/** Server SubtitlePlaybackMode -> label (UserProfilePreferencesPage.kt `stringRes`). */
const SERVER_MODE_KEYS: Record<string, string> = {
  Default: 'subtitle_mode_default',
  Always: 'subtitle_mode_always',
  OnlyForced: 'subtitle_mode_only_forced',
  None: 'subtitle_mode_none',
  Smart: 'subtitle_mode_smart',
}

/**
 * "Subtitle mode" (UserProfilePreferencesPage.kt): this device's override of the server profile's subtitle mode.
 * The first option follows the profile and names what the profile says.
 */
export function SubtitleModePreference({ meta, title }: { meta: PreferenceMeta; title: string }) {
  const { t } = useTranslation()
  const config = useSession()?.userDto.Configuration
  const mode = usePrefs('subtitleMode')
  const options = meta.options ?? []
  const serverKey = config?.SubtitleMode ? SERVER_MODE_KEYS[config.SubtitleMode] : undefined
  const labels = options.map((o) => t(o.labelKey))
  const index = optionIndex(options, mode)
  return (
    <ChoicePreference
      id={meta.id}
      title={title}
      summary={index === 0 && serverKey ? `${labels[0]} - ${t(serverKey)}` : labels[index]}
      options={options.map((_, i) => ({ label: labels[i], subtitle: i === 0 && serverKey ? t(serverKey) : undefined }))}
      selectedIndex={index}
      onSelect={(i) => setPref('subtitleMode', options[i].value as typeof mode)}
    />
  )
}
