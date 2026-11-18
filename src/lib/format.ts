// Pure text-formatting helpers ported from W/ui/Formatting.kt, W/ui/Extensions.kt and
// W/ui/util/StreamFormatting.kt (spec 03 §0.4). Functions that need localized strings take the i18next
// `t` function so they stay pure and testable.

/** Minimal translate signature compatible with i18next's TFunction. */
export type Translate = (key: string, options?: Record<string, unknown>) => string

export const TICKS_PER_MS = 10_000
export const TICKS_PER_SECOND = 10_000_000

export const ticksToMs = (ticks: number): number => Math.floor(ticks / TICKS_PER_MS)
export const msToTicks = (ms: number): number => Math.round(ms * TICKS_PER_MS)
export const ticksToSeconds = (ticks: number): number => ticks / TICKS_PER_SECOND

/** Dot separator used between quick details: two spaces, bullet, two spaces (Formatting.kt `dot()`). */
export const DOT = '  •  '

/** `Duration.roundMinutes`: (d + 30s) truncated to whole minutes. Returns ms. */
export function roundMinutesMs(ms: number): number {
  return Math.floor((ms + 30_000) / 60_000) * 60_000
}

/** `Duration.roundSeconds`. Returns ms. */
export function roundSecondsMs(ms: number): number {
  return Math.floor((ms + 500) / 1000) * 1000
}

/** `Resources.formatDuration`: "1h 2m 3s" family using the duration_* strings. */
export function formatDuration(t: Translate, ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0 && m > 0 && s > 0) return t('duration_hours_minutes_seconds', { p1: h, p2: m, p3: s })
  if (h > 0 && m > 0) return t('duration_hours_minutes', { p1: h, p2: m })
  if (h > 0 && s > 0) return t('duration_hours_seconds', { p1: h, p2: s })
  if (h > 0) return t('duration_hours', { p1: h })
  if (m > 0 && s > 0) return t('duration_minutes_seconds', { p1: m, p2: s })
  if (m > 0) return t('duration_minutes', { p1: m })
  return t('duration_seconds', { p1: s })
}

/** Runtime label (`formatDuration(roundMinutes(runTimeTicks))`), null when it rounds to 0. */
export function formatRuntime(t: Translate, ticks: number | null | undefined): string | null {
  if (ticks == null) return null
  const rounded = roundMinutesMs(ticksToMs(ticks))
  return rounded > 0 ? formatDuration(t, rounded) : null
}

/** "{duration} left" for the remaining time (ticks), null when it rounds to 0. */
export function formatTimeLeft(t: Translate, remainingTicks: number | null | undefined): string | null {
  const d = formatRuntime(t, remainingTicks)
  return d ? t('time_left', { p1: d }) : null
}

/** Remaining ticks from runtime and resume position (`BaseItemDto.timeRemaining`). */
export function timeRemainingTicks(
  runTimeTicks: number | null | undefined,
  positionTicks: number | null | undefined,
): number | null {
  if (!runTimeTicks || !positionTicks || positionTicks <= 0) return null
  return Math.max(0, runTimeTicks - positionTicks)
}

/** Locale time of day, honouring the locale's 12/24h convention (`formatTime`). */
export function formatTimeOfDay(date: Date, locale?: string): string {
  return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(date)
}

/** "Ends at {time}" for now + remaining ticks. */
export function formatEndsAt(t: Translate, nowMs: number, remainingTicks: number, locale?: string): string {
  return t('ends_at', { p1: formatTimeOfDay(new Date(nowMs + ticksToMs(remainingTicks)), locale) })
}

/**
 * Medium localized date ("Aug 24, 2000"). Date-only values are formatted without a timezone shift
 * (upstream converts the server's UTC midnight to local time and can show the previous day; see
 * the TODO in W/ui/Formatting.kt).
 */
export function formatDate(iso: string | null | undefined, locale?: string): string | null {
  if (!iso) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return null
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(d)
}

/** Full date + time for timestamps that are real instants (e.g. DateCreated, program start). */
export function formatDateTime(iso: string | null | undefined, locale?: string): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(d)
}

/** Year of an ISO date string without timezone shift. */
export function yearOf(iso: string | null | undefined): number | null {
  const m = iso ? /^(\d{4})/.exec(iso) : null
  return m ? Number(m[1]) : null
}

const pad2 = (n: number) => String(n).padStart(2, '0')

/** `formatSeasonEpisode`: "S1 E2", "S1 E2-E3", padded "S01E02", null if season or episode missing. */
export function formatSeasonEpisode(
  t: Translate,
  season: number | null | undefined,
  episode: number | null | undefined,
  episodeEnd?: number | null,
  padded = false,
): string | null {
  if (season == null || episode == null) return null
  if (episodeEnd != null) {
    return padded
      ? t('season_episode_number_padded_range', { p1: pad2(season), p2: pad2(episode), p3: pad2(episodeEnd) })
      : t('season_episode_number_range', { p1: season, p2: episode, p3: episodeEnd })
  }
  return padded
    ? t('season_episode_number_padded', { p1: pad2(season), p2: pad2(episode) })
    : t('season_episode_number', { p1: season, p2: episode })
}

export const formatEpisodeNumber = (t: Translate, episode: number): string => t('episode_number_short', { p1: episode })
export const formatSeasonNumber = (t: Translate, season: number): string => t('season_number', { p1: season })

/** `seriesProductionYears`: "2010", "2010 - Present", "2010 - 2015". */
export function seriesProductionYears(
  t: Translate,
  item: { ProductionYear?: number | null; Status?: string | null; EndDate?: string | null },
): string | null {
  if (item.ProductionYear == null) return null
  let s = String(item.ProductionYear)
  if (item.Status === 'Continuing') s += ` - ${t('series_continueing')}`
  else if (item.Status === 'Ended') {
    const end = yearOf(item.EndDate)
    if (end != null && end !== item.ProductionYear) s += ` - ${end}`
  }
  return s
}

