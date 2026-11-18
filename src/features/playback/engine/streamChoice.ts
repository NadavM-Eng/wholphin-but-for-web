// Port of W/services/StreamChoiceService.kt, W/data/model/RelativeMediaStream.kt and TrackFlag
// (W/data/model/SeriesTrackChoice.kt). Pure functions: no storage, no network. Spec 05 §2.
import type { MediaSourceInfo, MediaStream, SubtitlePlaybackMode } from '@jellyfin/sdk/lib/generated-client/models'

/** `TrackIndex` sentinels (W/data/model/ItemPlayback.kt). */
export const TrackIndex = {
  UNSPECIFIED: -1,
  DISABLED: -2,
  ONLY_FORCED: -3,
} as const

/** Remembered source/track choice for one item (upstream `ItemPlayback`). Indexes are server stream indexes or sentinels. */
export interface ItemPlayback {
  itemId: string
  sourceId: string | null
  audioIndex: number
  subtitleIndex: number
}

export type TrackChoiceType = 'AUDIO' | 'SUBTITLE'
export type TrackChoiceParentType = 'SERIES' | 'SEASON' | 'DEPRECATED' | 'UNKNOWN'
export type ActivationFlag = 'ACTIVATED' | 'DISABLED' | 'ONLY_FORCED'

/** Remembered per-series/per-season track preference (upstream `SeriesTrackChoice`, STC). */
export interface SeriesTrackChoice {
  parentId: string
  type: TrackChoiceType
  parentType: TrackChoiceParentType
  itemId?: string | null
  language?: string | null
  activation: ActivationFlag
  /** bitmask of TrackFlag */
  trackFlags: number
  codec?: string | null
  relativeTrackIndex?: number | null
  title?: string | null
  audioChannels?: number | null
}

/** Bit flags describing a chosen track (upstream `TrackFlag`). */
export const TrackFlag = {
  DEFAULT: 1,
  FORCED: 2,
  SDH: 4,
  EXTERNAL: 8,
  SIGNS: 16,
} as const

export function hasFlag(stc: Pick<SeriesTrackChoice, 'trackFlags'>, flag: number): boolean {
  return (stc.trackFlags & flag) === flag
}

export function calculateTrackFlags(s: MediaStream): number {
  let f = 0
  if (s.IsDefault) f |= TrackFlag.DEFAULT
  if (s.IsForced) f |= TrackFlag.FORCED
  if (s.IsHearingImpaired) f |= TrackFlag.SDH
  if (s.IsExternal) f |= TrackFlag.EXTERNAL
  if (isSigns(s)) f |= TrackFlag.SIGNS
  return f
}

/** App-level per-user language/mode overrides (upstream `JellyfinUserPreferences`); null = none stored. */
export interface ChoicePrefs {
  /** '' = use the server profile, '_any-language' = no preference, else an ISO code */
  preferredAudioLanguage: string
  preferredSubtitleLanguage: string
  subtitleMode: 'USE_USER_PROFILE' | 'DEFAULT' | 'SMART' | 'ONLY_FORCED' | 'ALWAYS' | 'NONE'
}

/** The server user configuration fields the selection reads (`UserDto.Configuration`). */
export interface ServerUserConfig {
  AudioLanguagePreference?: string | null
  SubtitleLanguagePreference?: string | null
  SubtitleMode?: SubtitlePlaybackMode
}

export const USE_USER_PROFILE = ''
export const PREFER_ANY_LANGUAGE = '_any-language'

/** Why a stream was chosen (upstream `StreamChoiceReason`). */
export type StreamChoiceReason =
  | { kind: 'Unknown' }
  | { kind: 'UserPreferences' }
  | { kind: 'Series'; stc: SeriesTrackChoice; scores: ScoredMediaStream[] }
  | { kind: 'Season'; stc: SeriesTrackChoice; scores: ScoredMediaStream[] }
  | { kind: 'Item'; itemPlayback: ItemPlayback }

export interface StreamChoiceResult {
  stream: MediaStream | null
  reason: StreamChoiceReason
}

export interface ScoredMediaStream {
  score: number
  stream: MediaStream
}

function reasonFrom(stc: SeriesTrackChoice, scores: ScoredMediaStream[] = []): StreamChoiceReason {
  switch (stc.parentType) {
    case 'SERIES':
      return { kind: 'Series', stc, scores }
    case 'SEASON':
      return { kind: 'Season', stc, scores }
    default:
      return { kind: 'Unknown' }
  }
}

const isBlank = (s: string | null | undefined): s is null | undefined | '' => s == null || s.trim() === ''

