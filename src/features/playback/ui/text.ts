// Text helpers of the player UI: item title lines (BaseItem.title / subtitleLong), stream labels
// (SimpleMediaStream / StreamFormatting.mediaStreamDisplayTitle) and Kotlin `Duration.toString()` output.
import type { BaseItemDto, MediaSegmentType, MediaStream } from '@jellyfin/sdk/lib/generated-client/models'
import type { TFunction } from 'i18next'
import { formatAudioCodec, formatDate, formatSeasonEpisode, formatSubtitleCodec, type Translate } from '../../../lib/format'

/** `BaseItem.title`: the series name for episodes, else the name. */
export function itemTitle(item: BaseItemDto | null | undefined): string | null {
  if (!item) return null
  return (item.Type === 'Episode' ? item.SeriesName : item.Name) ?? item.Name ?? null
}

/** `BaseItem.subtitleLong`: "S01E02 - Name - Mar 8, 2022" for episodes, else the production year. */
export function itemSubtitleLong(t: Translate, item: BaseItemDto | null | undefined, locale?: string): string | null {
  if (!item) return null
  if (item.Type === 'Episode') {
    const parts = [
      formatSeasonEpisode(t, item.ParentIndexNumber, item.IndexNumber, item.IndexNumberEnd, true),
      item.Name,
      formatDate(item.PremiereDate, locale),
    ].filter((s): s is string => !!s && s.trim() !== '')
    return parts.length ? parts.join(' - ') : null
  }
  return item.ProductionYear != null ? String(item.ProductionYear) : null
}

/** Next Up / queue card title: "S1 E2 - Name" (`seasonEpisode` + name). */
export function episodeLine(t: Translate, item: BaseItemDto): string {
  const se = item.Type === 'Episode' ? formatSeasonEpisode(t, item.ParentIndexNumber, item.IndexNumber, item.IndexNumberEnd) : null
  return [se, item.Name].filter((s): s is string => !!s).join(' - ')
}

// ISO 639-2/B codes that Intl.DisplayNames does not know (it wants 639-2/T or 639-1).
const BIBLIOGRAPHIC: Record<string, string> = {
  alb: 'sq', arm: 'hy', baq: 'eu', bur: 'my', chi: 'zh', cze: 'cs', dut: 'nl', fre: 'fr', geo: 'ka', ger: 'de',
  gre: 'el', ice: 'is', mac: 'mk', mao: 'mi', may: 'ms', per: 'fa', rum: 'ro', slo: 'sk', tib: 'bo', wel: 'cy',
}

let names: Intl.DisplayNames | null | undefined
function displayNames(): Intl.DisplayNames | null {
  if (names === undefined) {
    try {
      names = new Intl.DisplayNames(undefined, { type: 'language' })
    } catch {
      names = null
    }
  }
  return names
}

/** `languageName` (TrackSupport.kt): display name of a language code, "Unknown" for und/null. */
export function languageName(t: Translate, code: string | null | undefined): string {
  if (!code || code === 'und') return t('unknown')
  const c = BIBLIOGRAPHIC[code.toLowerCase()] ?? code
  try {
    const n = displayNames()?.of(c)
    if (n && n.toLowerCase() !== c.toLowerCase()) return n
  } catch {
    // invalid tag
  }
  return code.toUpperCase()
}

/** `mediaStreamDisplayTitle(includeFlags = true)`. */
export function streamDisplayTitle(t: Translate, s: MediaStream): string {
  const parts: string[] = [languageName(t, s.Language)]
  if (s.Type === 'Audio') {
    const codec = formatAudioCodec(t, s.Codec, s.Profile)
    if (codec) parts.push(codec)
    if (s.ChannelLayout) parts.push(s.ChannelLayout)
  } else if (s.Type === 'Subtitle') {
    if (s.IsHearingImpaired) parts.push(t('subtitles_hearing_impaired'))
    const codec = formatSubtitleCodec(s.Codec)
    if (codec) parts.push(codec)
  }
  const name = parts.join(' ')
  const flags: string[] = []
  if (s.IsDefault) flags.push(s.LocalizedDefault ?? t('default_track'))
  if (s.IsForced) flags.push(s.LocalizedForced ?? t('forced_track'))
  if (s.IsExternal) flags.push(s.LocalizedExternal ?? t('external_track'))
  return flags.length ? `${name} (${flags.join(', ')})` : name
}

/** `SimpleMediaStream`: headline = stream title or display title; supporting = display title when titled. */
export function streamLabels(t: Translate, s: MediaStream): { headline: string; supporting: string | null } {
  const display = streamDisplayTitle(t, s)
  const title = s.Title?.trim() ? s.Title : null
  return { headline: title ?? display, supporting: title ? display : null }
}

/**
 * Kotlin `Duration.toString()` for the values the player shows: "0s", "250ms", "-1s", "1.5s", "1m 2.5s".
 * Used by the subtitle delay label (SubtitleDelay.kt) and the Settings dialog row.
 */
export function kotlinDuration(ms: number): string {
  if (ms === 0) return '0s'
  const sign = ms < 0 ? '-' : ''
  const abs = Math.abs(Math.round(ms))
  if (abs < 1000) return `${sign}${abs}ms`
  const h = Math.floor(abs / 3_600_000)
  const m = Math.floor((abs % 3_600_000) / 60_000)
  const sMs = abs % 60_000
  const secs = sMs / 1000
  const sStr = Number.isInteger(secs) ? String(secs) : String(Number(secs.toFixed(3)))
  const parts: string[] = []
  if (h) parts.push(`${h}h`)
  if (m) parts.push(`${m}m`)
  if (sMs) parts.push(`${sStr}s`)
  const body = parts.join(' ')
  return parts.length > 1 && sign ? `-(${body})` : `${sign}${body}`
}

/** Playback speed label as upstream lists it (".25", "1.0", "2.0"). */
export function speedLabel(rate: number): string {
  if (Number.isInteger(rate)) return rate.toFixed(1)
  return String(rate).replace(/^0\./, '.')
}

/**
 * A value made of digits, a sign and a Latin unit ("-250 ms", "1.25x") for a line of plain text such as a toast:
 * wrapped in a left-to-right isolate (U+2066 … U+2069), or a right-to-left line shows it as "ms 250-". Where the
 * value has an element of its own, `dir="ltr"` or `<bdi>` does the same without the characters.
 */
export const ltrValue = (value: string): string => `\u2066${value}\u2069`

/** i18next's `t` narrowed to the `Translate` signature the format helpers take. */
export function plainT(t: TFunction): Translate {
  return (key, options) => String(t(key, (options ?? {}) as never))
}

/** Index of the chapter containing the position (ChapterRowOverlay.kt chapterIndex). */
export function currentChapterIndex(chapters: ReadonlyArray<{ startMs: number }>, positionMs: number): number {
  if (chapters.length === 0) return 0
  const after = chapters.findIndex((c) => c.startMs > positionMs)
  if (after < 0) return chapters.length - 1
  return Math.max(0, after - 1)
}

/** `skipStringRes` (W/ui/Formatting.kt:232-241). */
export function skipSegmentKey(type: MediaSegmentType | null | undefined): string {
  switch (type) {
    case 'Intro':
      return 'skip_segment_intro'
    case 'Outro':
      return 'skip_segment_outro'
    case 'Recap':
      return 'skip_segment_recap'
    case 'Preview':
      return 'skip_segment_preview'
    case 'Commercial':
      return 'skip_segment_commercial'
    default:
      return 'skip_segment_unknown'
  }
}
