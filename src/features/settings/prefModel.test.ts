import { describe, expect, it } from 'vitest'
import { PREFERENCE_DEFAULTS, PREFERENCE_META, type PreferenceMeta } from '../../stores/preferences'
import { filterLanguages, languageOptions, optionLabel, PREFER_ANY_LANGUAGE, selectedLanguage } from './languageOptions'
import { pinCharForKey } from './pinKeys'
import {
  buildScreen,
  destinationPath,
  keyFor,
  kotlinDuration,
  optionIndex,
  relaysOutPage,
  rowSummary,
  screenFromParam,
  sliderSpec,
  sliderSummary,
  validate,
  type Translate,
  type VisibilityContext,
} from './prefModel'
import { rgba } from './subtitleStyle'

const meta = (id: string): PreferenceMeta => PREFERENCE_META.find((m) => m.id === id)!
const t = ((key: string, o?: Record<string, unknown>) => (o ? `${key}:${JSON.stringify(o)}` : key)) as unknown as Translate
const ctx = (over: Partial<VisibilityContext> = {}): VisibilityContext => ({
  prefs: PREFERENCE_DEFAULTS,
  discover: true,
  hdrDisplay: false,
  hdrPage: false,
  ...over,
})
const ids = (screen: Parameters<typeof buildScreen>[0], c = ctx()) =>
  buildScreen(screen, c).map((g) => `${g.titleKey}: ${g.entries.map((e) => e.id).join(',')}`)

describe('settings screens', () => {
  it('BASIC follows upstream order with android-only rows dropped and the web scale appended', () => {
    expect(ids('BASIC')).toEqual([
      'ui_interface: SignInAuto,RememberSelectedTab,PlayThemeMusic,SubtitleStyle,ThemeColors,ScreensaverSettings,WebInterfaceScale',
      'playback: SkipForward,SkipBack,SkipBackOnResume',
      'next_up: ShowNextUpTiming,AutoPlayNextUp,AutoPlayNextDelay,PassOutProtection',
      'profile_specific_settings: ProtectProfilePreference,CustomizeHome,UserPinnedNavDrawerItems,UserInterfaceLanguage,UserProfileSettings',
      'about: InstalledVersion',
      'more: SeerrIntegration,AdvancedSettings',
    ])
  })

  it('ADVANCED shows the single web backend group inline and gates the experimental link', () => {
    const off = ids('ADVANCED')
    expect(off.find((g) => g.startsWith('player_backend'))).toBe(
      'player_backend: DownMixStereo,Ac3Supported,AssSubtitleMode,DirectPlayPgs,DecodeAv1,HdrFormatSettings',
    )
    expect(off.some((g) => g.startsWith('updates'))).toBe(false)
    expect(off.at(-1)).toBe('more: QuickConnect,SendAppLogs,DebugLogging,ClearImageCache,ExperimentalEnable,OssLicenseInfo')
    const on = ids('ADVANCED', ctx({ prefs: { ...PREFERENCE_DEFAULTS, experimentalEnable: true } }))
    expect(on.at(-1)).toContain('OssLicenseInfo,ExperimentalSettings')
  })

  it('subtitle HDR group follows the display and the toggle', () => {
    expect(ids('SUBTITLE_STYLE').some((g) => g.startsWith('hdr'))).toBe(false)
    expect(ids('SUBTITLE_STYLE', ctx({ hdrDisplay: true })).at(-1)).toBe('hdr: SubSeparateHdr')
    const sep = ctx({ hdrDisplay: true, prefs: { ...PREFERENCE_DEFAULTS, subSeparateHdr: true } })
    expect(ids('SUBTITLE_STYLE', sep).at(-1)).toBe('hdr: SubSeparateHdr,SubHdrSettings')
    expect(ids('SUBTITLE_STYLE', { ...sep, hdrPage: true }).some((g) => g.startsWith('hdr'))).toBe(false)
    expect(keyFor(meta('SubFontSize'), true)).toBe('hdrSubFontSize')
    expect(keyFor(meta('SubFontSize'), false)).toBe('subFontSize')
  })

  it('maps url params and destinations', () => {
    expect(screenFromParam(undefined)).toBe('BASIC')
    expect(screenFromParam('skip_segments')).toBe('SKIP_SEGMENTS')
    expect(screenFromParam('mpv')).toBeNull()
    expect(screenFromParam('constructor')).toBeNull()
    // upstream's Advanced, Experimental and User Profile screens are subjects of the first screen on the web
    expect(screenFromParam('advanced')).toBeNull()
    expect(destinationPath(meta('AdvancedSettings'))).toBe('/settings')
    expect(destinationPath(meta('ExperimentalSettings'))).toBe('/settings/topic/audio')
    expect(destinationPath(meta('UserProfileSettings'))).toBe('/settings/topic/profile')
    expect(destinationPath(meta('SkipSegments'))).toBe('/settings/skip_segments')
    expect(destinationPath(meta('SubHdrSettings'))).toBe('/settings/subtitles?hdr=1')
  })
})

