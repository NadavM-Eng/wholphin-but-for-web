import { useTranslation } from 'react-i18next'
import { Navigate, useParams } from 'react-router'
import { nav } from '../../app/nav'
import { PreferenceList } from './PreferenceList'
import { buildScreen, screenFromParam, screenTitleKey } from './prefModel'
import { SettingsLayout } from './SettingsLayout'
import { SignOutPreference } from './SignOutPreference'
import { useVisibilityContext } from './useVisibilityContext'

/**
 * Settings screens (Destination.Settings(screen); PreferencesPage + PreferencesContent): /settings is BASIC,
 * /settings/:screen the sub-screens (advanced, screensaver, skip_segments, experimental, hdr_formats).
 */
export default function SettingsPage() {
  const { t } = useTranslation()
  const { screen: param } = useParams()
  const screen = screenFromParam(param)
  const ctx = useVisibilityContext()
  const groups = screen ? buildScreen(screen, ctx) : []
  if (!screen) return <Navigate to={nav.settings()} replace />
  return (
    <SettingsLayout key={screen} title={t(screenTitleKey(screen))} initialFocusId={groups[0]?.entries[0]?.id}>
      <PreferenceList
        groups={groups}
        serverBanner
        extraRows={screen === 'BASIC' ? { profile_specific_settings: <SignOutPreference /> } : undefined}
      />
    </SettingsLayout>
  )
}
