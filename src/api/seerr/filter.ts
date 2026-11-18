/**
 * Discover grid sort/filter model (W/data/filter/DiscoverFilter.kt, W/util/DiscoverRequestPager.kt).
 */
import type { SeerrQuery } from './client'

/** Seerr pages are 20 items, 1-indexed. */
export const SEERR_PAGE_SIZE = 20

export const DISCOVER_REQUEST_TYPES = ['DISCOVER_TV', 'DISCOVER_MOVIES', 'TRENDING', 'UPCOMING_TV', 'UPCOMING_MOVIES'] as const
export type DiscoverRequestType = (typeof DISCOVER_REQUEST_TYPES)[number]

/** URL slug of each "view more" grid. */
export const REQUEST_TYPE_SLUG: Record<DiscoverRequestType, string> = {
  DISCOVER_TV: 'tv',
  DISCOVER_MOVIES: 'movies',
  TRENDING: 'trending',
  UPCOMING_TV: 'upcoming-tv',
  UPCOMING_MOVIES: 'upcoming-movies',
}

export function requestTypeFromSlug(slug: string | null | undefined): DiscoverRequestType | null {
  const hit = (Object.keys(REQUEST_TYPE_SLUG) as DiscoverRequestType[]).find((k) => REQUEST_TYPE_SLUG[k] === slug)
  return hit ?? null
}

/** Title string key of each type (`DiscoverRequestType.stringRes`). */
export const REQUEST_TYPE_TITLE: Record<DiscoverRequestType, string> = {
  DISCOVER_TV: 'discover_tv',
  DISCOVER_MOVIES: 'discover_movies',
  TRENDING: 'trending',
  UPCOMING_TV: 'upcoming_tv',
  UPCOMING_MOVIES: 'upcoming_movies',
}

export const DISCOVER_SORTS = ['POPULARITY', 'RELEASE_DATE', 'TMDB_VOTE', 'ALPHABETICAL'] as const
export type DiscoverSort = (typeof DISCOVER_SORTS)[number]

const SORT_KEY: Record<DiscoverSort, { movie: string; tv: string; label: string }> = {
  POPULARITY: { movie: 'popularity', tv: 'popularity', label: 'popularity' },
  RELEASE_DATE: {
    movie: 'release_date',
    tv: 'first_air_date',
    label: 'sort_by_date_released',
  },
  TMDB_VOTE: {
    movie: 'vote_average',
    tv: 'vote_average',
    label: 'community_rating',
  },
  ALPHABETICAL: {
    movie: 'original_title',
    tv: 'original_title',
    label: 'sort_by_name',
  },
}

export const sortLabelKey = (s: DiscoverSort) => SORT_KEY[s].label

export interface DiscoverSortAndDirection {
  sort: DiscoverSort
  direction: 'asc' | 'desc'
}

export const DEFAULT_SORT: DiscoverSortAndDirection = {
  sort: 'POPULARITY',
  direction: 'desc',
}

export const sortKey = (s: DiscoverSortAndDirection, isTv: boolean) => `${SORT_KEY[s.sort][isTv ? 'tv' : 'movie']}.${s.direction}`

/** Picking an option: the same option flips the direction, another keeps it. */
export function nextSort(current: DiscoverSortAndDirection, picked: DiscoverSort): DiscoverSortAndDirection {
  if (current.sort === picked)
    return {
      sort: picked,
      direction: current.direction === 'asc' ? 'desc' : 'asc',
    }
  return { sort: picked, direction: current.direction }
}

/** `TvShowStatus` in declaration order; the ordinal is what Seerr receives. */
export const TV_SHOW_STATUSES = ['Returning Series', 'Planned', 'In Production', 'Ended', 'Canceled', 'Pilot'] as const

export interface DiscoverFilter {
  genreIds?: number[] | null
  /** watch providers ("Studios") */
  networkIds?: number[] | null
  voteAverageGte?: number | null
  /** TV only: indexes into TV_SHOW_STATUSES */
  status?: number[] | null
  certification?: string[] | null
}

export type DiscoverFilterKind = 'genres' | 'studios' | 'rating' | 'certification' | 'status'

export interface DiscoverFilterOption {
  kind: DiscoverFilterKind
  labelKey: string
}

const GENRES: DiscoverFilterOption = { kind: 'genres', labelKey: 'genres' }
const STUDIOS: DiscoverFilterOption = { kind: 'studios', labelKey: 'studios' }
const RATING: DiscoverFilterOption = {
  kind: 'rating',
  labelKey: 'community_rating',
}
const CERT: DiscoverFilterOption = {
  kind: 'certification',
  labelKey: 'official_rating',
}
const STATUS: DiscoverFilterOption = {
  kind: 'status',
  labelKey: 'production_status',
}

export const DISCOVER_MOVIE_FILTERS = [GENRES, STUDIOS, RATING, CERT]
export const DISCOVER_TV_FILTERS = [GENRES, STUDIOS, RATING, CERT, STATUS]

export function getFilterValue(f: DiscoverFilter, kind: DiscoverFilterKind): number[] | string[] | number | null {
  switch (kind) {
    case 'genres':
      return f.genreIds ?? null
    case 'studios':
      return f.networkIds ?? null
    case 'rating':
      return f.voteAverageGte ?? null
    case 'certification':
      return f.certification ?? null
    case 'status':
      return f.status ?? null
  }
}