/** Kotlin `String?.equals(other, ignoreCase = true)`: null equals null. */
function eqIgnoreCase(a: string | null | undefined, b: string | null | undefined): boolean {
  if (a == null) return b == null
  if (b == null) return false
  return a.toLowerCase() === b.toLowerCase()
}

/** Kotlin `==` on nullable strings (case-sensitive). */
const eq = (a: string | null | undefined, b: string | null | undefined) => (a ?? null) === (b ?? null)

export function isUnknownLanguage(lang: string | null | undefined): boolean {
  if (isBlank(lang)) return true
  const l = lang.toLowerCase()
  return l === 'unknown' || l === 'und' || l === 'undetermined' || l === 'mul' || l === 'zxx'
}

const equalsLangOrUnknown = (lang: string | null | undefined, pref: string) => eqIgnoreCase(lang, pref) || isUnknownLanguage(lang)

const equalsLangExact = (a: string | null | undefined, b: string | null | undefined) =>
  !isUnknownLanguage(a) && !isUnknownLanguage(b) && eqIgnoreCase(a, b)

export function isSigns(track: MediaStream): boolean {
  const title = track.Title ?? track.DisplayTitle
  if (title == null) return false
  const t = title.toLowerCase()
  return t.includes('forced') || t.includes('signs') || t.includes('songs')
}

/** Forced flag or a forced/signs/songs title. */
export function isForcedOrSigns(track: MediaStream): boolean {
  return !!track.IsForced || isSigns(track)
}

// ---------------------------------------------------------------------------------------------
// Relative indexes (RelativeMediaStream.kt)

export interface RelativeMediaStream {
  relativeIndex: number
  stream: MediaStream
}

const sameKind = (a: MediaStream, b: MediaStream) => a.Type === b.Type && !!a.IsExternal === !!b.IsExternal

/** Position of `stream` among streams of the same (type, isExternal), sorted by index. */
export function getRelativeIndex(stream: MediaStream, streams: readonly MediaStream[]): number | null {
  const i = streams
    .filter((s) => sameKind(s, stream))
    .sort((a, b) => (a.Index ?? 0) - (b.Index ?? 0))
    .findIndex((s) => s.Index === stream.Index)
  return i >= 0 ? i : null
}

export function relativeStreamFrom(index: number, streams: readonly MediaStream[]): RelativeMediaStream | null {
  const stream = streams.find((s) => s.Index === index)
  if (!stream) return null
  const relativeIndex = getRelativeIndex(stream, streams)
  return relativeIndex == null ? null : { relativeIndex, stream }
}

/** `List<MediaStream>.asRelative()`. */
export function asRelative(streams: readonly MediaStream[]): RelativeMediaStream[] {
  const groups = new Map<string, MediaStream[]>()
  for (const s of streams) {
    const key = `${s.Type}|${!!s.IsExternal}`
    const g = groups.get(key)
    if (g) g.push(s)
    else groups.set(key, [s])
  }
  const out: RelativeMediaStream[] = []
  for (const g of groups.values()) {
    ;[...g].sort((a, b) => (a.Index ?? 0) - (b.Index ?? 0)).forEach((stream, relativeIndex) => out.push({ relativeIndex, stream }))
  }
  return out.sort((a, b) => (a.stream.Index ?? 0) - (b.stream.Index ?? 0))
}

// ---------------------------------------------------------------------------------------------
// Sources

const firstVideoArea = (s: MediaSourceInfo) => {
  const v = s.MediaStreams?.find((m) => m.Type === 'Video')
  return v ? (v.Width ?? 0) * (v.Height ?? 0) : 0
}

/** Source with the largest first-video area (Kotlin maxByOrNull keeps the first of equal maxima). */
export function chooseSourceByResolution(sources: readonly MediaSourceInfo[] | null | undefined): MediaSourceInfo | null {
  if (!sources || sources.length === 0) return null
  let best = sources[0]
  let bestArea = firstVideoArea(best)
  for (const s of sources.slice(1)) {
    const a = firstVideoArea(s)
    if (a > bestArea) {
      best = s
      bestArea = a
    }
  }
  return best
}

/** `chooseSource(dto, itemPlayback)`: the remembered source, else the highest resolution. */
export function chooseSource(
  sources: readonly MediaSourceInfo[] | null | undefined,
  itemPlayback: Pick<ItemPlayback, 'sourceId'> | null | undefined,
): MediaSourceInfo | null {
  const id = itemPlayback?.sourceId
  if (id) {
    const match = sources?.find((s) => s.Id != null && normalize(s.Id) === normalize(id))
    if (match) return match
  }
  return chooseSourceByResolution(sources)
}