const ABBREV = ['', 'K', 'M', 'B']

/** `abbreviateNumber`: 5533 -> "5.5K". */
export function abbreviateNumber(n: number, locale?: string): string {
  if (n < 1000) return String(Math.trunc(n))
  let unit = 0
  let count = n
  while (count >= 1000 && unit + 1 < ABBREV.length) {
    count /= 1000
    unit++
  }
  return fixed(count, 1, locale) + ABBREV[unit]
}

function fixed(n: number, digits: number, locale?: string): string {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    useGrouping: false,
  }).format(n)
}

export const BYTE_SUFFIXES = ['B', 'KiB', 'MiB', 'GiB', 'TiB'] as const
export const BYTE_RATE_SUFFIXES = ['bps', 'kbps', 'mbps', 'gbps', 'tbps'] as const

/** `formatBytes`: "1.50 GiB". */
export function formatBytes(
  bytes: number,
  suffixes: readonly string[] = BYTE_SUFFIXES,
  divisor = 1024,
  locale?: string,
): string {
  let unit = 0
  let count = bytes
  while (count >= divisor && unit + 1 < suffixes.length) {
    count /= divisor
    unit++
  }
  return `${fixed(count, 2, locale)} ${suffixes[unit]}`
}

/** `formatBitrate`: decimal units, "8.00 mbps". */
export const formatBitrate = (bitrate: number, locale?: string): string =>
  formatBytes(bitrate, BYTE_RATE_SUFFIXES, 1000, locale)

export const MEGA_BIT = 1024 * 1024

/** `formatMaxBitrate` (settings slider summary): "500 kbps" / "20 Mbps" (integer division as upstream). */
export function formatMaxBitrate(bitrate: number): string {
  return bitrate < MEGA_BIT ? `${Math.floor(bitrate / 1024)} kbps` : `${Math.floor(bitrate / MEGA_BIT)} Mbps`
}

/** Community rating "7.4" (shown with a star icon). */
export const formatCommunityRating = (rating: number, locale?: string): string => fixed(rating, 1, locale)

/** Critic rating "87%" (shown with the fresh/rotten icon). */
export const formatCriticRating = (rating: number): string => `${Math.trunc(rating)}%`
export const isFreshCriticRating = (rating: number): boolean => rating >= 60

/** `resolutionString` (StreamFormatting.kt). 4K/8K carry no p/i suffix. */
export function resolutionString(width: number, height: number, interlaced: boolean): string {
  if (height > width) return resolutionString(height, width, interlaced)
  const s = interlaced ? 'i' : 'p'
  if (width > 5120 || height > 4320) return '8K'
  if (width > 2560 || height > 1440) return '4K'
  if (width > 1920 || height > 1080) return '1440' + s
  if (width > 1280 || height > 962) return '1080' + s
  if (width > 1024 || height > 576) return '720' + s
  if (width > 960 || height > 544) return '576' + s
  if (width > 845 || height > 480) return '540' + s
  if (width > 720 || height > 404) return '480' + s
  if (width > 682 || height > 384) return '404' + s
  if (width > 640 || height > 360) return '384' + s
  if (width > 426 || height > 240) return '360' + s
  if (width > 256 || height > 144) return '240' + s
  return String(height) + s
}

/** `formatVideoRange`: null for SDR/unknown. */
export function formatVideoRange(
  t: Translate,
  videoRange: string | null | undefined,
  videoRangeType: string | null | undefined,
  doviTitle: string | null | undefined,
): string | null {
  if (videoRange !== 'HDR') return null
  if (doviTitle && doviTitle.trim()) return t('dolby_vision')
  switch (videoRangeType) {
    case 'HDR10':
      return 'HDR10'
    case 'HDR10Plus':
      return 'HDR10+'
    case 'HLG':
      return 'HLG'
    case 'DOVIInvalid':
      return t('dolby_vision_invalid')
    default:
      return videoRangeType?.startsWith('DOVI') ? t('dolby_vision') : null
  }
}

/** `formatAudioCodec`. */
export function formatAudioCodec(
  t: Translate,
  codec: string | null | undefined,
  profile: string | null | undefined,
): string | null {
  const p = profile?.toLowerCase() ?? ''
  if (p.includes('dolby atmos')) return t('dolby_atmos')
  if (p.includes('dts')) {
    if (p.includes('x')) return t('dts_x')
    if (p.includes('ma')) return t('dts_hd_ma')
    if (p.includes('hd')) return t('dts_hd')
    return t('dts')
  }
  if (codec == null) return null
  switch (codec.toLowerCase()) {
    case 'truehd':
      return t('truehd')
    case 'ac3':
      return t('dolby_digital')
    case 'eac3':
      return t('dolby_digital_plus')
    case 'dca':
      return t('dts')
    case 'ogg':
    case 'opus':
    case 'vorbis':
      return codec.charAt(0).toUpperCase() + codec.slice(1)
    default:
      return codec.toUpperCase()
  }
}

/** `formatSubtitleCodec`. */
export function formatSubtitleCodec(codec: string | null | undefined): string | null {
  if (codec == null) return null
  switch (codec.toLowerCase()) {
    case 'dvbsub':
      return 'DVB'
    case 'dvdsub':
      return 'DVD'
    case 'pgssub':
      return 'PGS'
    case 'subrip':
      return 'SRT'
    default:
      return codec.toUpperCase()
  }
}

/** Player position "1:02:03" / "2:03" (web helper for seek bars and chapter lists). */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return h > 0 ? `${h}:${pad2(m)}:${pad2(s)}` : `${m}:${pad2(s)}`
}
