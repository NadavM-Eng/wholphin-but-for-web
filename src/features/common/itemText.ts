// Per-kind text rules of upstream `BaseItem` (W/data/model/BaseItem.kt) and `HomePageHeader`
// (W/ui/main/HomePage.kt:542-581): card titles/subtitles, corner pills and the quick-details line.
// Pure functions: pass i18next's `t` and the locale.
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models'
import {
  formatDate,
  formatDuration,
  formatEndsAt,
  formatEpisodeNumber,
  formatRuntime,
  formatSeasonEpisode,
  formatTimeOfDay,
  roundMinutesMs,
  seriesProductionYears,
  ticksToMs,
  abbreviateNumber,
  type Translate,
} from '../../lib/format'

/** Upstream `DisplayToggle` (interface preference `displayToggles`). */
export type DisplayToggle = 'OFFICIAL_RATING' | 'CRITIC_RATING' | 'COMMUNITY_RATING'

const joinNotBlank = (parts: (string | null | undefined)[], sep: string): string | null => {
  const s = parts.filter((p): p is string => !!p && p.trim() !== '').join(sep)
  return s === '' ? null : s
}

/** `BaseItem.title`: the series name for episodes, else the name. */
export function itemTitle(item: BaseItemDto | null | undefined): string | null {
  if (!item) return null
  return (item.Type === 'Episode' ? item.SeriesName : item.Name) ?? null
}

/** `data.seasonEpisode`: "S1 E3" / "S1 E3-E4", null without season or episode number. */
export function seasonEpisode(t: Translate, item: BaseItemDto): string | null {
  return formatSeasonEpisode(t, item.ParentIndexNumber, item.IndexNumber, item.IndexNumberEnd)
}

/** `artistsString` (SongListDisplay.kt:165). */
export function artistsString(item: BaseItemDto): string | null {
  return item.Artists?.length ? item.Artists.join(', ') : null
}

/** `BaseItem.subtitle`: second line under a card title. */
export function itemSubtitle(t: Translate, item: BaseItemDto | null | undefined): string | null {
  if (!item) return null
  switch (item.Type) {
    case 'Episode':
      return joinNotBlank([seasonEpisode(t, item), item.Name], ' - ')
    case 'Series':
      return seriesProductionYears(t, item)
    case 'Audio':
      return joinNotBlank([item.Album, artistsString(item)], ' - ')
    case 'MusicAlbum':
      return joinNotBlank([item.AlbumArtist ?? artistsString(item), item.ProductionYear?.toString()], ' - ')
    default:
      return item.ProductionYear?.toString() ?? null
  }
}

/** Name drawn inside an image-less `BannerCard` (`data.seriesName ?: name`). */
export function cardFallbackName(item: BaseItemDto | null | undefined): string | null {
  return item?.SeriesName ?? item?.Name ?? null
}

/** Home header title: series name for episodes and seasons, else `title`. */
export function headerTitle(item: BaseItemDto | null | undefined): string | null {
  if (!item) return null
  if (item.Type === 'Episode' || item.Type === 'Season') return item.SeriesName ?? null
  return itemTitle(item)
}

/** Home header subtitle: the episode / season name, else none. */
export function headerSubtitle(item: BaseItemDto | null | undefined): string | null {
  if (!item) return null
  return item.Type === 'Episode' || item.Type === 'Season' ? (item.Name ?? null) : null
}

/**
 * `data.timeRemaining` (Extensions.kt:243-251): runtime - position, only when the position is > 0 and
 * the result is > 0. Ticks.
 */
export function remainingTicks(item: BaseItemDto | null | undefined): number | null {
  const pos = item?.UserData?.PlaybackPositionTicks ?? 0
  const run = item?.RunTimeTicks
  if (pos <= 0 || run == null) return null
  const left = run - pos
  return left > 0 ? left : null
}

/** `timeRemainingOrRuntime`: null for programs, else remaining ?: runtime. Ticks. */
export function remainingOrRuntimeTicks(item: BaseItemDto | null | undefined): number | null {
  if (!item || item.Type === 'Program') return null
  return remainingTicks(item) ?? item.RunTimeTicks ?? null
}

