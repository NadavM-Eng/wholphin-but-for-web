// Ported from T/services/StreamChoiceServiceTest.kt, T/test/TestSeriesTrackChoice.kt and
// T/data/model/RelativeMediaStreamTest.kt (the parts that do not depend on Room/mockk).
import type { MediaStream, SubtitlePlaybackMode } from '@jellyfin/sdk/lib/generated-client/models'
import { describe, expect, it } from 'vitest'
import {
  asRelative,
  chooseAudioStream,
  chooseSource,
  chooseSubtitleStream,
  getRelativeIndex,
  type ChoicePrefs,
  type ItemPlayback,
  type SeriesTrackChoice,
  TrackFlag,
  TrackIndex,
  USE_USER_PROFILE,
} from './streamChoice'

function subtitle(
  index: number,
  lang: string | null,
  o: { default?: boolean; forced?: boolean; sdh?: boolean; external?: boolean; title?: string | null } = {},
): MediaStream {
  return {
    Type: 'Subtitle',
    Language: lang,
    IsDefault: o.default ?? false,
    IsForced: o.forced ?? false,
    IsHearingImpaired: o.sdh ?? false,
    IsInterlaced: false,
    Index: index,
    IsExternal: o.external ?? false,
    IsTextSubtitleStream: true,
    SupportsExternalStream: true,
    Title: o.title ?? null,
  }
}
const sub = (index: number, lang: string | null, def = false) => subtitle(index, lang, { default: def })

function audio(index: number, lang: string | null, o: { default?: boolean; title?: string | null; channels?: number } = {}): MediaStream {
  return {
    Type: 'Audio',
    Language: lang,
    IsDefault: o.default ?? false,
    IsForced: false,
    IsHearingImpaired: false,
    Index: index,
    IsExternal: false,
    Title: o.title ?? null,
    Channels: o.channels,
  }
}

const itemPlayback = (o: { audioIndex?: number; subtitleIndex?: number } = {}): ItemPlayback => ({
  itemId: 'item',
  sourceId: 'source',
  audioIndex: o.audioIndex ?? TrackIndex.UNSPECIFIED,
  subtitleIndex: o.subtitleIndex ?? TrackIndex.UNSPECIFIED,
})

function plc(o: { subtitleLang?: string; subtitlesDisabled?: boolean; subtitlesOnlyForced?: boolean }): SeriesTrackChoice[] {
  const base = { parentId: 'p', type: 'SUBTITLE' as const, parentType: 'UNKNOWN' as const, trackFlags: 0 }
  if (o.subtitleLang != null) return [{ ...base, language: o.subtitleLang, activation: 'ACTIVATED' }]
  if (o.subtitlesDisabled) return [{ ...base, activation: 'DISABLED' }]
  if (o.subtitlesOnlyForced) return [{ ...base, activation: 'ONLY_FORCED' }]
  return []
}

interface TestInput {
  expected: number | null
  mode: SubtitlePlaybackMode | null
  userAudioLang?: string | null
  userSubtitleLang?: string | null
  streamAudioLang?: string | null
  subtitles: MediaStream[]
  itemPlayback?: ItemPlayback | null
  plc?: SeriesTrackChoice[]
  appSubtitleLang?: string
}

function run(input: TestInput) {
  const userConfig = {
    AudioLanguagePreference: input.userAudioLang === undefined ? 'eng' : input.userAudioLang,
    SubtitleMode: input.mode ?? 'Default',
    SubtitleLanguagePreference: input.userSubtitleLang === undefined ? 'eng' : input.userSubtitleLang,
  }
  const prefs: ChoicePrefs = {
    preferredAudioLanguage: USE_USER_PROFILE,
    preferredSubtitleLanguage: input.appSubtitleLang ?? USE_USER_PROFILE,
    subtitleMode: 'USE_USER_PROFILE',
  }
  const r = chooseSubtitleStream(
    input.streamAudioLang === undefined ? 'eng' : input.streamAudioLang,
    input.subtitles,
    input.itemPlayback ?? null,
    input.plc ?? [],
    prefs,
    userConfig,
  )
  return r.stream?.Index ?? null
}