const normalize = (id: string) => id.replace(/-/g, '').toLowerCase()

// ---------------------------------------------------------------------------------------------
// Preferred language

/** `getPreferredLanguage` (StreamChoiceService.kt:562-588). */
export function getPreferredLanguage(
  type: 'Audio' | 'Subtitle',
  prefs: ChoicePrefs | null,
  userConfig: ServerUserConfig | null | undefined,
): string | null {
  const pref = type === 'Audio' ? prefs?.preferredAudioLanguage : prefs?.preferredSubtitleLanguage
  const profileLang = type === 'Audio' ? userConfig?.AudioLanguagePreference : userConfig?.SubtitleLanguagePreference
  let lang: string | null | undefined
  if (pref === USE_USER_PROFILE) lang = profileLang
  else if (pref === PREFER_ANY_LANGUAGE) lang = null
  else lang = pref
  return isBlank(lang) ? null : lang
}

// ---------------------------------------------------------------------------------------------
// Scoring

/** `scoreStreams` (StreamChoiceService.kt:595-670): sorted best first, or null when the choice disables the type. */
export function scoreStreams(streams: readonly MediaStream[], choice: SeriesTrackChoice): ScoredMediaStream[] | null {
  if (choice.activation === 'DISABLED') return null
  const wantType = choice.type === 'AUDIO' ? 'Audio' : 'Subtitle'
  const filtered = streams.filter((s) => {
    if ((choice.activation === 'ONLY_FORCED' || hasFlag(choice, TrackFlag.FORCED)) && !isForcedOrSigns(s)) return false
    if (!isUnknownLanguage(choice.language) && !equalsLangExact(choice.language, s.Language)) return false
    return s.Type === wantType
  })
  const scored = asRelative(filtered).map(({ relativeIndex, stream: s }) => {
    let score = 0
    if (equalsLangExact(choice.language, s.Language)) score += 10_000
    if (s.IsForced && hasFlag(choice, TrackFlag.FORCED)) score += 1_000
    if (hasFlag(choice, TrackFlag.SIGNS) && isSigns(s)) score += 500
    if (s.IsDefault && hasFlag(choice, TrackFlag.DEFAULT)) score += 500
    if (s.IsHearingImpaired && hasFlag(choice, TrackFlag.SDH)) score += 500
    else if (hasFlag(choice, TrackFlag.SDH) && s.IsForced) score -= 10
    if (s.IsExternal && hasFlag(choice, TrackFlag.EXTERNAL)) score += 100
    if (relativeIndex === (choice.relativeTrackIndex ?? null)) score += 100
    if (eq(s.Title, choice.title)) score += 10
    if (choice.audioChannels != null && s.Channels === choice.audioChannels) score += 100
    else if (choice.audioChannels != null && s.Channels != null && s.Channels > choice.audioChannels) score += 50
    if (s.IsDefault) score += 1
    return { score, stream: s }
  })
  return scored.sort((a, b) => b.score - a.score)
}

// ---------------------------------------------------------------------------------------------
// Audio

const byNullableAsc = <T>(get: (x: T) => string | null | undefined) => (a: T, b: T) => {
  const x = get(a)
  const y = get(b)
  if (x == null) return y == null ? 0 : -1
  if (y == null) return 1
  return x < y ? -1 : x > y ? 1 : 0
}

/** `chooseAudioStream(candidates, itemPlayback, stc, prefs)` (StreamChoiceService.kt:153-196). */
export function chooseAudioStream(
  candidates: readonly MediaStream[],
  itemPlayback: ItemPlayback | null,
  stc: readonly SeriesTrackChoice[],
  prefs: ChoicePrefs | null,
  userConfig: ServerUserConfig | null | undefined,
): StreamChoiceResult {
  if (itemPlayback && itemPlayback.audioIndex >= 0) {
    return { stream: candidates.find((c) => c.Index === itemPlayback.audioIndex) ?? null, reason: { kind: 'Item', itemPlayback } }
  }
  if (stc.length > 0) {
    const first = stc[0]
    const result = scoreStreams(candidates, first)
    if (result == null) return { stream: null, reason: reasonFrom(first) }
    if (result.length === 0 && stc.length > 1) return chooseAudioStream(candidates, itemPlayback, stc.slice(1), prefs, userConfig)
    if (result.length === 0) return chooseAudioStream(candidates, itemPlayback, [], prefs, userConfig)
    return { stream: result[0].stream, reason: reasonFrom(first, result) }
  }
  const lang = getPreferredLanguage('Audio', prefs, userConfig)
  let stream: MediaStream | undefined
  if (!isBlank(lang)) {
    const byLang = byNullableAsc<MediaStream>((s) => s.Language)
    const sorted = [...candidates].sort((a, b) => {
      const c = byLang(a, b)
      if (c !== 0) return c
      // thenByDescending(channels): nulls last
      const x = a.Channels
      const y = b.Channels
      if (x == null) return y == null ? 0 : 1
      if (y == null) return -1
      return y - x
    })
    stream =
      sorted.find((s) => s.Language === lang && s.IsDefault) ??
      sorted.find((s) => s.Language === lang) ??
      sorted.find((s) => s.IsDefault) ??
      sorted[0]
  } else {
    stream = candidates.find((s) => s.IsDefault) ?? candidates[0]
  }
  return { stream: stream ?? null, reason: { kind: 'UserPreferences' } }
}