/** `ui.episodeUnplayedCornerText`: "E3" for episodes, abbreviated unplayed count for series/seasons/box sets. */
export function unplayedCornerText(t: Translate, item: BaseItemDto, locale?: string): string | null {
  switch (item.Type) {
    case 'Episode':
      return item.IndexNumber != null ? formatEpisodeNumber(t, item.IndexNumber) : null
    case 'Series':
    case 'Season':
    case 'BoxSet': {
      const n = item.UserData?.UnplayedItemCount ?? 0
      return n > 0 ? abbreviateNumber(n, locale) : null
    }
    default:
      return null
  }
}

/** `ui.episodeCornerText`: "E3", or the premiere date when the episode has no number; null otherwise. */
export function episodeCornerText(t: Translate, item: BaseItemDto, locale?: string): string | null {
  if (item.Type !== 'Episode') return null
  if (item.IndexNumber != null) return formatEpisodeNumber(t, item.IndexNumber)
  return formatDate(item.PremiereDate, locale)
}

/** `ui.quickDetails.basic` (BaseItem.kt:142-230): the parts joined by the dot separator. */
export function quickDetailsBasic(t: Translate, item: BaseItemDto, locale?: string): string[] {
  const out: (string | null | undefined)[] = []
  const year = item.ProductionYear?.toString()
  switch (item.Type) {
    case 'Episode':
      out.push(seasonEpisode(t, item), formatDate(item.PremiereDate, locale))
      break
    case 'Season':
      if (item.ChildCount != null) out.push(t('episodes_count', { count: item.ChildCount }))
      out.push(year)
      break
    case 'Series':
      out.push(seriesProductionYears(t, item))
      break
    case 'Photo':
      // upstream: premiereDate.toLocalDate().toString() (ISO date)
      out.push(year ?? item.PremiereDate?.slice(0, 10))
      break
    case 'BoxSet':
      out.push(year)
      // literal English in upstream (BaseItem.kt:187)
      if (item.ChildCount != null) out.push(`${item.ChildCount} items`)
      break
    case 'Program':
      out.push(item.ChannelName)
      if (item.IsSeries) out.push(seasonEpisode(t, item), formatDate(item.PremiereDate, locale))
      else out.push(year)
      break
    default:
      out.push(year)
  }
  out.push(formatRuntime(t, item.RunTimeTicks))
  const left = remainingTicks(item)
  if (left != null) out.push(t('time_left', { p1: formatDuration(t, roundMinutesMs(ticksToMs(left))) }))
  return out.filter((p): p is string => !!p)
}

export type QuickDetailsData = {
  parts: string[]
  officialRating: string | null
  communityRating: number | null
  criticRating: number | null
  endsAt: string | null
}

/**
 * Everything the UI kit's `QuickDetails` needs for an item (`QuickDetails.kt:36-64`): basic parts,
 * the ratings allowed by the display toggles, and "Ends at" from now + remaining-or-runtime, else the
 * item's end date (live TV programs).
 */
export function quickDetailsFor(
  t: Translate,
  item: BaseItemDto,
  opts: { toggles: readonly DisplayToggle[]; nowMs: number; locale?: string },
): QuickDetailsData {
  const on = (x: DisplayToggle) => opts.toggles.includes(x)
  const remaining = remainingOrRuntimeTicks(item)
  let endsAt: string | null = null
  if (remaining != null) endsAt = formatEndsAt(t, opts.nowMs, remaining, opts.locale)
  else if (item.EndDate) {
    const d = new Date(item.EndDate)
    if (!Number.isNaN(d.getTime())) endsAt = t('ends_at', { p1: formatTimeOfDay(d, opts.locale) })
  }
  return {
    parts: quickDetailsBasic(t, item, opts.locale),
    officialRating: on('OFFICIAL_RATING') ? (item.OfficialRating ?? null) : null,
    communityRating: on('COMMUNITY_RATING') ? (item.CommunityRating ?? null) : null,
    criticRating: on('CRITIC_RATING') ? (item.CriticRating ?? null) : null,
    endsAt,
  }
}
