// The order of Settings on the web (owner request): a short first screen of quick rows and nine subjects, each
// subject a list of its own. Upstream sorts the same rows into "Settings" and "Advanced Settings" by how often a TV
// user needs them, which spreads one subject over several screens (subtitles over three). No row is removed: every
// row of upstream's Settings, Advanced, Experimental and User Profile screens that the web shows has one home here,
// except the rows that only led from one of those screens to another.
import { PREFERENCE_META, type PreferenceMeta } from '../../stores/preferences'
import { isVisible, titleKeyOf, type VisibilityContext } from './prefModel'

export const TOPIC_IDS = ['profile', 'interface', 'home', 'playback', 'subtitles', 'audio', 'video', 'screensaver', 'about'] as const
export type TopicId = (typeof TOPIC_IDS)[number]

/** Rows that are not a generated preference row: web additions and the rows of upstream's User Profile page. */
export const SPECIAL_TITLE_KEYS = {
  WebSignOut: 'web_sign_out',
  WebResetPreferences: 'web_reset_preferences',
} as const satisfies Record<string, string>
export type SpecialRowId = keyof typeof SPECIAL_TITLE_KEYS

export interface TopicSectionDef {
  /** heading above the rows; null: none (the page title says it) */
  titleKey: string | null
  rows: readonly string[]
}

export interface TopicDef {
  id: TopicId
  /** an upstream string where one fits, so the names are translated */
  titleKey: string
  sections: readonly TopicSectionDef[]
}

/**
 * The first rows of the first screen: shortcuts to rows that also have their place in a subject. In this order they
 * stand two beside each other with the slider across both columns (SettingsHome).
 */
export const QUICK_ROWS: readonly string[] = ['ThemeColors', 'UserInterfaceLanguage', 'WebInterfaceScale', 'SubtitleStyle', 'CustomizeHome']

export const TOPICS: readonly TopicDef[] = [
  { id: 'profile', titleKey: 'profile', sections: [{ titleKey: null, rows: ['ProtectProfilePreference', 'SignInAuto', 'QuickConnect', 'WebSignOut'] }] },
  {
    id: 'interface',
    titleKey: 'ui_interface',
    sections: [
      {
        titleKey: null,
        rows: [
          'ThemeColors',
          'WebInterfaceScale',
          'UserInterfaceLanguage',
          'BackdropStylePref',
          'ShowClock',
          'ShowLogos',
          'DisplayTogglesPref',
          'ManageMedia',
          'RememberSelectedTab',
          'PlayThemeMusic',
        ],
      },
    ],
  },
  { id: 'home', titleKey: 'home', sections: [{ titleKey: null, rows: ['CustomizeHome', 'UserPinnedNavDrawerItems', 'SeerrIntegration'] }] },
  {
    id: 'playback',
    titleKey: 'playback',
    sections: [
      {
        titleKey: null,
        rows: [
          'SkipForward',
          'SkipBack',
          'SkipBackOnResume',
          'OneClickPause',
          'ControllerTimeout',
          'WebPlayerDimVideo',
          'GlobalContentScale',
          'DpadSeekModePref',
          'CinemaMode',
          'SkipSegments',
        ],
      },
      { titleKey: 'next_up', rows: ['ShowNextUpTiming', 'AutoPlayNextUp', 'AutoPlayNextDelay', 'PassOutProtection'] },
    ],
  },
  {
    id: 'subtitles',
    titleKey: 'subtitles',
    sections: [{ titleKey: null, rows: ['PreferredSubtitleLang', 'SubtitleModePref', 'SubtitleStyle', 'AssSubtitleMode', 'DirectPlayPgs'] }],
  },
  {
    id: 'audio',
    titleKey: 'audio',
    sections: [
      { titleKey: null, rows: ['PreferredAudioLang', 'DownMixStereo', 'Ac3Supported'] },
      // shown once "Experimental settings" (About) is on, as upstream shows its Experimental screen
      { titleKey: 'experimental_settings', rows: ['PreferAc3ForSurround'] },
    ],
  },
  { id: 'video', titleKey: 'video', sections: [{ titleKey: null, rows: ['MaxBitrate', 'MaxResolutionPref', 'DecodeAv1', 'HdrFormatSettings'] }] },
  {
    id: 'screensaver',
    titleKey: 'screensaver',
    sections: [
      { titleKey: null, rows: ['ScreensaverSettings'] },
      { titleKey: 'photos', rows: ['SlideshowDuration', 'SlideshowPlayVideos'] },
    ],
  },
  {
    id: 'about',
    titleKey: 'about',
    sections: [
      {
        titleKey: null,
        rows: ['InstalledVersion', 'OssLicenseInfo', 'PlaybackDebugInfo', 'DebugLogging', 'SendAppLogs', 'ClearImageCache', 'ExperimentalEnable', 'WebResetPreferences'],
      },
    ],
  },
]

