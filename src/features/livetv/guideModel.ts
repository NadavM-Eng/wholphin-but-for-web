// Pure model of the TV guide: W/ui/detail/livetv/LiveTvViewModel.kt (time window, program mapping, gap
// filling, paging decision, quick details) and the programguide layout constants from TvGuideGrid.kt.
//
// Times are epoch milliseconds. Upstream works on LocalDateTime (wall clock): `hoursBetween` of two wall-clock
// times. The port measures real elapsed time instead, so a guide spanning a DST switch places programs by their
// real duration (upstream needed `abs(endHours - startHours)` for exactly that case, TvGuideGrid.kt:447).
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models'
import { formatDuration, formatSeasonEpisode, roundMinutesMs, ticksToMs, type Translate } from '../../lib/format'

/** `MAX_HOURS` (LiveTvViewModel.kt:71). */
export const MAX_HOURS = 48
/** `range` (LiveTvViewModel.kt:96): channels whose programs are fetched around the focused row. */
export const FETCH_RANGE = 100
/** First quick load (LiveTvViewModel.kt:165). */
export const INITIAL_CHANNELS = 10

/** `tvGuideDimensions` (TvGuideGrid.kt:294-301), dp. */
export const GUIDE_DIMENSIONS = {
  timelineHourWidth: 240,
  timelineHeight: 32,
  channelWidth: 120,
  channelHeight: 64,
  currentTimeWidth: 2,
} as const

const HOUR_MS = 3_600_000
const MINUTE_MS = 60_000

export type ProgramCategory = 'KIDS' | 'NEWS' | 'MOVIE' | 'SPORTS' | 'FAKE'

/** `ProgramCategory.color` (W/ui/UiConstants.kt AppColors): CSS variables of the fixed colors. */
export const CATEGORY_COLOR: Record<ProgramCategory, string | null> = {
  KIDS: 'var(--fx-dark-cyan)',
  NEWS: 'var(--fx-dark-green)',
  MOVIE: 'var(--fx-dark-purple)',
  SPORTS: 'var(--fx-dark-red)',
  FAKE: null,
}

export type TvChannel = {
  id: string
  number: string | null
  name: string | null
  /** item id + Primary tag, resolved to a URL by the cell */
  imageTag: string | null
  favorite: boolean
}

export type TvProgram = {
  id: string
  channelId: string
  start: number
  end: number
  startHours: number
  endHours: number
  durationMs: number
  name: string | null
  subtitle: string | null
  overview: string | null
  seasonEpisode: { season: number; episode: number } | null
  isRecording: boolean
  isSeriesRecording: boolean
  isRepeat: boolean
  category: ProgramCategory | null
  officialRating: string | null
  imageTag: string | null
}

export const isFake = (p: TvProgram) => p.category === 'FAKE'

/** Inclusive channel index range, like Kotlin's IntRange (`0..0` is the initial value). */
export type IndexRange = { first: number; last: number }

export type FetchedPrograms = {
  range: IndexRange
  /** channel id -> programs sorted by start (gap-filled) */
  byChannel: ReadonlyMap<string, readonly TvProgram[]>
}

export const EMPTY_PROGRAMS: FetchedPrograms = { range: { first: 0, last: 0 }, byChannel: new Map() }

/** `roundDownToHalfHour`: local wall clock down to :00 / :30, seconds dropped. */
export function roundDownToHalfHour(ms: number): number {
  const d = new Date(ms)
  d.setMinutes(d.getMinutes() - (d.getMinutes() % 30), 0, 0)
  return d.getTime()
}

/** `hoursBetween`. */
export function hoursBetween(start: number, target: number): number {
  return Math.trunc((target - start) / 1000) / 3600
}

/**
 * `buildGuideTimes` (LiveTvViewModel.kt:188-198): the guide start (now rounded down to the half hour), then
 * +30 min when it starts on :30, then 47 more labels one hour apart.
 */
export function buildGuideTimes(nowMs: number): number[] {
  const start = roundDownToHalfHour(nowMs)
  const out = [start]
  if (new Date(start).getMinutes() === 30) out.push(start + 30 * MINUTE_MS)
  for (let i = 0; i < MAX_HOURS - 1; i++) out.push(out[out.length - 1] + HOUR_MS)
  return out
}

