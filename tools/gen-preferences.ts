// Generates src/stores/preferences.gen.ts from docs/spec/preferences.json.
// Run with `npm run gen:preferences`. Output is committed.
//
// Keys: lowerCamelCase of the spec `id`, with a trailing `Pref`/`Preference` removed
// (ThemeColors -> themeColors, BackdropStylePref -> backdropStyle).
// Values are stored in the unit the app code consumes (milliseconds for skip/timeout durations);
// the settings UI converts to `uiUnit` using the metadata.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export interface SpecScreen {
  screen: string
  groupTitleKey: string | null
  order: number
  visibleWhen: string | null
}
export interface SpecOption {
  value: string | boolean | number
  index: number
  labelKey: string
  subtitleKey?: string
  intValue?: number
  volume?: number | null
}
export interface SpecPref {
  id: string
  store: string
  protoPath: string | null
  type: string
  valueType: string
  titleKey: string | null
  summaryKey: string | null
  summaryOnKey: string | null
  summaryOffKey: string | null
  default: unknown
  uiDefault: unknown
  classification: 'web' | 'web-adapted' | 'android-only'
  classificationNote?: string
  screens: SpecScreen[]
  options?: SpecOption[]
  destination?: string
  min?: number
  max?: number
  step?: number
  storedUnit?: string
  uiUnit?: string
  summaryFormat?: string
  valueList?: number[]
  whereShown?: string
}

/** Web-only preferences that upstream does not have. */
export const WEB_ONLY: SpecPref[] = [
  {
    id: 'WebInterfaceScale',
    store: 'web',
    protoPath: null,
    type: 'slider',
    valueType: 'int(percent)',
    titleKey: 'web_interface_scale',
    summaryKey: 'web_interface_scale_summary',
    summaryOnKey: null,
    summaryOffKey: null,
    default: 100,
    uiDefault: 100,
    classification: 'web',
    classificationNote: 'Multiplier (percent) applied on top of the automatic viewport scale via setUserScale().',
    screens: [{ screen: 'BASIC', groupTitleKey: 'ui_interface', order: 50, visibleWhen: null }],
    min: 50,
    max: 200,
    step: 10,
    summaryFormat: "'{n}%'",
  },
  {
    id: 'WebPlayerDimVideo',
    store: 'web',
    protoPath: null,
    type: 'switch',
    valueType: 'boolean',
    titleKey: 'web_player_dim_video',
    summaryKey: null,
    summaryOnKey: 'enabled',
    summaryOffKey: 'disabled',
    default: false,
    uiDefault: false,
    classification: 'web',
    classificationNote:
      'On: the TV scrim (PlaybackOverlay.kt:133-151, transparent -> black 50% -> black 80% over the whole picture) while the controls show. Off (default, owner request): only the top and bottom control strips are darkened.',
    // right after "Hide playback controls" (ControllerTimeout, order 1)
    screens: [{ screen: 'ADVANCED', groupTitleKey: 'playback', order: 1.5, visibleWhen: null }],
  },
]

/**
 * Classification changes for the web port (spec preferences.json says android-only; the web has an equivalent).
 */
export const CLASSIFICATION_OVERRIDES: Record<string, { classification: 'web' | 'web-adapted'; note: string }> = {
  SubSeparateHdr: {
    classification: 'web-adapted',
    note: "Shown on the SDR subtitle page when matchMedia('(dynamic-range: high)') matches (or the toggle is already on). Playback uses the HDR style only for HDR video when this is on.",
  },
  SubHdrSettings: {
    classification: 'web-adapted',
    note: 'Link to /settings/subtitles?hdr=1, the editor for the hdrSub* copy of the subtitle style.',
  },
}

/** Upstream keeps two copies of SubtitlePreferences (SDR and HDR); the HDR copy gets `hdr` + key. */
export function isSubtitleStyle(p: SpecPref): boolean {
  return p.store === 'appPreferences.subtitlePreferences' && hasValue(p) && p.id !== 'SubSeparateHdr'
}

export function hdrKey(id: string): string {
  const k = prefKey(id)
  return 'hdr' + k.charAt(0).toUpperCase() + k.slice(1)
}