describe('slider conversions and summaries', () => {
  it('converts stored ms to seconds and back', () => {
    const s = sliderSpec(meta('SkipForward'))
    expect(s.toUi(30_000)).toBe(30)
    expect(s.fromUi(45)).toBe(45_000)
    expect(sliderSummary(meta('SkipForward'), 30, 30_000, t)).toBe('seconds:{"count":30}')
    expect(sliderSummary(meta('SkipBackOnResume'), 0, 0, t)).toBe('disabled')
    expect(sliderSummary(meta('SkipBackOnResume'), 3, 3000, t)).toBe('3s')
    expect(sliderSummary(meta('PassOutProtection'), 2, 7_200_000, t)).toBe('hours:{"count":2}')
    expect(sliderSummary(meta('AutoPlayNextDelay'), 0, 0, t)).toBe('immediate')
  })

  it('handles index sliders with fallbacks', () => {
    const b = sliderSpec(meta('MaxBitrate'))
    expect(b.toUi(104_857_600)).toBe(17)
    expect(b.toUi(123)).toBe(17)
    expect(sliderSummary(meta('MaxBitrate'), 0, b.fromUi(0), t)).toBe('500 kbps')
    expect(sliderSummary(meta('MaxBitrate'), 22, b.fromUi(22), t)).toBe('200 Mbps')
    const age = sliderSpec(meta('ScreensaverMaxAge'))
    expect(age.toUi(-1)).toBe(8)
    expect(sliderSummary(meta('ScreensaverMaxAge'), 0, 0, t)).toBe('for_all_ages')
    expect(sliderSummary(meta('ScreensaverMaxAge'), 8, -1, t)).toBe('no_max')
    expect(sliderSummary(meta('ScreensaverMaxAge'), 5, 16, t)).toBe('up_to_age:{"p1":16}')
    expect(sliderSummary(meta('ScreensaverStartDelay'), 5, 900_000, t)).toBe('15m')
  })

  it('formats like upstream', () => {
    expect(kotlinDuration(30_000)).toBe('30s')
    expect(kotlinDuration(3_600_000)).toBe('1h')
    expect(kotlinDuration(90_000)).toBe('1m 30s')
    expect(sliderSummary(meta('SubEdgeThickness'), 4, 4, t)).toBe('2.0')
    expect(sliderSummary(meta('SubEdgeThickness'), 3, 3, t)).toBe('1.5')
    expect(sliderSummary(meta('SlideshowDuration'), 5000, 5000, t)).toBe('decimal_seconds:{"p1":"5.00"}')
  })

  it('only the interface scale re-lays out its own page: every other slider applies each step of a drag', () => {
    const marked = PREFERENCE_META.filter((m) => m.widget === 'slider' && relaysOutPage(m)).map((m) => m.id)
    expect(marked).toEqual(['WebInterfaceScale'])
    // the summary its row shows for a value that is not applied yet
    const scale = sliderSpec(meta('WebInterfaceScale'))
    expect(sliderSummary(meta('WebInterfaceScale'), 170, scale.fromUi(170), t)).toBe('web_interface_scale_summary:{"p1":170}')
  })
})

describe('choices, switches, validation', () => {
  it('matches stored values case-insensitively with first-option fallback', () => {
    const colors = meta('SubFontColor').options!
    expect(optionIndex(colors, '#ffff00')).toBe(5)
    expect(optionIndex(colors, '#123456')).toBe(0)
    expect(rowSummary(meta('ThemeColors'), 'RED', t)).toBe('red')
    expect(rowSummary(meta('DisplayTogglesPref'), [], t)).toBe('display_toggles_summary')
    expect(rowSummary(meta('PlaybackDebugInfo'), true, t)).toBe('show')
  })

  it('rejects AC3-for-surround when AC3 is off or downmixing', () => {
    const m = meta('PreferAc3ForSurround')
    expect(validate(m, { ...PREFERENCE_DEFAULTS, ac3Supported: false }, true).ok).toBe(false)
    expect(validate(m, { ...PREFERENCE_DEFAULTS, downMixStereo: true }, true).ok).toBe(false)
    expect(validate(m, PREFERENCE_DEFAULTS, true).ok).toBe(true)
    expect(validate(m, { ...PREFERENCE_DEFAULTS, ac3Supported: false }, false).ok).toBe(true)
  })
})

describe('helpers', () => {
  it('pin keys', () => {
    expect(pinCharForKey('ArrowUp')).toBe('U')
    expect(pinCharForKey('ArrowLeft')).toBe('L')
    expect(pinCharForKey('7')).toBe('7')
    expect(pinCharForKey('a')).toBeNull()
  })

  it('combines subtitle colors with opacity', () => {
    expect(rgba('#FF0000', 100)).toBe('rgb(255 0 0 / 1.000)')
    expect(rgba('#000000', 50)).toBe('rgb(0 0 0 / 0.498)')
  })

  it('preferred language options', () => {
    const cultures = [
      { DisplayName: 'English', ThreeLetterISOLanguageName: 'eng', TwoLetterISOLanguageName: 'en' },
      { DisplayName: 'Hebrew', ThreeLetterISOLanguageName: 'heb', TwoLetterISOLanguageName: 'he' },
      { DisplayName: 'Bengali', ThreeLetterISOLanguageName: 'ben' },
      { DisplayName: 'Invariant', ThreeLetterISOLanguageName: null },
    ]
    const opts = languageOptions(cultures, 'heb')
    expect(opts.map((o) => o.kind)).toEqual(['profile', 'any', 'divider', 'language', 'language', 'language'])
    expect(optionLabel(selectedLanguage(opts, ''), t)).toBe('use_user_profile - Hebrew')
    expect(optionLabel(selectedLanguage(opts, 'xyz'), t)).toBe('use_user_profile - Hebrew')
    expect(optionLabel(selectedLanguage(opts, PREFER_ANY_LANGUAGE), t)).toBe('any_language')
    expect(optionLabel(selectedLanguage(opts, 'eng'), t)).toBe('English')
    expect(filterLanguages(opts, 'en').map((o) => ('name' in o ? o.name : o.kind))).toEqual(['English', 'Bengali'])
    expect(languageOptions(undefined, 'heb')).toEqual([])
  })
})
