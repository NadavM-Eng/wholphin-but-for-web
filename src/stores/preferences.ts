// Preferences store. Keys/defaults/metadata are generated (preferences.gen.ts). Persistence follows upstream:
// AppPreferences are device-global (one document per browser), the few values upstream keeps on the users
// row (UI language, preferred audio/subtitle language, subtitle mode) are stored per `serverId:userId`.
import { create } from 'zustand'
import { readJson, removeKey, writeJson } from '../lib/storage'
import {
  PREFERENCE_DEFAULTS,
  PREFERENCE_META,
  PREFERENCE_SCOPE,
  type PreferenceKey,
  type Preferences,
} from './preferences.gen'
import { useSessionStore, userKey } from './session'

export * from './preferences.gen'

const APP_KEY = 'wholphin.prefs.app.v1'
const USER_KEY_PREFIX = 'wholphin.prefs.user.v1.'

interface PrefsState {
  values: Preferences
  /** `serverId:userId` whose per-user values are loaded, or null */
  user: string | null
}

function pick(source: Partial<Preferences> | null, scope: 'app' | 'user'): Partial<Preferences> {
  const out: Partial<Record<PreferenceKey, unknown>> = {}
  if (!source) return out as Partial<Preferences>
  for (const k of Object.keys(PREFERENCE_DEFAULTS) as PreferenceKey[]) {
    if (PREFERENCE_SCOPE[k] === scope && k in source) out[k] = source[k]
  }
  return out as Partial<Preferences>
}

function compose(user: string | null): Preferences {
  const app = pick(readJson<Partial<Preferences>>(APP_KEY), 'app')
  const usr = user ? pick(readJson<Partial<Preferences>>(USER_KEY_PREFIX + user), 'user') : {}
  return { ...PREFERENCE_DEFAULTS, ...app, ...usr }
}

export const usePrefsStore = create<PrefsState>()(() => ({ values: compose(null), user: null }))

function persist(scope: 'app' | 'user', values: Preferences, user: string | null) {
  const doc: Partial<Record<PreferenceKey, unknown>> = {}
  for (const k of Object.keys(values) as PreferenceKey[]) {
    if (PREFERENCE_SCOPE[k] !== scope) continue
    // store only what differs from the default so future default changes reach users who never touched it
    if (JSON.stringify(values[k]) !== JSON.stringify(PREFERENCE_DEFAULTS[k])) doc[k] = values[k]
  }
  if (scope === 'app') writeJson(APP_KEY, doc)
  else if (user) writeJson(USER_KEY_PREFIX + user, doc)
}

/** Select from preferences: `usePrefs((p) => p.themeColors)` or `usePrefs('themeColors')`. */
export function usePrefs<K extends PreferenceKey>(key: K): Preferences[K]
export function usePrefs<T>(selector: (p: Preferences) => T): T
export function usePrefs<T>(sel: PreferenceKey | ((p: Preferences) => T)): unknown {
  return usePrefsStore((s) => (typeof sel === 'function' ? sel(s.values) : s.values[sel]))
}

export function getPrefs(): Preferences {
  return usePrefsStore.getState().values
}

export function getPref<K extends PreferenceKey>(key: K): Preferences[K] {
  return usePrefsStore.getState().values[key]
}

/** Side effects embedded in upstream setters (spec 06 §2.2). */
function withSideEffects<K extends PreferenceKey>(values: Preferences, key: K, value: Preferences[K]): Preferences {
  const next = { ...values, [key]: value }
  if ((key === 'ac3Supported' && value === false) || (key === 'downMixStereo' && value === true)) {
    next.preferAc3ForSurround = false
  }
  return next
}

export function setPref<K extends PreferenceKey>(key: K, value: Preferences[K]) {
  const { values, user } = usePrefsStore.getState()
  const next = withSideEffects(values, key, value)
  usePrefsStore.setState({ values: next })
  persist('app', next, user)
  if (PREFERENCE_SCOPE[key] === 'user') persist('user', next, user)
}

/** Reset preferences to defaults. `scope` limits it to app-level or the current user's values. */
export function resetPrefs(scope: 'app' | 'user' | 'all' = 'all') {
  const { values, user } = usePrefsStore.getState()
  const next = { ...values }
  for (const k of Object.keys(PREFERENCE_DEFAULTS) as PreferenceKey[]) {
    if (scope === 'all' || PREFERENCE_SCOPE[k] === scope) (next as Record<string, unknown>)[k] = PREFERENCE_DEFAULTS[k]
  }
  usePrefsStore.setState({ values: next })
  if (scope !== 'user') removeKey(APP_KEY)
  if (scope !== 'app' && user) removeKey(USER_KEY_PREFIX + user)
}

/** Reset the subtitle style group (upstream `resetSubtitles()`). */
export function resetSubtitlePrefs() {
  for (const m of PREFERENCE_META) {
    if (m.key && m.screens.some((s) => s.screen === 'SUBTITLE_STYLE')) {
      setPref(m.key, PREFERENCE_DEFAULTS[m.key])
    }
  }
}

/** Loads the per-user values for the given user (or clears them). Called on session change. */
export function loadUserPrefs(user: string | null) {
  if (usePrefsStore.getState().user === user) return
  usePrefsStore.setState({ user, values: compose(user) })
}

let bound = false
/** Keep per-user values in sync with the session store. */
export function bindPrefsToSession() {
  if (bound) return
  bound = true
  const sync = () => {
    const cur = useSessionStore.getState().current
    loadUserPrefs(cur ? userKey(cur.server.id, cur.user.id) : null)
  }
  sync()
  useSessionStore.subscribe(sync)
}