/**
 * Upstream rows that only lead from one of the regrouped screens to another: they have no place in the new order.
 * (The screens they led to are subjects now.)
 */
export const NAVIGATION_ONLY: readonly string[] = ['AdvancedSettings', 'UserProfileSettings', 'ExperimentalSettings']

/** The upstream screens whose rows are regrouped into subjects. */
export const REGROUPED_SCREENS: readonly string[] = ['BASIC', 'ADVANCED', 'EXPERIMENTAL', 'USER_PROFILE']

const META = new Map<string, PreferenceMeta>(PREFERENCE_META.map((m) => [m.id, m]))
const gate = META.get('ExperimentalSettings')?.screens.find((s) => s.screen === 'ADVANCED')

export type TopicRow = { id: string; meta: PreferenceMeta | null; titleKey: string }

export interface TopicSection {
  titleKey: string | null
  rows: TopicRow[]
}

/** `data-pref-id` of a subject's row on the first screen (focus is remembered by it, like any row). */
export const topicRowId = (id: TopicId) => `Topic-${id}`

export function topicFromParam(param: string | undefined): TopicDef | null {
  return TOPICS.find((t) => t.id === param) ?? null
}

/** The row behind an id, or null when it is not shown now (the upstream condition of its screen entry). */
export function resolveRow(id: string, ctx: VisibilityContext): TopicRow | null {
  if (id in SPECIAL_TITLE_KEYS) return { id, meta: null, titleKey: SPECIAL_TITLE_KEYS[id as SpecialRowId] }
  const meta = META.get(id)
  if (!meta) return null
  const entry = meta.screens.find((s) => REGROUPED_SCREENS.includes(s.screen))
  if (entry && !isVisible(entry, ctx)) return null
  // upstream reaches the experimental rows through a link that only shows while experimental settings are on
  if (entry?.screen === 'EXPERIMENTAL' && gate && !isVisible(gate, ctx)) return null
  return { id, meta, titleKey: titleKeyOf(meta) ?? id }
}

export function buildRows(ids: readonly string[], ctx: VisibilityContext): TopicRow[] {
  return ids.map((id) => resolveRow(id, ctx)).filter((r): r is TopicRow => r !== null)
}

/** The sections of a subject with the rows shown now; empty sections are dropped. */
export function buildTopic(topic: TopicDef, ctx: VisibilityContext): TopicSection[] {
  return topic.sections.map((s) => ({ titleKey: s.titleKey, rows: buildRows(s.rows, ctx) })).filter((s) => s.rows.length > 0)
}

/** Title keys of the rows of a subject (the first `count`): the list under its name on the first screen. */
export function topicPreview(topic: TopicDef, ctx: VisibilityContext, count = Infinity): string[] {
  return buildTopic(topic, ctx)
    .flatMap((s) => s.rows)
    .slice(0, count)
    .map((r) => r.titleKey)
}