function applyOverrides(p: SpecPref): SpecPref {
  const o = CLASSIFICATION_OVERRIDES[p.id]
  return o ? { ...p, classification: o.classification, classificationNote: o.note } : p
}

/**
 * Defaults that differ from the spec `default` (the fresh-install stored value), with the reason.
 * Everything else uses `default`, converted to the stored unit.
 */
const DEFAULT_OVERRIDES: Record<string, { value: unknown; reason: string }> = {
  SubBackgroundColor: {
    value: '#000000',
    reason: 'Color.Transparent masked with 0x00FFFFFF is 0 = black; opacity is the separate SubBackgroundOpacity (50%).',
  },
}

/** Notes rendered as comments for defaults where proto and UI disagree but we keep the stored value. */
const DEFAULT_NOTES: Record<string, string> = {
  DecodeAv1:
    'A fresh install stores false (nothing sets it; UI default true), so upstream behaves with AV1 decoding off. Spec 06 §2.4 suggests true for the web; kept false to match behaviour. Playback must gate on browser AV1 support anyway.',
  ScreensaverDimToggle: 'Stored default false (the app behaves with it off); the UI default true is an upstream bug.',
  ScreensaverDimPercent: '75 = value after the 1.0.6 migration that runs on every fresh install (serializer says 0).',
  SkipBackOnResume: 'Proto field is *_seconds but stores milliseconds; key value here is milliseconds.',
  MaxDaysNextUp: '-1 = no limit (slider index 7).',
}

export function prefKey(id: string): string {
  const stripped = id.replace(/(Preference|Pref)$/, '')
  return stripped.charAt(0).toLowerCase() + stripped.slice(1)
}

export function hasValue(p: SpecPref): boolean {
  // Profile protection is stored on the saved user (pin / requireLogin) in src/stores/session.
  return p.valueType !== 'none' && p.id !== 'ProtectProfilePreference'
}

export function scopeOf(p: SpecPref): 'app' | 'user' {
  // users-row values and KeyValueService entries ("{userId}_key") are per user upstream
  return p.store.startsWith('localDb.users') || p.store === 'keyValue' ? 'user' : 'app'
}

const UNIT_FACTOR: Record<string, number> = { seconds: 1000, hours: 3_600_000 }

export function defaultFor(p: SpecPref): unknown {
  const o = DEFAULT_OVERRIDES[p.id]
  if (o) return o.value
  if (p.storedUnit === 'ms' && p.uiUnit && typeof p.default === 'number') {
    return p.default * (UNIT_FACTOR[p.uiUnit] ?? 1)
  }
  if (p.id === 'UserInterfaceLanguage') return null
  return p.default
}

export function tsType(p: SpecPref): string {
  const vt = p.valueType
  if (vt === 'boolean') return 'boolean'
  if (vt.startsWith('enum[]')) return p.options ? `Array<${p.options.map((o) => JSON.stringify(o.value)).join(' | ')}>` : 'string[]'
  if (vt.startsWith('enum') && p.options) return p.options.map((o) => JSON.stringify(o.value)).join(' | ')
  if (vt.startsWith('string(BCP47')) return 'string | null'
  if (vt.startsWith('string') || vt.startsWith('int(RGB')) return 'string'
  if (vt.startsWith('int') || vt.startsWith('slider') || vt.includes('index into')) return 'number'
  if (typeof p.default === 'boolean') return 'boolean'
  return 'number'
}

/** Converts known upstream visibility conditions into a structured check. */
export function visibility(raw: string | null): string {
  if (!raw) return 'null'
  const known: [string, string][] = [
    ['experimentalPreferences.enabled', `, pref: 'experimentalEnable', equals: true`],
    ['BuildConfig.DISCOVER_ENABLED', `, feature: 'discover'`],
    ['seerr connection active', `, feature: 'discover'`],
  ]
  const extra = known.find(([prefix]) => raw.startsWith(prefix))?.[1] ?? ''
  return `{ raw: ${JSON.stringify(raw)}${extra} }`
}