const cases: Record<string, TestInput[]> = {
  StreamChoiceServiceTest: [
    { expected: null, mode: 'None', subtitles: [sub(0, 'eng', true), sub(1, 'spa')] },
    { expected: 1, mode: 'None', subtitles: [sub(0, 'eng', true), sub(1, 'spa')], plc: plc({ subtitleLang: 'spa' }) },
    { expected: 0, mode: 'Always', subtitles: [sub(0, 'eng', true), sub(1, 'spa')] },
    { expected: 1, mode: 'Always', subtitles: [sub(0, 'eng', true), sub(1, 'spa')], userSubtitleLang: 'spa' },
    { expected: null, mode: 'Always', subtitles: [sub(0, 'eng', true), sub(1, 'spa')], plc: plc({ subtitlesDisabled: true }) },
    {
      expected: null,
      mode: 'Always',
      subtitles: [sub(0, 'eng', true), sub(1, 'spa')],
      itemPlayback: itemPlayback({ subtitleIndex: TrackIndex.DISABLED }),
    },
    {
      expected: 0,
      mode: 'Always',
      subtitles: [sub(0, 'eng', true), sub(1, 'spa')],
      itemPlayback: itemPlayback({ subtitleIndex: TrackIndex.UNSPECIFIED }),
    },
    {
      expected: 1,
      mode: 'Always',
      userSubtitleLang: 'eng',
      subtitles: [subtitle(0, 'eng', { default: true, forced: true }), subtitle(1, 'eng')],
    },
    {
      expected: 1,
      mode: 'Always',
      userSubtitleLang: null,
      subtitles: [subtitle(0, 'eng', { default: true, forced: true }), subtitle(1, 'eng')],
    },
    {
      expected: 0,
      mode: 'Smart',
      userSubtitleLang: 'eng',
      subtitles: [subtitle(0, 'eng', { default: true, forced: true }), subtitle(1, 'eng')],
    },
    {
      expected: 0,
      mode: 'OnlyForced',
      userSubtitleLang: 'eng',
      subtitles: [subtitle(0, 'eng', { default: true, forced: true }), subtitle(1, 'eng')],
    },
    {
      expected: null,
      mode: 'None',
      userSubtitleLang: 'eng',
      subtitles: [subtitle(0, 'eng', { default: true, forced: true }), subtitle(1, 'eng')],
    },
  ],
  Default: [
    { expected: 0, mode: 'Default', subtitles: [sub(0, 'eng', true), sub(1, 'spa')] },
    { expected: 0, mode: 'Default', subtitles: [sub(0, 'eng', true), sub(1, 'spa')], userSubtitleLang: null },
    { expected: 0, mode: 'Default', subtitles: [sub(0, 'eng', true), sub(1, 'spa', true)], userSubtitleLang: null },
    { expected: 1, mode: 'Default', subtitles: [sub(0, 'eng'), sub(1, 'spa', true)], userSubtitleLang: null },
    { expected: null, mode: 'Default', subtitles: [sub(0, 'eng'), sub(1, 'spa')] },
    { expected: 0, mode: 'Default', subtitles: [subtitle(0, 'eng', { forced: true }), sub(1, 'spa')] },
    { expected: 1, mode: 'Default', subtitles: [sub(0, 'eng', true), sub(1, 'spa')], itemPlayback: itemPlayback({ subtitleIndex: 1 }) },
    { expected: 1, mode: 'Default', subtitles: [subtitle(0, 'eng', { forced: true }), sub(1, 'spa')], plc: plc({ subtitleLang: 'spa' }) },
    { expected: 1, mode: 'Default', subtitles: [sub(0, 'eng', true), sub(1, 'spa')], plc: plc({ subtitleLang: 'spa' }) },
    { expected: null, mode: 'Default', subtitles: [sub(0, 'eng', true), sub(1, 'spa')], plc: plc({ subtitlesDisabled: true }) },
  ],
  Smart: [
    { expected: 0, mode: 'Smart', subtitles: [sub(0, 'eng', true), sub(1, 'spa')], streamAudioLang: null },
    { expected: null, mode: 'Smart', subtitles: [sub(0, 'eng', true), sub(1, 'spa')], streamAudioLang: 'eng' },
    { expected: null, mode: 'Smart', subtitles: [sub(0, 'eng'), sub(1, 'spa')] },
    { expected: null, mode: 'Smart', subtitles: [sub(0, 'eng'), sub(1, 'spa')], streamAudioLang: 'eng' },
    { expected: 0, mode: 'Smart', userSubtitleLang: 'eng', subtitles: [sub(0, 'eng'), sub(1, 'spa')], streamAudioLang: 'spa' },
    { expected: 0, mode: 'Smart', subtitles: [subtitle(0, 'eng', { forced: true }), sub(1, 'spa')], streamAudioLang: 'eng' },
    { expected: 1, mode: 'Smart', subtitles: [sub(0, 'eng'), sub(1, 'spa')], streamAudioLang: 'spa', plc: plc({ subtitleLang: 'spa' }) },
    { expected: null, mode: 'Smart', subtitles: [sub(0, 'eng'), sub(1, 'spa')], streamAudioLang: 'spa', plc: plc({ subtitlesDisabled: true }) },
    {
      expected: 1,
      mode: 'Smart',
      subtitles: [sub(0, 'eng', true), sub(1, 'spa')],
      streamAudioLang: 'eng',
      userSubtitleLang: 'spa',
      userAudioLang: 'spa',
    },
    {
      expected: null,
      mode: 'Smart',
      subtitles: [sub(0, 'eng', true), sub(1, 'spa')],
      streamAudioLang: 'eng',
      userSubtitleLang: 'spa',
      userAudioLang: 'eng',
    },
    {
      expected: 1,
      mode: 'Smart',
      subtitles: [sub(0, 'eng'), sub(1, 'spa')],
      streamAudioLang: 'eng',
      userSubtitleLang: 'spa',
      userAudioLang: null,
    },
    {
      expected: null,
      mode: 'Smart',
      subtitles: [sub(0, 'eng'), sub(1, 'eng', true), sub(2, 'spa')],
      streamAudioLang: 'eng',
      userSubtitleLang: 'eng',
      userAudioLang: null,
    },
    {
      expected: null,
      mode: 'Smart',
      subtitles: [sub(0, 'eng'), sub(1, 'spa')],
      streamAudioLang: 'spa',
      userSubtitleLang: 'spa',
      userAudioLang: null,
    },
  ],
  OnlyForced: [
    { expected: null, mode: 'OnlyForced', subtitles: [sub(0, 'eng'), sub(1, 'spa')], streamAudioLang: 'eng' },
    {
      expected: 1,
      mode: 'OnlyForced',
      subtitles: [sub(0, 'eng'), sub(1, 'spa')],
      streamAudioLang: 'eng',
      itemPlayback: itemPlayback({ subtitleIndex: 1 }),
    },
    { expected: 0, mode: 'OnlyForced', subtitles: [sub(0, 'eng'), sub(1, 'spa')], streamAudioLang: 'eng', plc: plc({ subtitleLang: 'eng' }) },
    { expected: null, mode: 'OnlyForced', subtitles: [sub(0, 'eng'), sub(1, 'spa')], streamAudioLang: 'eng', plc: plc({ subtitlesDisabled: true }) },
    { expected: 0, mode: 'OnlyForced', subtitles: [subtitle(0, 'eng', { forced: true }), sub(1, 'spa')], streamAudioLang: 'eng' },
    { expected: null, mode: 'OnlyForced', subtitles: [sub(0, 'eng'), subtitle(1, 'spa', { forced: true })], streamAudioLang: 'eng' },
    {
      expected: 1,
      mode: 'OnlyForced',
      userSubtitleLang: null,
      subtitles: [sub(0, 'eng'), subtitle(1, 'spa', { forced: true })],
      streamAudioLang: 'eng',
    },
    {
      expected: 0,
      mode: 'None',
      userSubtitleLang: null,
      subtitles: [subtitle(0, 'eng', { forced: true }), sub(1, 'spa')],
      streamAudioLang: 'eng',
      plc: plc({ subtitlesOnlyForced: true }),
    },
    {
      expected: 0,
      mode: 'Default',
      userSubtitleLang: null,
      subtitles: [subtitle(0, 'eng', { forced: true }), subtitle(1, 'spa', { forced: true })],
      streamAudioLang: 'eng',
      plc: plc({ subtitlesOnlyForced: true }),
    },
    {
      expected: 0,
      mode: 'Default',
      userSubtitleLang: 'eng',
      subtitles: [subtitle(0, 'eng', { forced: true }), sub(1, 'spa')],
      streamAudioLang: 'eng',
      plc: plc({ subtitlesOnlyForced: true }),
    },
    {
      expected: null,
      mode: 'None',
      userSubtitleLang: null,
      subtitles: [sub(0, 'eng'), sub(1, 'spa')],
      streamAudioLang: 'eng',
      plc: plc({ subtitlesOnlyForced: true }),
    },
  ],
  MultipleChoices: [
    { expected: 1, mode: 'Always', subtitles: [subtitle(0, 'eng', { forced: true, default: true }), sub(1, 'eng'), sub(2, 'eng')] },
    { expected: 2, mode: 'Always', subtitles: [subtitle(0, 'eng', { forced: true }), sub(1, 'eng'), sub(2, 'eng', true)] },
    { expected: 0, mode: 'Smart', subtitles: [subtitle(0, 'eng', { forced: true }), sub(1, 'eng'), sub(2, 'eng', true)], userAudioLang: null },
    {
      expected: 2,
      mode: 'Smart',
      subtitles: [subtitle(0, 'eng', { forced: true }), sub(1, 'eng'), sub(2, 'eng', true)],
      userSubtitleLang: null,
      userAudioLang: null,
    },
    {
      expected: null,
      mode: 'Smart',
      subtitles: [subtitle(0, 'eng', { forced: true }), sub(1, 'eng'), sub(2, 'eng', true)],
      userSubtitleLang: 'spa',
      userAudioLang: null,
    },
    {
      expected: 2,
      mode: 'Smart',
      subtitles: [subtitle(0, 'eng', { forced: true, default: true }), sub(1, 'eng'), sub(2, 'eng', true)],
      userSubtitleLang: 'eng',
      userAudioLang: null,
      streamAudioLang: 'spa',
    },
    {
      expected: 0,
      mode: 'Smart',
      subtitles: [subtitle(0, 'eng', { forced: true, default: true }), sub(1, 'eng'), sub(2, 'eng', true)],
      userSubtitleLang: 'eng',
      userAudioLang: 'eng',
      streamAudioLang: 'eng',
    },
    {
      expected: null,
      mode: 'Smart',
      subtitles: [subtitle(0, 'eng', { forced: true }), sub(1, 'eng'), sub(2, 'eng', true)],
      userSubtitleLang: 'spa',
      userAudioLang: 'eng',
      streamAudioLang: 'spa',
    },
    {
      expected: 0,
      mode: 'Smart',
      subtitles: [subtitle(0, 'spa', { forced: true }), sub(1, 'spa'), sub(2, 'spa', true)],
      userSubtitleLang: 'spa',
      userAudioLang: 'eng',
      streamAudioLang: 'eng',
    },
    {
      expected: 2,
      mode: 'Smart',
      subtitles: [subtitle(0, 'spa', { forced: true }), sub(1, 'spa'), sub(2, 'spa', true)],
      userSubtitleLang: 'spa',
      userAudioLang: '',
      streamAudioLang: 'eng',
    },
    {
      expected: 2,
      mode: 'Default',
      subtitles: [subtitle(0, 'eng', { forced: true }), sub(1, 'eng'), sub(2, 'eng', true)],
      userSubtitleLang: null,
      userAudioLang: null,
    },
  ],
  OnlyForcedClientOverride: [
    {
      expected: 1,
      mode: null,
      userSubtitleLang: 'spa',
      subtitles: [subtitle(0, 'eng', { forced: true }), subtitle(1, 'spa', { forced: true })],
      itemPlayback: itemPlayback({ subtitleIndex: TrackIndex.ONLY_FORCED }),
    },
    {
      expected: 0,
      mode: null,
      userSubtitleLang: 'eng',
      subtitles: [subtitle(0, 'eng', { title: 'Signs & Songs' }), subtitle(1, 'spa', { forced: true })],
      streamAudioLang: 'jpn',
      itemPlayback: itemPlayback({ subtitleIndex: TrackIndex.ONLY_FORCED }),
    },
    {
      expected: 0,
      mode: null,
      userSubtitleLang: 'spa',
      subtitles: [subtitle(0, 'eng', { forced: true }), subtitle(1, 'und', { forced: true })],
      itemPlayback: itemPlayback({ subtitleIndex: TrackIndex.ONLY_FORCED }),
    },
    {
      expected: 0,
      mode: null,
      userSubtitleLang: 'fre',
      subtitles: [subtitle(0, 'eng', { title: 'Signs & Songs' }), subtitle(1, 'spa', { forced: true })],
      itemPlayback: itemPlayback({ subtitleIndex: TrackIndex.ONLY_FORCED }),
    },
    {
      expected: 0,
      mode: null,
      userSubtitleLang: null,
      subtitles: [subtitle(0, 'eng', { title: 'Signs & Songs' }), subtitle(1, 'spa', { forced: true })],
      itemPlayback: itemPlayback({ subtitleIndex: TrackIndex.ONLY_FORCED }),
    },
    {
      expected: 0,
      mode: null,
      userSubtitleLang: null,
      subtitles: [subtitle(0, null, { forced: true }), sub(1, 'spa')],
      itemPlayback: itemPlayback({ subtitleIndex: TrackIndex.ONLY_FORCED }),
    },
    {
      expected: 0,
      mode: null,
      userSubtitleLang: null,
      subtitles: [subtitle(0, 'und', { forced: true }), sub(1, 'spa')],
      itemPlayback: itemPlayback({ subtitleIndex: TrackIndex.ONLY_FORCED }),
    },
    {
      expected: null,
      mode: null,
      userSubtitleLang: 'eng',
      subtitles: [subtitle(0, 'chi', { forced: true }), subtitle(1, 'spa', { forced: true })],
      itemPlayback: itemPlayback({ subtitleIndex: TrackIndex.ONLY_FORCED }),
    },
  ],
  AppPreferences: [
    { expected: 1, mode: 'Always', userSubtitleLang: 'spa', subtitles: [sub(0, 'eng', true), sub(1, 'spa')], appSubtitleLang: USE_USER_PROFILE },
    { expected: 0, mode: 'Always', userSubtitleLang: 'spa', subtitles: [sub(0, 'eng', true), sub(1, 'spa')], appSubtitleLang: 'eng' },
    { expected: 1, mode: 'Always', userSubtitleLang: 'spa', subtitles: [sub(0, 'eng', true), sub(1, 'spa')], appSubtitleLang: 'spa' },
    {
      expected: 1,
      mode: 'Always',
      userSubtitleLang: 'spa',
      subtitles: [sub(0, 'eng', true), sub(1, 'spa')],
      itemPlayback: itemPlayback({ subtitleIndex: 1 }),
      appSubtitleLang: 'spa',
    },
  ],
}

