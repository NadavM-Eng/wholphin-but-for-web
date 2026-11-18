// Stream text and the "chosen streams" of a detail page: W/ui/util/StreamFormatting.kt,
// W/ui/util/TrackSupport.kt (languageName), W/ui/components/VideoStreamDetails.kt and
// W/data/ItemPlaybackRepository.getChosenItemFromPlayback. Pure functions.
import type { BaseItemDto, MediaSourceInfo, MediaStream } from '@jellyfin/sdk/lib/generated-client/models'
import {
  chooseAudioStream,
  chooseSource,
  chooseSubtitleStream,
  TrackIndex,
  type ChoicePrefs,
  type ItemPlayback,
  type SeriesTrackChoice,
  type ServerUserConfig,
  type StreamChoiceResult,
} from '../../playback/engine/streamChoice'
import { formatAudioCodec, formatSubtitleCodec, formatVideoRange, resolutionString, type Translate } from '../../../lib/format'

/** `languageName(code)`: "Unknown" for null/"und", else the display language in the UI locale. */
export function languageName(t: Translate, code: string | null | undefined, locale?: string): string {
  if (!code || code === 'und') return t('unknown')
  try {
    const name = new Intl.DisplayNames(locale ? [locale] : undefined, { type: 'language' }).of(code)
    return name && name !== 'root' ? name : code.toUpperCase()
  } catch {
    return code.toUpperCase()
  }
}

const joinSpace = (parts: (string | null | undefined)[]) => parts.filter((p): p is string => !!p).join(' ')

/** `mediaStreamDisplayTitle` (StreamFormatting.kt:148-176); null codec / layout parts are skipped. */
export function streamDisplayTitle(t: Translate, s: MediaStream, includeFlags: boolean, locale?: string): string {
  const parts: (string | null | undefined)[] = [languageName(t, s.Language, locale)]
  if (s.Type === 'Audio') parts.push(formatAudioCodec(t, s.Codec, s.Profile), s.ChannelLayout)
  else if (s.Type === 'Subtitle') parts.push(s.IsHearingImpaired ? 'SDH' : null, formatSubtitleCodec(s.Codec))
  const name = joinSpace(parts)
  if (!includeFlags) return name
  const flags: string[] = []
  if (s.IsDefault) flags.push(s.LocalizedDefault ?? t('default_track'))
  if (s.IsForced) flags.push(s.LocalizedForced ?? t('forced_track'))
  if (s.IsExternal) flags.push(s.LocalizedExternal ?? t('external_track'))
  return flags.length ? `${name} (${flags.join(', ')})` : name
}

/** Video chip text: "{resolution} {range}" (either part may be missing). */
export function videoChipText(t: Translate, v: MediaStream | null | undefined): string | null {
  if (!v) return null
  const res = v.Width != null && v.Height != null ? resolutionString(v.Width, v.Height, !!v.IsInterlaced) : null
  const range = formatVideoRange(t, v.VideoRange, v.VideoRangeType, v.VideoDoViTitle)
  const s = joinSpace([res, range])
  return s || null
}

export const audioCount = (source: MediaSourceInfo | null | undefined) =>
  source?.MediaStreams?.filter((s) => s.Type === 'Audio').length ?? 0
export const subtitleCount = (source: MediaSourceInfo | null | undefined) =>
  source?.MediaStreams?.filter((s) => s.Type === 'Subtitle').length ?? 0

/** Upstream `ChosenStreams`: the source and tracks a Play press would use, and why. */
export type ChosenStreams = {
  itemPlayback: ItemPlayback | null
  audioStc: SeriesTrackChoice[]
  subtitleStc: SeriesTrackChoice[]
  itemId: string
  source: MediaSourceInfo
  videoStream: MediaStream | null
  audio: StreamChoiceResult
  subtitle: StreamChoiceResult
  subtitlesDisabled: boolean
}

