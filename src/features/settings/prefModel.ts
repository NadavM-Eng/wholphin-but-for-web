// Settings screens built from the generated preference metadata (PREFERENCE_META / PREFERENCE_SCREENS),
// plus the hand-written overlay the metadata cannot carry: slider unit/index conversions, summary formatters,
// validators, destinations and the web visibility rules. Port of the list machinery in
// W/ui/preferences/PreferencesContent.kt and W/preferences/AppPreference.kt.
import type { TFunction } from 'i18next'
import { nav, type SettingsScreen } from '../../app/nav'
import { formatMaxBitrate } from '../../lib/format'
import {
  PREFERENCE_DEFAULTS,
  PREFERENCE_META,
  PREFERENCE_SCREENS,
  SUBTITLE_HDR_KEYS,
  type PreferenceKey,
  type PreferenceMeta,
  type PreferenceOption,
  type Preferences,
  type PreferenceScreenEntry,
} from '../../stores/preferences'

export type Translate = TFunction

/** Screens rendered by the generic preference list (upstream PreferenceScreenOption + the two other lists). */
export type ScreenId =
  | 'BASIC'
  | 'ADVANCED'
  | 'SCREENSAVER'
  | 'SKIP_SEGMENTS'
  | 'EXPERIMENTAL'
  | 'HDR_FORMATS'
  | 'SUBTITLE_STYLE'
  | 'USER_PROFILE'

export const URL_SCREENS: Record<SettingsScreen, ScreenId> = {
  basic: 'BASIC',
  advanced: 'ADVANCED',
  screensaver: 'SCREENSAVER',
  skip_segments: 'SKIP_SEGMENTS',
  experimental: 'EXPERIMENTAL',
  hdr_formats: 'HDR_FORMATS',
}

export function screenFromParam(param: string | undefined): ScreenId | null {
  if (!param) return 'BASIC'
  return (URL_SCREENS as Record<string, ScreenId | undefined>)[param] ?? null
}

export function screenTitleKey(screen: ScreenId, hdrPage = false): string {
  const s = PREFERENCE_SCREENS[screen] as { titleKey: string; hdrTitleKey?: string }
  return hdrPage && s.hdrTitleKey ? s.hdrTitleKey : s.titleKey
}

export interface VisibilityContext {
  prefs: Preferences
  /** a Seerr server is configured and reachable (gates SeerrIntegration) */
  discover: boolean
  /** the display reports HDR (`(dynamic-range: high)`) */
  hdrDisplay: boolean
  /** rendering the HDR copy of the subtitle editor */
  hdrPage: boolean
}

/**
 * Upstream conditions that the generator could not turn into a pref/feature check, keyed by their raw text.
 * Unknown conditions hide the row (and warn in dev) so a new upstream condition is noticed.
 */
const RAW_CONDITIONS: Record<string, (c: VisibilityContext) => boolean> = {
  // The web has exactly one player (the browser), which plays the role of upstream's ExoPlayer backend.
  'playerBackend == EXO_PLAYER': () => true,
  // Upstream: only on HDR displays. Also shown when already on, so a user who moved the browser to an SDR
  // screen can still turn it off.
  '!isPageForHdr && display.isHdr': (c) => !c.hdrPage && (c.hdrDisplay || c.prefs.subSeparateHdr),
  // The HDR page never gets the HDR group (SubtitleStylePage.kt).
  'useSeparateHdr == true': (c) => !c.hdrPage && c.prefs.subSeparateHdr,
}

export function isVisible(entry: PreferenceScreenEntry, ctx: VisibilityContext): boolean {
  const v = entry.visibleWhen
  if (!v) return true
  if (v.pref) return ctx.prefs[v.pref] === v.equals
  if (v.feature === 'discover') return ctx.discover
  const raw = RAW_CONDITIONS[v.raw]
  if (raw) return raw(ctx)
  if (import.meta.env.DEV) console.warn(`[settings] unknown visibility condition: ${v.raw}`)
  return false
}

/**
 * Rows that exist upstream and are classified web/web-adapted but have no web mechanism in this build.
 * Each one is listed in the settings report; remove the id here once the feature lands.
 */
export const WEB_HIDDEN: Readonly<Record<string, string>> = {}

export interface PrefGroup {
  titleKey: string
  entries: PreferenceMeta[]
}