describe('chooseSubtitleStream (StreamChoiceServiceTest)', () => {
  for (const [group, list] of Object.entries(cases)) {
    list.forEach((c, i) => {
      it(`${group} #${i}: mode=${c.mode} -> ${c.expected}`, () => {
        expect(run(c)).toBe(c.expected)
      })
    })
  }
})

// TestSeriesTrackChoice.kt: user prefs are null there (UserPreferences(app, null)) -> mode DEFAULT, no language.
describe('series track choices (TestSeriesTrackChoice)', () => {
  const cfg = { AudioLanguagePreference: 'eng', SubtitleLanguagePreference: 'eng', SubtitleMode: 'Default' as const }
  const stc = (o: Partial<SeriesTrackChoice> & Pick<SeriesTrackChoice, 'parentType' | 'type'>): SeriesTrackChoice => ({
    parentId: o.parentType === 'SERIES' ? 'series' : 'season1',
    activation: 'ACTIVATED',
    trackFlags: 0,
    ...o,
  })

  it('series disabled', () => {
    const r = chooseSubtitleStream('eng', [sub(0, 'eng', true), sub(1, 'spa')], null, [stc({ parentType: 'SERIES', type: 'SUBTITLE', activation: 'DISABLED' })], null, cfg)
    expect(r.stream).toBeNull()
  })

  it('series only forced', () => {
    const prefs: ChoicePrefs = { preferredAudioLanguage: '', preferredSubtitleLanguage: '', subtitleMode: 'USE_USER_PROFILE' }
    const r = chooseSubtitleStream(
      'eng',
      [subtitle(0, 'eng', { forced: true }), subtitle(1, 'eng')],
      null,
      [stc({ parentType: 'SERIES', type: 'SUBTITLE', activation: 'ONLY_FORCED' })],
      prefs,
      { ...cfg, SubtitleMode: 'None' },
    )
    expect(r.stream?.Index).toBe(0)
    expect(r.reason.kind).toBe('Series')
  })

  it('series disabled with season', () => {
    const r = chooseSubtitleStream(
      'eng',
      [sub(0, 'eng', true), sub(1, 'spa')],
      null,
      [stc({ parentType: 'SERIES', type: 'SUBTITLE', activation: 'DISABLED' }), stc({ parentType: 'SEASON', type: 'SUBTITLE', activation: 'DISABLED' })],
      null,
      cfg,
    )
    expect(r.stream).toBeNull()
    expect(r.reason.kind).toBe('Series')
  })

  it('item playback overrides STC for subtitles', () => {
    const r = chooseSubtitleStream(
      'eng',
      [sub(0, 'eng', true), sub(1, 'spa')],
      itemPlayback({ subtitleIndex: 1 }),
      [stc({ parentType: 'SERIES', type: 'SUBTITLE', activation: 'DISABLED' })],
      null,
      cfg,
    )
    expect(r.stream?.Index).toBe(1)
    expect(r.reason.kind).toBe('Item')
  })

  it('item playback overrides STC for audio', () => {
    const r = chooseAudioStream(
      [audio(0, 'eng', { default: true }), audio(1, 'spa')],
      itemPlayback({ audioIndex: 1 }),
      [stc({ parentType: 'SERIES', type: 'AUDIO', language: 'eng' }), stc({ parentType: 'SEASON', type: 'AUDIO', language: 'eng' })],
      null,
      cfg,
    )
    expect(r.stream?.Index).toBe(1)
    expect(r.reason.kind).toBe('Item')
  })

  it("season STC doesn't apply but series STC does - subtitle", () => {
    const r = chooseSubtitleStream(
      'eng',
      [sub(0, 'eng', true), sub(1, 'spa')],
      itemPlayback({ audioIndex: 1 }),
      [
        stc({ parentType: 'SEASON', type: 'SUBTITLE', activation: 'ONLY_FORCED' }),
        stc({ parentType: 'SERIES', type: 'SUBTITLE', language: 'spa' }),
      ],
      null,
      cfg,
    )
    expect(r.stream?.Index).toBe(1)
    expect(r.reason.kind).toBe('Series')
  })

  it("season STC doesn't apply but series STC does - audio", () => {
    // Upstream calls chooseSubtitleStream with audio candidates here; kept as-is.
    const r = chooseSubtitleStream(
      'eng',
      [audio(0, 'eng', { default: true }), audio(1, 'spa')],
      null,
      [stc({ parentType: 'SEASON', type: 'AUDIO', activation: 'ONLY_FORCED' }), stc({ parentType: 'SERIES', type: 'AUDIO', language: 'spa' })],
      null,
      cfg,
    )
    expect(r.stream?.Index).toBe(1)
    expect(r.reason.kind).toBe('Series')
  })

  it('STC has forced flag', () => {
    const choice = [stc({ parentType: 'SEASON', type: 'SUBTITLE', trackFlags: TrackFlag.FORCED })]
    const a = chooseSubtitleStream('eng', [subtitle(0, 'eng', { default: true, forced: true }), sub(1, 'spa')], null, choice, null, cfg)
    expect(a.stream?.Index).toBe(0)
    expect(a.reason.kind).toBe('Season')
    const b = chooseSubtitleStream('eng', [subtitle(0, 'eng'), sub(1, 'spa')], null, choice, null, cfg)
    expect(b.stream).toBeNull()
  })

  it('prefer SDH', () => {
    const choice = [stc({ parentType: 'SEASON', type: 'SUBTITLE', trackFlags: TrackFlag.SDH })]
    const a = chooseSubtitleStream(
      'eng',
      [subtitle(0, 'eng', { default: true, forced: true }), subtitle(1, 'eng'), subtitle(2, 'eng', { sdh: true })],
      null,
      choice,
      null,
      cfg,
    )
    expect(a.stream?.Index).toBe(2)
    expect(a.reason.kind).toBe('Season')
    const b = chooseSubtitleStream('eng', [subtitle(0, 'eng', { default: true, forced: true }), subtitle(1, 'eng')], null, choice, null, cfg)
    expect(b.stream?.Index).toBe(1)
  })

  it('prefer default track with no other flags', () => {
    const choice = [stc({ parentType: 'SEASON', type: 'SUBTITLE' })]
    expect(chooseSubtitleStream('eng', [sub(0, 'eng', true), sub(1, 'eng')], null, choice, null, cfg).stream?.Index).toBe(0)
    expect(chooseSubtitleStream('eng', [sub(0, 'eng'), sub(1, 'eng', true)], null, choice, null, cfg).stream?.Index).toBe(1)
  })
})

