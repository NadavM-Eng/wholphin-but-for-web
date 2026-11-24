import { useTranslation } from 'react-i18next'
import { Navigate, useParams } from 'react-router'
import { nav } from '../../app/nav'
import { PreferenceList } from './PreferenceList'
import { buildScreen, screenFromParam, screenTitleKey } from './prefModel'
import { SettingsHome } from './SettingsHome'
import { SettingsLayout } from './SettingsLayout'
import { useVisibilityContext } from './useVisibilityContext'

/**
 * Addresses of upstream screens that the web has regrouped into subjects (topics.ts): an old link or bookmark
 * lands where its rows are now.
 */
const MOVED: Record<string, () => string> = {
  advanced: () => nav.settings(),
  experimental: () => nav.settingsTopic('audio'),
  user: () => nav.settingsTopic('profile'),
}

/**
 * Settings screens (Destination.Settings(screen); PreferencesPage + PreferencesContent). /settings is the web's
 * first screen (SettingsHome: quick rows and the subjects, where upstream shows its BASIC list); /settings/:screen
 * are the upstream sub-screens that are kept as they are (screensaver, skip_segments, hdr_formats).
 */
export default function SettingsPage() {
  const { t } = useTranslation()
  const { screen: param } = useParams()
  const screen = screenFromParam(param)
  const ctx = useVisibilityContext()
  // own keys only: "constructor" and the like are not addresses
  if (param && Object.hasOwn(MOVED, param)) return <Navigate to={MOVED[param]()} replace />
  if (!screen) return <Navigate to={nav.settings()} replace />
  if (screen === 'BASIC') return <SettingsHome />
  const groups = buildScreen(screen, ctx)
  return (
    <SettingsLayout key={screen} title={t(screenTitleKey(screen))} initialFocusId={groups[0]?.entries[0]?.id}>
      <PreferenceList groups={groups} serverBanner />
    </SettingsLayout>
  )
}