/** `getChosenItemFromPlayback(item, itemPlayback, audioStc, subtitleStc, prefs)`. Null without media sources. */
export function computeChosenStreams(
  item: BaseItemDto,
  itemPlayback: ItemPlayback | null,
  audioStc: SeriesTrackChoice[],
  subtitleStc: SeriesTrackChoice[],
  prefs: ChoicePrefs | null,
  userConfig: ServerUserConfig | null | undefined,
): ChosenStreams | null {
  const source = chooseSource(item.MediaSources, itemPlayback)
  if (!source) return null
  const streams = source.MediaStreams ?? []
  const audio = chooseAudioStream(
    streams.filter((s) => s.Type === 'Audio'),
    itemPlayback,
    audioStc,
    prefs,
    userConfig,
  )
  const subtitle = chooseSubtitleStream(
    audio.stream?.Language,
    streams.filter((s) => s.Type === 'Subtitle'),
    itemPlayback,
    subtitleStc,
    prefs,
    userConfig,
  )
  return {
    itemPlayback,
    audioStc,
    subtitleStc,
    itemId: item.Id ?? '',
    source,
    videoStream: streams.find((s) => s.Type === 'Video') ?? null,
    audio,
    subtitle,
    subtitlesDisabled: itemPlayback?.subtitleIndex === TrackIndex.DISABLED,
  }
}

/** Whether "Clear track choices" applies (ContextMenu.kt `canClearChosenStreams`). */
export function hasSavedChoices(c: ChosenStreams | null | undefined): boolean {
  return !!c && (c.itemPlayback != null || c.audioStc.length > 0 || c.subtitleStc.length > 0)
}

export type StreamChip = { key: string; text: string; icon?: 'volume_high' | 'closed_captioning'; count: number; disabled?: boolean; capped?: 'audio' | 'subtitle' }

/** The chips of `VideoStreamDetails` in order: video, video codec, audio, subtitles (only when any exist). */
export function streamChips(
  t: Translate,
  chosen: ChosenStreams | null | undefined,
  numberOfVersions: number,
  locale?: string,
): StreamChip[] {
  const out: StreamChip[] = []
  const v = chosen?.videoStream
  const video = videoChipText(t, v)
  if (video) out.push({ key: 'video', text: video, count: numberOfVersions })
  if (v?.Codec) out.push({ key: 'codec', text: v.Codec.toUpperCase(), count: 0 })
  const aCount = audioCount(chosen?.source)
  const a = chosen?.audio.stream
  const audioText =
    aCount === 0 || !a ? t('none') : joinSpace([languageName(t, a.Language, locale), formatAudioCodec(t, a.Codec, a.Profile), a.ChannelLayout])
  out.push({ key: 'audio', text: audioText, icon: 'volume_high', count: aCount, capped: 'audio' })
  const sCount = subtitleCount(chosen?.source)
  const s = chosen?.subtitle.stream
  if (sCount > 0 && !s) {
    out.push({ key: 'subtitle', text: t('none'), icon: 'closed_captioning', count: sCount, disabled: true, capped: 'subtitle' })
  } else if (sCount > 0 && s) {
    out.push({
      key: 'subtitle',
      text: joinSpace([languageName(t, s.Language, locale), s.IsHearingImpaired ? 'SDH' : null, formatSubtitleCodec(s.Codec)]),
      icon: 'closed_captioning',
      count: sCount,
      capped: 'subtitle',
    })
  }
  return out
}

/** `StreamChoiceReason.description`. */
export function reasonText(t: Translate, r: StreamChoiceResult['reason']): string {
  switch (r.kind) {
    case 'UserPreferences':
      return t('profile_specific_settings')
    case 'Series':
      return t('chosen_by', { p1: t('series') })
    case 'Season':
      return t('chosen_by', { p1: t('tv_season') })
    case 'Item':
      return t('chosen_by', { p1: t('user') })
    default:
      return t('unknown')
  }
}