describe('chooseAudioStream defaults', () => {
  const prefs: ChoicePrefs = { preferredAudioLanguage: 'jpn', preferredSubtitleLanguage: '', subtitleMode: 'USE_USER_PROFILE' }
  it('preferred language + default wins, then language, then default, then first', () => {
    const streams = [audio(1, 'eng', { default: true }), audio(2, 'jpn', { channels: 2 }), audio(3, 'jpn', { channels: 6 })]
    expect(chooseAudioStream(streams, null, [], prefs, null).stream?.Index).toBe(3)
    expect(chooseAudioStream([audio(1, 'eng', { default: true }), audio(2, 'fre')], null, [], prefs, null).stream?.Index).toBe(1)
    expect(chooseAudioStream([audio(1, 'eng'), audio(2, 'fre')], null, [], prefs, null).stream?.Index).toBe(1)
  })
  it('item index that is missing gives null without fallback', () => {
    const r = chooseAudioStream([audio(1, 'eng')], itemPlayback({ audioIndex: 7 }), [], prefs, null)
    expect(r.stream).toBeNull()
    expect(r.reason.kind).toBe('Item')
  })
  it('STC scoring prefers matching channels', () => {
    const choice: SeriesTrackChoice = { parentId: 's', parentType: 'SERIES', type: 'AUDIO', activation: 'ACTIVATED', trackFlags: 0, language: 'eng', audioChannels: 6 }
    const r = chooseAudioStream([audio(1, 'eng', { channels: 2 }), audio(2, 'eng', { channels: 6 }), audio(3, 'jpn', { channels: 6 })], null, [choice], null, null)
    expect(r.stream?.Index).toBe(2)
  })
})

