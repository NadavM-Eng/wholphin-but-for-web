import { setLanguage } from '../i18n'
import { getPrefs, usePrefsStore, type Preferences } from '../stores/preferences'
import { setUserScale } from '../theme/scale'

function applyTheme(p: Preferences) {
  document.documentElement.dataset.theme = p.themeColors
}

function applyScale(p: Preferences) {
  setUserScale(Math.min(200, Math.max(50, p.webInterfaceScale)) / 100)
}

let bound = false

/** Keeps `<html data-theme>`, the interface scale and the UI language in sync with preferences. */
export function bindPreferenceEffects() {
  if (bound) return
  bound = true
  const first = getPrefs()
  applyTheme(first)
  applyScale(first)
  usePrefsStore.subscribe((s, prev) => {
    const p = s.values
    const old = prev.values
    if (p.themeColors !== old.themeColors) applyTheme(p)
    if (p.webInterfaceScale !== old.webInterfaceScale) applyScale(p)
    if (p.userInterfaceLanguage !== old.userInterfaceLanguage) void setLanguage(p.userInterfaceLanguage)
  })
}