// ---------------------------------------------------------------------------------------------
// Subtitles

/** Forced/signs track: preferred subtitle language -> audio language -> unknown language. */
export function findForcedTrack(
  candidates: readonly MediaStream[],
  subtitleLanguage: string | null,
  audioLanguage: string | null | undefined,
): MediaStream | null {
  if (subtitleLanguage != null) {
    const m = candidates.find((c) => eqIgnoreCase(c.Language, subtitleLanguage) && isForcedOrSigns(c))
    if (m) return m
  }
  if (audioLanguage != null) {
    const m = candidates.find((c) => eqIgnoreCase(c.Language, audioLanguage) && isForcedOrSigns(c))
    if (m) return m
  }
  return candidates.find((c) => isUnknownLanguage(c.Language) && isForcedOrSigns(c)) ?? null
}

function resolveSubtitleMode(prefs: ChoicePrefs | null, userConfig: ServerUserConfig | null | undefined): SubtitlePlaybackMode {
  switch (prefs?.subtitleMode) {
    case undefined:
      return 'Default'
    case 'USE_USER_PROFILE':
      return userConfig?.SubtitleMode ?? 'Default'
    case 'DEFAULT':
      return 'Default'
    case 'SMART':
      return 'Smart'
    case 'ONLY_FORCED':
      return 'OnlyForced'
    case 'ALWAYS':
      return 'Always'
    case 'NONE':
      return 'None'
  }
}

