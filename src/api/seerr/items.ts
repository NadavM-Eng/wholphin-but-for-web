/**
 * `DiscoverItem` and `SeerrService.createDiscoverItem` / `createImageUrl` (W/data/model/DiscoverItem.kt,
 * W/services/SeerrService.kt). Items that exist in Jellyfin (`mediaInfo.jellyfinMediaId[4k]`) use the
 * Jellyfin images; others use TMDB, through Seerr's image proxy when `cacheImages` is on.
 */
import { buildItemImageUrl, imagePx } from '../images'
import { isUuid, normalizeId } from '../../lib/ids'
import { availabilityFrom, type Availability } from './status'
import { seerrProxyPath } from './client'
import type {
  CreditCast,
  CreditCrew,
  MediaInfo,
  MovieDetails,
  MovieResult,
  PublicSettings,
  SearchResult,
  TvDetails,
  TvResult,
} from './types'

export type SeerrItemType = 'movie' | 'tv' | 'person' | 'unknown'

export function itemTypeFrom(s: string | null | undefined, fallback: SeerrItemType = 'unknown'): SeerrItemType {
  return s === 'movie' || s === 'tv' || s === 'person' ? s : fallback
}

export interface DiscoverItem {
  /** TMDB id */
  id: number
  type: SeerrItemType
  title: string | null
  /** character / crew job for credits */
  subtitle: string | null
  overview: string | null
  availability: Availability
  /** release_date / first_air_date as sent (yyyy-MM-dd) */
  releaseDate: string | null
  posterUrl: string | null
  backdropUrl: string | null
  logoUrl: string | null
  /** 32-hex Jellyfin item id when the title is in the library */
  jellyfinItemId: string | null
}

/** Context for building image URLs: Jellyfin base URL (current session) and Seerr's public settings. */
export interface ImageContext {
  jellyfinBaseUrl: string | null
  settings: PublicSettings | null | undefined
}

/** `MediaInfo.jellyfinId`: the 4K id when it parses, else the normal id. */
export function jellyfinIdOf(mediaInfo: MediaInfo | null | undefined): string | null {
  const four = mediaInfo?.jellyfinMediaId4k
  if (isUuid(four)) return normalizeId(four)
  const normal = mediaInfo?.jellyfinMediaId
  return isUuid(normal) ? normalizeId(normal) : null
}

/** `jellyfinIdAsString` for the "Unknown Jellyfin ID" toast. */
export const jellyfinIdString = (m: MediaInfo | null | undefined): string | null =>
  m?.jellyfinMediaId4k || m?.jellyfinMediaId || null

export type SeerrImageType = 'Primary' | 'Backdrop' | 'Logo'

const POSTER_DP = 172

/** `createImageUrl`. `backdropSize` lets the genre cards ask for 1280x720 instead of 1920x1080. */
export function createImageUrl(
  ctx: ImageContext,
  type: SeerrImageType,
  path: string | null | undefined,
  mediaInfo: MediaInfo | null | undefined,
  backdropSize: { width: number; height: number } = {
    width: 1920,
    height: 1080,
  },
): string | null {
  const jfId = jellyfinIdOf(mediaInfo)
  if (jfId) {
    const fill =
      type === 'Primary' ? { fillHeight: imagePx(POSTER_DP * 2) } : type === 'Backdrop' ? { fillWidth: imagePx(1280) } : {}
    return buildItemImageUrl(ctx.jellyfinBaseUrl, jfId, type, fill)
  }
  if (!path?.trim() || type === 'Logo') return null
  const proxy = seerrProxyPath()
  const base = ctx.settings?.cacheImages && proxy ? `${proxy}/imageproxy/tmdb` : 'https://image.tmdb.org'
  const prefix = type === 'Primary' ? '/t/p/w500' : `/t/p/w${backdropSize.width}_and_h${backdropSize.height}_multi_faces`
  return `${base}${prefix}${path}`
}