export function generate(spec: { preferences: SpecPref[]; screens: Record<string, unknown> }): string {
  const all = [...spec.preferences, ...WEB_ONLY].map(applyOverrides)
  const web = all.filter((p) => p.classification !== 'android-only')
  const android = all.filter((p) => p.classification === 'android-only')
  const valued = web.filter(hasValue)
  const hdrCopies = valued.filter(isSubtitleStyle)

  const L: string[] = []
  L.push('// GENERATED by tools/gen-preferences.ts from docs/spec/preferences.json. Do not edit.')
  L.push('')
  L.push('export interface Preferences {')
  for (const p of valued) {
    const unit = p.storedUnit ? ` Stored in ${p.storedUnit}${p.uiUnit ? `, shown in ${p.uiUnit}` : ''}.` : ''
    L.push(`  /** ${p.id} (${p.protoPath ?? p.store}).${unit} */`)
    L.push(`  ${prefKey(p.id)}: ${tsType(p)}`)
  }
  for (const p of hdrCopies) {
    L.push(`  /** ${p.id}, HDR copy (${(p.protoPath ?? '').replace('subtitles_preferences', 'hdr_subtitles_preferences')}). */`)
    L.push(`  ${hdrKey(p.id)}: ${tsType(p)}`)
  }
  L.push('}')
  L.push('')
  L.push('export type PreferenceKey = keyof Preferences')
  L.push('')
  L.push('export const PREFERENCE_DEFAULTS: Preferences = {')
  for (const p of valued) {
    const o = DEFAULT_OVERRIDES[p.id]
    if (o) L.push(`  // ${o.reason} (spec default: ${JSON.stringify(p.default)})`)
    if (DEFAULT_NOTES[p.id]) L.push(`  // ${DEFAULT_NOTES[p.id]}`)
    L.push(`  ${prefKey(p.id)}: ${JSON.stringify(defaultFor(p))},`)
  }
  for (const p of hdrCopies) L.push(`  ${hdrKey(p.id)}: ${JSON.stringify(defaultFor(p))},`)
  L.push('}')
  L.push('')
  L.push('/** Where a preference is persisted: `app` = one document per browser (upstream AppPreferences is device-global), `user` = per signed-in user (upstream stores these on the users row). */')
  L.push('export const PREFERENCE_SCOPE: Record<PreferenceKey, "app" | "user"> = {')
  for (const p of valued) L.push(`  ${prefKey(p.id)}: '${scopeOf(p)}',`)
  for (const p of hdrCopies) L.push(`  ${hdrKey(p.id)}: '${scopeOf(p)}',`)
  L.push('}')
  L.push('')
  L.push('/** Subtitle style keys (SDR copy) and their HDR copy (upstream hdr_subtitles_preferences). */')
  L.push('export const SUBTITLE_HDR_KEYS = {')
  for (const p of hdrCopies) L.push(`  ${prefKey(p.id)}: '${hdrKey(p.id)}',`)
  L.push('} as const')
  L.push('')
  L.push('export type SubtitleStyleKey = keyof typeof SUBTITLE_HDR_KEYS')
  L.push('')
  L.push(`export type PreferenceWidget = 'switch' | 'choice' | 'multichoice' | 'slider' | 'string' | 'click' | 'destination' | 'none'`)
  L.push('')
  L.push('export interface PreferenceVisibility {')
  L.push('  raw: string')
  L.push('  pref?: PreferenceKey')
  L.push('  equals?: unknown')
  L.push('  feature?: string')
  L.push('}')
  L.push('')
  L.push('export interface PreferenceScreenEntry {')
  L.push('  screen: string')
  L.push('  group: string | null')
  L.push('  order: number')
  L.push('  visibleWhen: PreferenceVisibility | null')
  L.push('}')
  L.push('')
  L.push('export interface PreferenceOption {')
  L.push('  value: string | number | boolean')
  L.push('  labelKey: string')
  L.push('  subtitleKey?: string')
  L.push('  intValue?: number')
  L.push('  volume?: number | null')
  L.push('}')
  L.push('')
  L.push('export interface PreferenceMeta {')
  L.push('  id: string')
  L.push('  /** key in Preferences, or null for action/navigation entries */')
  L.push('  key: PreferenceKey | null')
  L.push('  widget: PreferenceWidget')
  L.push('  valueType: string')
  L.push("  classification: 'web' | 'web-adapted'")
  L.push('  note?: string')
  L.push('  titleKey: string | null')
  L.push('  summaryKey: string | null')
  L.push('  summaryOnKey: string | null')
  L.push('  summaryOffKey: string | null')
  L.push('  summaryFormat?: string')
  L.push('  options?: readonly PreferenceOption[]')
  L.push('  min?: number')
  L.push('  max?: number')
  L.push('  step?: number')
  L.push('  storedUnit?: string')
  L.push('  uiUnit?: string')
  L.push('  /** slider index -> stored value (index-based sliders) */')
  L.push('  valueList?: readonly number[]')
  L.push('  /** upstream Destination name for navigation entries */')
  L.push('  destination?: string')
  L.push('  whereShown?: string')
  L.push('  screens: readonly PreferenceScreenEntry[]')
  L.push('}')
  L.push('')
  L.push('export const PREFERENCE_META: readonly PreferenceMeta[] = [')
  for (const p of web) {
    const m: string[] = []
    m.push(`id: ${JSON.stringify(p.id)}`)
    m.push(`key: ${hasValue(p) ? `'${prefKey(p.id)}'` : 'null'}`)
    m.push(`widget: '${p.type}'`)
    m.push(`valueType: ${JSON.stringify(p.valueType)}`)
    m.push(`classification: '${p.classification}'`)
    if (p.classificationNote) m.push(`note: ${JSON.stringify(p.classificationNote)}`)
    m.push(`titleKey: ${JSON.stringify(p.titleKey)}`)
    m.push(`summaryKey: ${JSON.stringify(p.summaryKey)}`)
    m.push(`summaryOnKey: ${JSON.stringify(p.summaryOnKey)}`)
    m.push(`summaryOffKey: ${JSON.stringify(p.summaryOffKey)}`)
    if (p.summaryFormat) m.push(`summaryFormat: ${JSON.stringify(p.summaryFormat)}`)
    if (p.options)
      m.push(
        `options: ${JSON.stringify(
          p.options.map((o) => {
            const r: Record<string, unknown> = { value: o.value, labelKey: o.labelKey }
            if (o.subtitleKey) r.subtitleKey = o.subtitleKey
            if (o.intValue !== undefined) r.intValue = o.intValue
            if (o.volume !== undefined) r.volume = o.volume
            return r
          }),
        )}`,
      )
    for (const k of ['min', 'max', 'step', 'storedUnit', 'uiUnit', 'destination', 'whereShown'] as const) {
      if (p[k] !== undefined) m.push(`${k}: ${JSON.stringify(p[k])}`)
    }
    if (p.valueList) m.push(`valueList: ${JSON.stringify(p.valueList)}`)
    m.push(
      `screens: [${p.screens
        .map(
          (s) =>
            `{ screen: '${s.screen}', group: ${JSON.stringify(s.groupTitleKey)}, order: ${s.order}, visibleWhen: ${visibility(s.visibleWhen)} }`,
        )
        .join(', ')}]`,
    )
    L.push(`  { ${m.join(', ')} },`)
  }
  L.push(']')
  L.push('')
  L.push('/** Settings screens and their group order (string keys). */')
  L.push(`export const PREFERENCE_SCREENS = ${JSON.stringify(spec.screens, null, 2)} as const`)
  L.push('')
  L.push('/** Upstream preferences dropped on the web (not part of Preferences). */')
  L.push('export const ANDROID_ONLY_PREFERENCES: readonly { id: string; reason: string }[] = [')
  for (const p of android) L.push(`  { id: ${JSON.stringify(p.id)}, reason: ${JSON.stringify(p.classificationNote ?? '')} },`)
  L.push(']')
  L.push('')
  return L.join('\n')
}

function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const spec = JSON.parse(readFileSync(resolve(root, 'docs/spec/preferences.json'), 'utf8'))
  writeFileSync(resolve(root, 'src/stores/preferences.gen.ts'), generate(spec))
  console.log('gen-preferences: wrote src/stores/preferences.gen.ts')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