export function setFilterValue(f: DiscoverFilter, kind: DiscoverFilterKind, value: unknown): DiscoverFilter {
  const list = <T>(v: unknown) => (Array.isArray(v) && v.length > 0 ? (v as T[]) : null)
  switch (kind) {
    case 'genres':
      return { ...f, genreIds: list<number>(value) }
    case 'studios':
      return { ...f, networkIds: list<number>(value) }
    case 'rating':
      return { ...f, voteAverageGte: typeof value === 'number' ? value : null }
    case 'certification':
      return { ...f, certification: list<string>(value) }
    case 'status':
      return { ...f, status: list<number>(value) }
  }
}

/** Filters available for a grid, minus those fixed by the entry point (e.g. the genre of a genre card). */
export function filterOptionsFor(type: DiscoverRequestType, initial: DiscoverFilter): DiscoverFilterOption[] {
  const all = type === 'DISCOVER_MOVIES' ? DISCOVER_MOVIE_FILTERS : type === 'DISCOVER_TV' ? DISCOVER_TV_FILTERS : []
  return all.filter((o) => getFilterValue(initial, o.kind) == null)
}

export const sortOptionsFor = (type: DiscoverRequestType): readonly DiscoverSort[] =>
  type === 'DISCOVER_MOVIES' || type === 'DISCOVER_TV' ? DISCOVER_SORTS : []

export const countFilters = (f: DiscoverFilter, options: DiscoverFilterOption[]) =>
  options.filter((o) => getFilterValue(f, o.kind) != null).length

export function clearFilters(f: DiscoverFilter, options: DiscoverFilterOption[]): DiscoverFilter {
  return options.reduce((acc, o) => setFilterValue(acc, o.kind, null), f)
}

/**
 * Toggle one value of a multi-select filter. The rating filter is a single minimum: picking a value sets it,
 * re-picking the same value keeps it (FilterByButton.kt `DiscoverRatingFilter -> set(value)`).
 */
export function toggleFilterValue(f: DiscoverFilter, kind: DiscoverFilterKind, value: number | string): DiscoverFilter {
  if (kind === 'rating') return setFilterValue(f, kind, value)
  const cur = (getFilterValue(f, kind) as (number | string)[] | null) ?? []
  const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value]
  return setFilterValue(f, kind, next)
}

/** Query of GET /discover/movies or /discover/tv (`DiscoverFilter.discoverMovies` / `discoverTv`). */
export function discoverQuery(f: DiscoverFilter, sort: DiscoverSortAndDirection | null, isTv: boolean, page: number): SeerrQuery {
  const q: SeerrQuery = { page }
  if (f.genreIds?.length) q.genre = f.genreIds.join(',')
  if (sort) q.sortBy = sortKey(sort, isTv)
  if (f.voteAverageGte != null) q.voteAverageGte = f.voteAverageGte
  if (f.networkIds?.length) {
    q.watchRegion = 'US'
    q.watchProviders = f.networkIds.join(',')
  }
  if (isTv && f.status?.length) q.status = f.status.join('|')
  if (f.certification?.length) {
    q.certification = f.certification.join('|')
    q.certificationCountry = 'US'
    q.certificationMode = 'exact'
  }
  return q
}

export const MOVIE_CERTIFICATIONS = ['NR', 'G', 'PG', 'PG-13', 'R', 'NC-17']
export const TV_CERTIFICATIONS = ['NR', 'TV-Y', 'TV-Y7', 'TV-G', 'TV-PG', 'TV-14', 'TV-MA']

/** Encodes a filter for the URL (`?f=`) so a "view more" grid survives reload and Back. */
export function encodeFilter(f: DiscoverFilter): string | null {
  const parts: string[] = []
  if (f.genreIds?.length) parts.push(`g:${f.genreIds.join('.')}`)
  if (f.networkIds?.length) parts.push(`n:${f.networkIds.join('.')}`)
  if (f.voteAverageGte != null) parts.push(`r:${f.voteAverageGte}`)
  if (f.status?.length) parts.push(`s:${f.status.join('.')}`)
  if (f.certification?.length) parts.push(`c:${f.certification.map(encodeURIComponent).join('.')}`)
  return parts.length ? parts.join('~') : null
}

export function decodeFilter(s: string | null | undefined): DiscoverFilter {
  const f: DiscoverFilter = {}
  if (!s) return f
  // Malformed or empty values are ignored rather than becoming a real filter (or throwing).
  const ints = (v: string) =>
    v
      .split('.')
      .filter((x) => /^\d+$/.test(x))
      .map(Number)
  const strs = (v: string) =>
    v.split('.').flatMap((x) => {
      if (!x) return []
      try {
        const d = decodeURIComponent(x)
        return d ? [d] : []
      } catch {
        return []
      }
    })
  for (const part of s.split('~')) {
    const [k, v = ''] = part.split(':', 2)
    if (k === 'g') {
      const l = ints(v)
      if (l.length) f.genreIds = l
    } else if (k === 'n') {
      const l = ints(v)
      if (l.length) f.networkIds = l
    } else if (k === 'r') {
      if (/^\d+(\.\d+)?$/.test(v)) f.voteAverageGte = Number(v)
    } else if (k === 's') {
      const l = ints(v)
      if (l.length) f.status = l
    } else if (k === 'c') {
      const l = strs(v)
      if (l.length) f.certification = l
    }
  }
  return f
}