describe('sources', () => {
  it('chooses the remembered source, else the largest video', () => {
    const s = (id: string, w: number, h: number) => ({ Id: id, MediaStreams: [{ Type: 'Video' as const, Width: w, Height: h }] })
    const sources = [s('a', 1280, 720), s('b', 3840, 2160), s('c', 1920, 1080)]
    expect(chooseSource(sources, null)?.Id).toBe('b')
    expect(chooseSource(sources, { sourceId: 'c' })?.Id).toBe('c')
    expect(chooseSource(sources, { sourceId: 'zzz' })?.Id).toBe('b')
  })
})

describe('relative indexes (RelativeMediaStreamTest)', () => {
  it('groups by type and external flag', () => {
    const streams: MediaStream[] = [
      subtitle(0, 'eng', { external: true }),
      subtitle(1, 'eng', { external: true }),
      { Type: 'Video', Index: 2 },
      audio(3, 'eng'),
      audio(4, 'jpn'),
      subtitle(5, 'eng'),
      subtitle(6, 'jpn'),
    ]
    expect(asRelative(streams).map((r) => [r.stream.Index, r.relativeIndex])).toEqual([
      [0, 0],
      [1, 1],
      [2, 0],
      [3, 0],
      [4, 1],
      [5, 0],
      [6, 1],
    ])
    expect(getRelativeIndex(streams[6], streams)).toBe(1)
    expect(getRelativeIndex(streams[1], streams)).toBe(1)
  })
})