function make(
  ctx: ImageContext,
  base: Omit<DiscoverItem, 'posterUrl' | 'backdropUrl' | 'logoUrl' | 'jellyfinItemId' | 'availability'>,
  mediaInfo: MediaInfo | undefined,
  posterPath: string | null | undefined,
  backdropPath: string | null | undefined,
): DiscoverItem {
  return {
    ...base,
    availability: availabilityFrom(mediaInfo?.status),
    posterUrl: createImageUrl(ctx, 'Primary', posterPath, mediaInfo),
    backdropUrl: createImageUrl(ctx, 'Backdrop', backdropPath, mediaInfo),
    logoUrl: createImageUrl(ctx, 'Logo', null, mediaInfo),
    jellyfinItemId: jellyfinIdOf(mediaInfo),
  }
}

const s = (v: string | null | undefined) => (v == null || v === '' ? null : v)

export function fromMovie(ctx: ImageContext, m: MovieResult | MovieDetails): DiscoverItem {
  return make(
    ctx,
    {
      id: m.id ?? -1,
      type: 'movie',
      title: s(m.title),
      subtitle: null,
      overview: s(m.overview),
      releaseDate: s(m.releaseDate),
    },
    m.mediaInfo,
    m.posterPath,
    m.backdropPath,
  )
}

export function fromTv(ctx: ImageContext, t: TvResult | TvDetails): DiscoverItem {
  return make(
    ctx,
    {
      id: t.id ?? -1,
      type: 'tv',
      title: s(t.name),
      subtitle: null,
      overview: s(t.overview),
      releaseDate: s(t.firstAirDate),
    },
    t.mediaInfo,
    t.posterPath,
    t.backdropPath,
  )
}

/** Search / trending results: `title ?: name`, `releaseDate ?: firstAirDate`, type from `mediaType`. */
export function fromSearch(ctx: ImageContext, r: SearchResult): DiscoverItem {
  return make(
    ctx,
    {
      id: r.id,
      type: itemTypeFrom(r.mediaType),
      title: s(r.title) ?? s(r.name),
      subtitle: null,
      overview: s(r.overview),
      releaseDate: s(r.releaseDate) ?? s(r.firstAirDate),
    },
    r.mediaInfo,
    // Upstream passes posterPath only; a person result has profilePath instead, used here so people get a picture.
    r.posterPath ?? r.profilePath,
    r.backdropPath,
  )
}

/** Credits: `name ?: title`, subtitle character/job, poster falls back to profilePath, type defaults to person. */
export function fromCredit(ctx: ImageContext, c: CreditCast | CreditCrew): DiscoverItem {
  const subtitle = 'character' in c ? s(c.character) : s((c as CreditCrew).job)
  return make(
    ctx,
    {
      id: c.id,
      type: itemTypeFrom(c.mediaType, 'person'),
      title: s(c.name) ?? s(c.title),
      subtitle,
      overview: s(c.overview),
      releaseDate: s(c.releaseDate) ?? s(c.firstAirDate),
    },
    c.mediaInfo,
    c.posterPath ?? c.profilePath,
    c.backdropPath,
  )
}

/** Year of a `yyyy-MM-dd` date (upstream `toLocalDate(...)?.year`). */
export function yearOfDate(date: string | null | undefined): number | null {
  const m = /^(\d{4})-\d{1,2}-\d{1,2}/.exec(date ?? '')
  return m ? Number(m[1]) : null
}

/**
 * Combined credits of a person: cast then crew, de-duplicated by id (cast first), sorted by release
 * date descending with undated entries last (`SeerrService.personCredits`).
 */
export function mergeCredits(items: DiscoverItem[]): DiscoverItem[] {
  const seen = new Set<number>()
  const unique = items.filter((i) => (seen.has(i.id) ? false : (seen.add(i.id), true)))
  return unique
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const da = a.item.releaseDate
      const db = b.item.releaseDate
      if (da && db) return da < db ? 1 : da > db ? -1 : a.index - b.index
      if (da) return -1
      if (db) return 1
      return a.index - b.index
    })
    .map((x) => x.item)
}