/** Groups and visible rows of a screen in upstream order; empty groups are dropped. */
export function buildScreen(screen: ScreenId, ctx: VisibilityContext): PrefGroup[] {
  const def = PREFERENCE_SCREENS[screen] as { groups: readonly string[] }
  return def.groups
    .map((group) => {
      const entries = PREFERENCE_META.map((m) => ({ m, s: m.screens.find((s) => s.screen === screen && s.group === group) }))
        .filter((x): x is { m: PreferenceMeta; s: PreferenceScreenEntry } => !!x.s)
        .filter(({ m, s }) => !(m.id in WEB_HIDDEN) && isVisible(s, ctx))
        .sort((a, b) => a.s.order - b.s.order)
        .map((x) => x.m)
      return { titleKey: group, entries }
    })
    .filter((g) => g.entries.length > 0)
}

/**
 * Title keys that cannot be used as-is: Android has both a string and a string-array named
 * `background_style`; the generated locale keeps the array under that key.
 */
const TITLE_OVERRIDES: Record<string, string> = { SubBackgroundStyle: 'web_background_style' }

export function titleKeyOf(meta: PreferenceMeta): string | null {
  return TITLE_OVERRIDES[meta.id] ?? meta.titleKey
}

// ---------------------------------------------------------------------------------------------
// Keys: the HDR subtitle page edits the hdr* copy.

export function keyFor(meta: PreferenceMeta, hdrPage: boolean): PreferenceKey | null {
  if (!meta.key) return null
  if (hdrPage && meta.key in SUBTITLE_HDR_KEYS) return SUBTITLE_HDR_KEYS[meta.key as keyof typeof SUBTITLE_HDR_KEYS]
  return meta.key
}

// ---------------------------------------------------------------------------------------------
// Sliders

export interface SliderSpec {
  min: number
  max: number
  step: number
  /** stored value -> slider position */
  toUi: (stored: number) => number
  /** slider position -> stored value */
  fromUi: (ui: number) => number
}

const UNIT_FACTOR: Record<string, number> = { seconds: 1000, hours: 3_600_000 }

export function sliderSpec(meta: PreferenceMeta): SliderSpec {
  const min = meta.min ?? 0
  const max = meta.max ?? 100
  const step = meta.step ?? 1
  const list = meta.valueList
  if (list) {
    const def = meta.key ? (PREFERENCE_DEFAULTS[meta.key] as number) : list[0]
    return {
      min: 0,
      max: list.length - 1,
      step: 1,
      toUi: (stored) => {
        const i = list.indexOf(stored)
        if (i >= 0) return i
        // MaxAge: -1 (no max) is the last index; others fall back to the default's index like the upstream getters.
        const d = list.indexOf(def)
        return d >= 0 ? d : 0
      },
      fromUi: (ui) => list[Math.min(list.length - 1, Math.max(0, Math.round(ui)))],
    }
  }
  const factor = meta.storedUnit === 'ms' && meta.uiUnit ? (UNIT_FACTOR[meta.uiUnit] ?? 1) : 1
  return {
    min,
    max,
    step,
    toUi: (stored) => Math.round(stored / factor),
    fromUi: (ui) => ui * factor,
  }
}

/**
 * Sliders whose value re-lays out the page they are on when it is applied, so that the slider itself moves and
 * resizes under the pointer that drags it: the interface scale (the root font size, src/app/applyPreferences.ts).
 * Their row applies a pointer drag once, at its release (SliderPreference `dragSummary`). Every other slider
 * changes something beside its list (a preview, the page behind a dialog) or nothing on screen, and applies each
 * step at once like the TV.
 */
const RELAYOUT_SLIDERS: ReadonlySet<string> = new Set(['WebInterfaceScale'])

export function relaysOutPage(meta: PreferenceMeta): boolean {
  return RELAYOUT_SLIDERS.has(meta.id)
}

/** Kotlin `Duration.toString()` for whole seconds: "30s", "1m", "1m 30s", "1h". */
export function kotlinDuration(ms: number): string {
  if (ms === 0) return '0s'
  let s = Math.round(ms / 1000)
  const parts: string[] = []
  const d = Math.floor(s / 86400)
  s -= d * 86400
  const h = Math.floor(s / 3600)
  s -= h * 3600
  const m = Math.floor(s / 60)
  s -= m * 60
  if (d) parts.push(`${d}d`)
  if (h) parts.push(`${h}h`)
  if (m) parts.push(`${m}m`)
  if (s) parts.push(`${s}s`)
  return parts.join(' ')
}

/** Kotlin `Double.toString()` for a half step: 2 -> "2.0", 1.5 -> "1.5". */
function kotlinHalf(n: number): string {
  const v = n / 2
  return Number.isInteger(v) ? `${v}.0` : String(v)
}