/** `chooseSubtitleStream(audioStreamLang, candidates, itemPlayback, stc, prefs)` (StreamChoiceService.kt:258-410). */
export function chooseSubtitleStream(
  audioStreamLang: string | null | undefined,
  candidates: readonly MediaStream[],
  itemPlayback: ItemPlayback | null,
  stc: readonly SeriesTrackChoice[],
  prefs: ChoicePrefs | null,
  userConfig: ServerUserConfig | null | undefined,
): StreamChoiceResult {
  if (itemPlayback && itemPlayback.subtitleIndex !== TrackIndex.UNSPECIFIED) {
    const reason: StreamChoiceReason = { kind: 'Item', itemPlayback }
    if (itemPlayback.subtitleIndex === TrackIndex.DISABLED) return { stream: null, reason }
    if (itemPlayback.subtitleIndex === TrackIndex.ONLY_FORCED) {
      const lang = getPreferredLanguage('Subtitle', prefs, userConfig)
      return { stream: findForcedTrack(candidates, lang, audioStreamLang), reason }
    }
    return { stream: candidates.find((c) => c.Index === itemPlayback.subtitleIndex) ?? null, reason }
  }
  if (stc.length > 0) {
    const first = stc[0]
    const next = (result: ScoredMediaStream[]): StreamChoiceResult => {
      if (result.length === 0 && stc.length > 1) {
        return chooseSubtitleStream(audioStreamLang, candidates, itemPlayback, stc.slice(1), prefs, userConfig)
      }
      if (result.length === 0) return chooseSubtitleStream(audioStreamLang, candidates, itemPlayback, [], prefs, userConfig)
      return { stream: result[0].stream, reason: reasonFrom(first, result) }
    }
    switch (first.activation) {
      case 'DISABLED':
        return { stream: null, reason: reasonFrom(first) }
      case 'ONLY_FORCED': {
        const lang = getPreferredLanguage('Subtitle', prefs, userConfig)
        const stream = findForcedTrack(candidates, lang, audioStreamLang)
        return stream ? { stream, reason: reasonFrom(first) } : next([])
      }
      case 'ACTIVATED':
        return next(scoreStreams(candidates, first) ?? [])
    }
  }

  const subtitleLanguage = getPreferredLanguage('Subtitle', prefs, userConfig)
  const mode = resolveSubtitleMode(prefs, userConfig)
  const keys: Array<(s: MediaStream) => boolean> = [
    (s) => !!s.IsExternal,
    (s) => !!s.IsDefault,
    (s) => !s.IsForced && eqIgnoreCase(s.Language, subtitleLanguage),
    (s) => !!s.IsForced && eqIgnoreCase(s.Language, subtitleLanguage),
    (s) => !!s.IsForced && isUnknownLanguage(s.Language),
    (s) => !!s.IsForced,
  ]
  const sorted = [...candidates].sort((a, b) => {
    for (const k of keys) {
      const d = Number(k(b)) - Number(k(a))
      if (d !== 0) return d
    }
    return 0
  })
  let stream: MediaStream | undefined
  const hasLang = !isBlank(subtitleLanguage)
  switch (mode) {
    case 'Always':
      stream = hasLang
        ? (sorted.find((s) => !s.IsForced && equalsLangOrUnknown(s.Language, subtitleLanguage)) ??
          sorted.find((s) => equalsLangOrUnknown(s.Language, subtitleLanguage)))
        : (sorted.find((s) => !s.IsForced) ?? sorted[0])
      break
    case 'OnlyForced':
      stream = hasLang
        ? (sorted.find((s) => s.Language === subtitleLanguage && s.IsForced) ??
          sorted.find((s) => isUnknownLanguage(s.Language) && s.IsForced))
        : sorted.find((s) => s.IsForced)
      break
    case 'Smart':
      if (hasLang) {
        const audioPref = userConfig?.AudioLanguagePreference
        if ((!isBlank(audioPref) && !eq(audioPref, audioStreamLang)) || (isBlank(audioPref) && !eq(subtitleLanguage, audioStreamLang))) {
          stream = sorted.find((s) => s.Language === subtitleLanguage) ?? sorted.find((s) => isUnknownLanguage(s.Language))
        } else {
          stream =
            sorted.find((s) => s.IsForced && s.Language === subtitleLanguage) ??
            sorted.find((s) => s.IsForced && isUnknownLanguage(s.Language))
        }
      } else {
        stream = sorted.find((s) => s.IsDefault)
      }
      break
    case 'Default':
      stream = hasLang
        ? (sorted.find((s) => s.Language === subtitleLanguage && (s.IsDefault || s.IsForced)) ??
          sorted.find((s) => s.IsDefault || s.IsForced))
        : sorted.find((s) => s.IsDefault || s.IsForced)
      break
    case 'None':
      stream = undefined
      break
  }
  return { stream: stream ?? null, reason: { kind: 'UserPreferences' } }
}

/**
 * `resolveSubtitleIndex`: ONLY_FORCED becomes a concrete index (or null when no forced track exists); every
 * other value is returned unchanged.
 */
export function resolveSubtitleIndex(
  source: MediaSourceInfo,
  audioStreamIndex: number | null | undefined,
  subtitleIndex: number,
  prefs: ChoicePrefs | null,
  userConfig: ServerUserConfig | null | undefined,
): number | null {
  if (subtitleIndex !== TrackIndex.ONLY_FORCED) return subtitleIndex
  const streams = source.MediaStreams ?? []
  const audio = streams.find((s) => s.Type === 'Audio' && s.Index === audioStreamIndex)
  const subs = streams.filter((s) => s.Type === 'Subtitle')
  const ip: ItemPlayback = { itemId: '', sourceId: null, audioIndex: TrackIndex.UNSPECIFIED, subtitleIndex: TrackIndex.ONLY_FORCED }
  return chooseSubtitleStream(audio?.Language, subs, ip, [], prefs, userConfig).stream?.Index ?? null
}

/** Builds the STC row saved for a chosen stream (SeriesTrackChoice secondary constructor). */
export function buildTrackChoice(
  args: {
    itemId: string
    parentId: string
    parentType: TrackChoiceParentType
    type: TrackChoiceType
    activation: ActivationFlag
  },
  stream: RelativeMediaStream | null,
): SeriesTrackChoice {
  return {
    parentId: args.parentId,
    parentType: args.parentType,
    type: args.type,
    itemId: args.itemId,
    language: stream?.stream.Language ?? null,
    activation: args.activation,
    trackFlags: stream ? calculateTrackFlags(stream.stream) : 0,
    codec: stream?.stream.Codec ?? null,
    relativeTrackIndex: stream?.relativeIndex ?? null,
    title: stream?.stream.Title ?? null,
    audioChannels: stream?.stream.Channels ?? null,
  }
}
