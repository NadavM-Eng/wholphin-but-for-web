import { getLocalizationApi } from '@jellyfin/sdk/lib/utils/api/localization-api'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { qk } from '../../api/queryKeys'
import { useApi, useSession } from '../../api/session'
import { PREFERENCE_META, setPref, usePrefs } from '../../stores/preferences'
import { ChoicePreference } from './ChoicePreference'
import { languageOptions } from './languageOptions'
import styles from './Preference.module.css'
import { optionIndex } from './prefModel'
import { PreferredLanguagePreference } from './PreferredLanguagePreference'
import { ProfileProtectionPreference } from './ProfileProtectionPreference'
import { SettingsLayout } from './SettingsLayout'

/** Server SubtitlePlaybackMode -> label (UserProfilePreferencesPage.kt `stringRes`). */
const SERVER_MODE_KEYS: Record<string, string> = {
  Default: 'subtitle_mode_default',
  Always: 'subtitle_mode_always',
  OnlyForced: 'subtitle_mode_only_forced',
  None: 'subtitle_mode_none',
  Smart: 'subtitle_mode_smart',
}

const subtitleModeMeta = PREFERENCE_META.find((m) => m.id === 'SubtitleModePref')!

/**
 * User Profile Settings (UserProfilePreferencesPage.kt, Destination.UserAppPreferences): per-user overrides of
 * the server profile (preferred audio / subtitle language, subtitle mode), plus (web addition) this device's
 * profile protection with PIN set / change / remove and "require server login".
 */
export default function UserProfileSettingsPage() {
  const { t } = useTranslation()
  const api = useApi()
  const session = useSession()
  const config = session?.userDto.Configuration
  const cultures = useQuery({
    queryKey: qk('cultures'),
    staleTime: Infinity,
    queryFn: async ({ signal }) => (await getLocalizationApi(api).getCultures({ signal })).data,
  })
  const mode = usePrefs('subtitleMode')
  const modeOptions = subtitleModeMeta.options ?? []
  const serverModeKey = config?.SubtitleMode ? SERVER_MODE_KEYS[config.SubtitleMode] : undefined
  const modeLabels = modeOptions.map((o) => t(o.labelKey))
  const modeIndex = optionIndex(modeOptions, mode)
  const modeSummary =
    modeIndex === 0 && serverModeKey ? `${modeLabels[0]} - ${t(serverModeKey)}` : modeLabels[modeIndex]

  return (
    <SettingsLayout title={t('profile_specific_settings')} initialFocusId="PreferredAudioLang">
      <h2 className={styles.groupHeader}>{t('profile_specific_settings_from_server')}</h2>
      <PreferredLanguagePreference
        id="PreferredAudioLang"
        title={t('preferred_audio_language')}
        prefKey="preferredAudioLang"
        options={languageOptions(cultures.data, config?.AudioLanguagePreference)}
      />
      <PreferredLanguagePreference
        id="PreferredSubtitleLang"
        title={t('preferred_subtitle_language')}
        prefKey="preferredSubtitleLang"
        options={languageOptions(cultures.data, config?.SubtitleLanguagePreference)}
      />
      <ChoicePreference
        id="SubtitleModePref"
        title={t('subtitle_mode')}
        summary={modeSummary}
        options={modeOptions.map((_, i) => ({
          label: modeLabels[i],
          subtitle: i === 0 && serverModeKey ? t(serverModeKey) : undefined,
        }))}
        selectedIndex={modeIndex}
        onSelect={(i) => setPref('subtitleMode', modeOptions[i].value as typeof mode)}
      />
      <h2 className={styles.groupHeader}>{t('web_this_device')}</h2>
      <ProfileProtectionPreference id="ProtectProfilePreference" title={t('profile_protection')} showChangePin />
    </SettingsLayout>
  )
}