/** Timeline cell `index`: [start, end) in hours from the guide start (the last cell is one hour wide). */
export function timelineSpan(times: readonly number[], index: number): { startHour: number; endHour: number } {
  const start = times[index]
  const end = index < times.length - 1 ? times[index + 1] : start + HOUR_MS
  return { startHour: hoursBetween(times[0], start), endHour: hoursBetween(times[0], end) }
}

/** Total guide width in hours: the end of the last timeline cell, or a program ending later. */
export function guideHours(times: readonly number[]): number {
  return times.length ? timelineSpan(times, times.length - 1).endHour : MAX_HOURS
}

export function sameLocalDate(a: number, b: number): boolean {
  const x = new Date(a)
  const y = new Date(b)
  return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate()
}

/** Timeline label (TvGuideGrid.kt:425-438): locale time, plus the weekday when the date differs from the guide start. */
export function timelineLabel(time: number, guideStart: number, locale?: string): string {
  const differentDay = !sameLocalDate(time, guideStart)
  return new Intl.DateTimeFormat(locale, {
    hour: 'numeric',
    minute: '2-digit',
    ...(differentDay ? { weekday: 'long' } : {}),
  }).format(new Date(time))
}

/** `DateUtils.formatDateRange(FORMAT_SHOW_TIME [| FORMAT_SHOW_WEEKDAY])`. */
export function formatTimeRange(start: number, end: number, locale?: string, weekday = false): string {
  const f = new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', ...(weekday ? { weekday: 'long' } : {}) })
  return end > start ? f.formatRange(new Date(start), new Date(end)) : f.format(new Date(start))
}