/** Slider summaries (upstream `summarizer`s). `ui` is the slider position; `stored` the persisted value. */
export function sliderSummary(meta: PreferenceMeta, ui: number, stored: number, t: Translate): string {
  switch (meta.id) {
    case 'SkipForward':
    case 'SkipBack':
      return t('seconds', { count: ui })
    case 'SkipBackOnResume':
      return ui === 0 ? t('disabled') : `${ui}s`
    case 'AutoPlayNextDelay':
      return ui === 0 ? t('immediate') : t('seconds', { count: ui })
    case 'PassOutProtection':
      return ui === 0 ? t('disabled') : t('hours', { count: ui })
    case 'SlideshowDuration':
    case 'ControllerTimeout':
      return t('decimal_seconds', { p1: (stored / 1000).toFixed(2) })
    case 'MaxBitrate':
      return formatMaxBitrate(stored)
    case 'ScreensaverStartDelay':
    case 'ScreensaverDuration':
      return kotlinDuration(stored)
    case 'ScreensaverMaxAge': {
      const last = (meta.valueList?.length ?? 1) - 1
      if (ui === 0) return t('for_all_ages')
      if (ui === last) return t('no_max')
      return t('up_to_age', { p1: stored })
    }
    case 'SubEdgeThickness':
      return kotlinHalf(ui)
    case 'WebInterfaceScale':
      return t('web_interface_scale_summary', { p1: ui })
    case 'ScreensaverDimPercent':
    case 'SubFontOpacity':
    case 'SubBackgroundOpacity':
    case 'SubMargin':
    case 'SubImageOpacity':
      return `${ui}%`
    default:
      return String(ui)
  }
}

// ---------------------------------------------------------------------------------------------
// Choices

function sameValue(a: unknown, b: unknown): boolean {
  if (typeof a === 'string' && typeof b === 'string') return a.toLowerCase() === b.toLowerCase()
  return a === b
}

/** Index of the stored value in the option list; unknown values fall back to the first option (upstream valueToIndex). */
export function optionIndex(options: readonly PreferenceOption[], value: unknown): number {
  const i = options.findIndex((o) => sameValue(o.value, value))
  return i >= 0 ? i : 0
}

/** Summary of a click/choice/destination/switch row (sliders use sliderSummary). */
export function rowSummary(meta: PreferenceMeta, value: unknown, t: Translate): string | null {
  switch (meta.widget) {
    case 'switch': {
      const on = value === true
      const key = on ? meta.summaryOnKey : meta.summaryOffKey
      return key ? t(key) : meta.summaryKey ? t(meta.summaryKey) : null
    }
    case 'choice': {
      if (meta.summaryKey) return t(meta.summaryKey)
      if (!meta.options) return null
      return t(meta.options[optionIndex(meta.options, value)].labelKey)
    }
    default:
      return meta.summaryKey ? t(meta.summaryKey) : null
  }
}

// ---------------------------------------------------------------------------------------------
// Validation (AppSwitchPreference.validator)

export type Validation = { ok: true } | { ok: false; message: string }

export function validate(meta: PreferenceMeta, prefs: Preferences, value: unknown): Validation {
  if (meta.id === 'PreferAc3ForSurround' && value === true) {
    // ExperimentalPreference.kt:73-82 (hard-coded English upstream)
    if (!prefs.ac3Supported) return { ok: false, message: 'AC3 support is not enabled' }
    if (prefs.downMixStereo) return { ok: false, message: 'Always downmixing to stereo' }
  }
  return { ok: true }
}

// ---------------------------------------------------------------------------------------------
// Destinations (AppDestinationPreference.destination -> web route)

const DESTINATIONS: Record<string, () => string> = {
  'SubtitleSettings(hdr=false)': () => nav.subtitleSettings(),
  'SubtitleSettings(hdr=true)': () => nav.subtitleSettings({ hdr: true }),
  'Settings(SCREENSAVER)': () => nav.settings('screensaver'),
  'Settings(ADVANCED)': () => nav.settings('advanced'),
  'Settings(SKIP_SEGMENTS)': () => nav.settings('skip_segments'),
  'Settings(EXPERIMENTAL)': () => nav.settings('experimental'),
  'Settings(HDR_FORMATS)': () => nav.settings('hdr_formats'),
  HomeSettings: () => nav.homeSettings(),
  UserAppPreferences: () => nav.userSettings(),
  License: () => nav.license(),
}

export function destinationPath(meta: PreferenceMeta): string | null {
  return meta.destination ? (DESTINATIONS[meta.destination]?.() ?? null) : null
}