/** DVR Schedule date heading (`FORMAT_SHOW_WEEKDAY | FORMAT_SHOW_DATE`). */
export function formatDayHeading(dayStart: number, locale?: string): string {
  return new Intl.DateTimeFormat(locale, { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date(dayStart))
}

/** Local midnight of the day containing `ms` (`toLocalDate()`). */
export function localDay(ms: number): number {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** Category precedence (LiveTvViewModel.kt:254-265): kids, movie, news, sports. */
export function programCategory(dto: Pick<BaseItemDto, 'IsKids' | 'IsMovie' | 'IsNews' | 'IsSports'>): ProgramCategory | null {
  if (dto.IsKids) return 'KIDS'
  if (dto.IsMovie) return 'MOVIE'
  if (dto.IsNews) return 'NEWS'
  if (dto.IsSports) return 'SPORTS'
  return null
}

const collapse = (s: string | null | undefined) => (s == null ? null : s.replace(/\s+/g, ' '))
const notBlank = (s: string | null | undefined) => s != null && s.trim() !== ''
const parseTime = (iso: string | null | undefined) => {
  if (!iso) return null
  const t = Date.parse(iso)
  return Number.isNaN(t) ? null : t
}

/** BaseItemDto -> TvProgram (LiveTvViewModel.kt:266-308), or null when channel id or times are missing. */
export function toTvProgram(dto: BaseItemDto, guideStart: number): TvProgram | null {
  const start = parseTime(dto.StartDate)
  const end = parseTime(dto.EndDate)
  // upstream force-unwraps these (`!!`); a program without them cannot be placed
  if (!dto.Id || !dto.ChannelId || start == null || end == null) return null
  return {
    id: dto.Id,
    channelId: dto.ChannelId,
    start,
    end,
    startHours: Math.max(0, hoursBetween(guideStart, start)),
    endHours: hoursBetween(guideStart, end),
    durationMs: dto.RunTimeTicks != null ? ticksToMs(dto.RunTimeTicks) : end - start,
    name: collapse(dto.SeriesName ?? dto.Name),
    subtitle: dto.IsSeries ? collapse(dto.EpisodeTitle) : null,
    overview: dto.Overview ?? null,
    seasonEpisode:
      dto.IndexNumber != null && dto.ParentIndexNumber != null ? { season: dto.ParentIndexNumber, episode: dto.IndexNumber } : null,
    isRecording: notBlank(dto.TimerId),
    isSeriesRecording: notBlank(dto.SeriesTimerId),
    isRepeat: dto.IsRepeat ?? false,
    category: programCategory(dto),
    officialRating: dto.OfficialRating ?? null,
    imageTag: dto.ImageTags?.Primary ?? null,
  }
}

/** `TvProgram.fake` ("No data" filler). Ids are deterministic so React keys stay stable across refreshes. */
export function fakeProgram(guideStart: number, channelId: string, startHours: number, endHours: number, noData: string): TvProgram {
  return {
    id: `fake:${channelId}:${startHours.toFixed(4)}`,
    channelId,
    start: guideStart + Math.trunc(startHours * 60) * MINUTE_MS,
    end: guideStart + Math.trunc(endHours * 60) * MINUTE_MS,
    startHours,
    endHours,
    durationMs: Math.trunc((endHours - startHours) * 60) * MINUTE_MS,
    name: noData,
    subtitle: null,
    overview: null,
    seasonEpisode: null,
    isRecording: false,
    isSeriesRecording: false,
    isRepeat: false,
    category: 'FAKE',
    officialRating: null,
    imageTag: null,
  }
}

/**
 * `fetchPrograms` mapping (LiveTvViewModel.kt:242-421): drop programs that ended before the guide start, group by
 * channel (server order = start date), fill gaps with "No data" programs (leading: 1-hour fillers; between:
 * fillers of at most one hour; trailing: up to the next whole hour, then hourly up to 48 h), and give channels
 * without programs 48 one-hour fillers. Overlaps are kept as they are (upstream does not de-overlap).
 */
export function mapPrograms(
  dtos: readonly BaseItemDto[],
  guideStart: number,
  channelIds: readonly string[],
  noData: string,
): Map<string, TvProgram[]> {
  const grouped = new Map<string, TvProgram[]>()
  for (const dto of dtos) {
    const end = parseTime(dto.EndDate)
    if (end == null || !(end > guideStart)) continue
    const p = toTvProgram(dto, guideStart)
    if (!p) continue
    const list = grouped.get(p.channelId)
    if (list) list.push(p)
    else grouped.set(p.channelId, [p])
  }
  const out = new Map<string, TvProgram[]>()
  for (const [channelId, programs] of grouped) {
    const listing: TvProgram[] = []
    programs.forEach((p, index) => {
      if (index === 0) {
        if (p.startHours > 0) {
          let start = 0
          let end = Math.min(start + 1, p.startHours)
          while (start < p.startHours) {
            listing.push(fakeProgram(guideStart, channelId, start, end, noData))
            start = end
            end = Math.min(start + 1, p.startHours)
          }
        }
        listing.push(p)
      } else if (listing.length > 0) {
        let previous = listing[listing.length - 1]
        while (previous.endHours < p.startHours) {
          const start = previous.endHours
          const duration = Math.min(p.startHours - start, 1)
          previous = {
            ...fakeProgram(guideStart, channelId, start, start + duration, noData),
            start: previous.end,
            end: previous.end + Math.trunc(duration * 60) * MINUTE_MS,
          }
          listing.push(previous)
        }
        listing.push(p)
      }
      if (index === programs.length - 1 && p.endHours < MAX_HOURS) {
        const end = Math.trunc(p.endHours + 1)
        listing.push(fakeProgram(guideStart, channelId, p.endHours, end, noData))
        for (let h = end; h < MAX_HOURS; h++) listing.push(fakeProgram(guideStart, channelId, h, h + 1, noData))
      }
    })
    out.set(channelId, listing)
  }
  for (const id of channelIds) {
    if ((out.get(id)?.length ?? 0) > 0) continue
    const fakes: TvProgram[] = []
    for (let h = 0; h < MAX_HOURS; h++) fakes.push(fakeProgram(guideStart, id, h, h + 1, noData))
    out.set(id, fakes)
  }
  // final order: by start within each channel (sortedWith(channel index, start))
  for (const list of out.values()) list.sort((a, b) => a.start - b.start)
  return out
}

const within = (a: IndexRange, b: IndexRange) => a.first >= b.first && a.last <= b.last

/**
 * `onFocusChannel` (LiveTvViewModel.kt:498-538): the channel window to fetch when row `row` gets focus, or
 * null when the programs already fetched cover it.
 */
export function windowToFetch(row: number, channelCount: number, fetched: IndexRange, range = FETCH_RANGE): IndexRange | null {
  const quarter = Math.trunc(range / 4)
  let rangeStart = fetched.first + quarter
  let rangeEnd = fetched.last - quarter
  // Upstream widens the test range to the list start / end whenever the focused row is near it, even when the
  // fetched window is elsewhere (LiveTvViewModel.kt:506-514): after a jump (Back to the top, a scroll) the rows
  // there then stay empty. The widening only applies when the fetched window really touches that end.
  if (rangeEnd - rangeStart < range) {
    if (row < range / 2 && fetched.first === 0) rangeStart = 0
    else if (row > channelCount - range / 2 && fetched.last >= channelCount - 1) rangeEnd = channelCount
  }
  const inTest = row >= rangeStart && row < rangeEnd
  const next: IndexRange = { first: Math.max(0, row - range), last: Math.min(row + range, channelCount) - 1 }
  if (!inTest && !within(next, fetched)) return next
  return null
}

/**
 * `TvProgram.quickDetails` (LiveTvViewModel.kt:614-655): time range (+ weekday when not today), then for real
 * programs the rounded duration, "N left" while airing, "S1 E2" and the official rating.
 */
export function quickDetails(p: TvProgram, nowMs: number, t: Translate, locale?: string): string[] {
  const parts = [formatTimeRange(p.start, p.end, locale, !sameLocalDate(p.start, nowMs))]
  if (isFake(p)) return parts
  parts.push(formatDuration(t, roundMinutesMs(p.durationMs)))
  if (nowMs > p.start && nowMs < p.end) parts.push(t('time_left', { p1: formatDuration(t, roundMinutesMs(p.end - nowMs)) }))
  const se = formatSeasonEpisode(t, p.seasonEpisode?.season, p.seasonEpisode?.episode)
  if (se) parts.push(se)
  if (p.officialRating) parts.push(p.officialRating)
  return parts
}

/** Program cell second line (Components.kt:113-124): "S1 E2 - Episode title". */
export function programSubtitle(p: TvProgram, t: Translate): string | null {
  const se = formatSeasonEpisode(t, p.seasonEpisode?.season, p.seasonEpisode?.episode)
  const s = [se, p.subtitle].filter((x): x is string => x != null).join(' - ')
  return s.trim() ? s : null
}

/** `BaseItemDto.seasonEpisode` + episode title joined by " - " (ProgramDialog.kt:103-114, DvrSchedule.kt:329-341). */
export function dtoSeasonEpisodeLine(dto: BaseItemDto, t: Translate): string | null {
  if (!dto.IsSeries) return null
  const se = formatSeasonEpisode(t, dto.ParentIndexNumber, dto.IndexNumber, dto.IndexNumberEnd)
  const s = [se, dto.EpisodeTitle].filter((x): x is string => x != null).join(' - ')
  return s.trim() ? s : null
}

/** Index of the program in `list` (sorted by start) that is airing at `hour`, else the nearest one. */
export function programAtHour(list: readonly TvProgram[], hour: number): number {
  if (list.length === 0) return -1
  let lo = 0
  let hi = list.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (list[mid].startHours <= hour) lo = mid
    else hi = mid - 1
  }
  return lo
}

/**
 * Up/Down target in the neighbouring row (Compose 2-D focus search: candidates overlapping the focused cell
 * win, then the closest centre). `span` is the focused cell's [startHours, endHours].
 */
export function verticalTarget(list: readonly TvProgram[], span: { start: number; end: number }): number {
  if (list.length === 0) return -1
  const center = (span.start + span.end) / 2
  let best = -1
  let bestScore = Infinity
  list.forEach((p, i) => {
    const s = p.startHours
    const e = p.startHours + Math.abs(p.endHours - p.startHours)
    const overlaps = e > span.start && s < span.end
    const score = (overlaps ? 0 : 1e6) + Math.abs((s + e) / 2 - center)
    if (score < bestScore) {
      bestScore = score
      best = i
    }
  })
  return best
}
