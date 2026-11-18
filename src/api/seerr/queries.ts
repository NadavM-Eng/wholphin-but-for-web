/**
 * TanStack Query hooks for the Seerr screens (the data side of SeerrDiscoverViewModel,
 * DiscoverRequestViewModel, SeerrRequestsViewModel, DiscoverMovieViewModel, DiscoverSeriesViewModel,
 * DiscoverPersonViewModel and FilterOptionCache). Keys: qk('seerr', seerrUserId, jellyfinBaseUrl, cacheImages, ...).
 */
import { useInfiniteQuery, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { formatBytes } from '../../lib/format'
import { qk } from '../queryKeys'
import { useSession } from '../session'
import { isAuthError } from './client'
import { seerrApi } from './endpoints'
import {
  discoverQuery,
  MOVIE_CERTIFICATIONS,
  TV_CERTIFICATIONS,
  TV_SHOW_STATUSES,
  type DiscoverFilter,
  type DiscoverFilterKind,
  type DiscoverRequestType,
  type DiscoverSortAndDirection,
} from './filter'
import {
  createImageUrl,
  fromCredit,
  fromMovie,
  fromSearch,
  fromTv,
  mergeCredits,
  type DiscoverItem,
  type ImageContext,
} from './items'
import { hasPermission } from './permissions'
import { usePrefs } from '../../stores/preferences'
import { useSeerrSession, verifySeerrSession } from './session'
import type { MediaRequest, PublicSettings, SeerrUser, ServiceDetails, ServiceServer } from './types'

/** Runs a Seerr call; a 401/403 re-checks the session (which may flip the UI to "sign in again"). */
async function guard<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (e) {
    if (isAuthError(e)) void verifySeerrSession()
    throw e
  }
}

export function useSeerrImageContext(): ImageContext {
  const session = useSession()
  const { settings } = useSeerrSession()
  const jellyfinBaseUrl = session?.api.basePath ?? null
  return useMemo(() => ({ jellyfinBaseUrl, settings }), [jellyfinBaseUrl, settings])
}

/**
 * Query-key prefix of everything Seerr for the signed-in Seerr user. Cached items carry finished image and
 * Jellyfin URLs, so what they are built from (`useSeerrImageContext`: the Jellyfin base URL and Seerr's
 * `cacheImages`) is part of the key too.
 */
export function useSeerrKey(): (...parts: unknown[]) => readonly unknown[] {
  const { user, settings } = useSeerrSession()
  const session = useSession()
  const id = user?.id ?? null
  const base = session?.api.basePath ?? null
  const cache = !!settings?.cacheImages
  return useMemo(
    () =>
      (...parts: unknown[]) =>
        qk('seerr', id, base, cache, ...(parts as never[])),
    [id, base, cache],
  )
}

/** Invalidate every Seerr query (after a request / cancel changes availability everywhere). */
export function invalidateSeerr(client: QueryClient) {
  return client.invalidateQueries({ queryKey: qk('seerr') })
}

export type DiscoverRowKind = 'TRENDING' | 'DISCOVER_MOVIES' | 'DISCOVER_TV' | 'UPCOMING_MOVIES' | 'UPCOMING_TV'

/** One Discover-tab row, page 1 (`SeerrService.trending/discoverMovies/...`). */
export function useDiscoverRow(kind: DiscoverRowKind) {
  const { active } = useSeerrSession()
  const key = useSeerrKey()
  const ctx = useSeerrImageContext()
  return useQuery({
    queryKey: key('row', kind),
    enabled: active,
    staleTime: 5 * 60_000,
    queryFn: ({ signal }) =>
      guard(async (): Promise<DiscoverItem[]> => {
        switch (kind) {
          case 'TRENDING':
            return ((await seerrApi.trending(1, { signal })).results ?? []).map((r) => fromSearch(ctx, r))
          case 'DISCOVER_MOVIES':
            return ((await seerrApi.discoverMovies({ page: 1 }, { signal })).results ?? []).map((r) => fromMovie(ctx, r))
          case 'DISCOVER_TV':
            return ((await seerrApi.discoverTv({ page: 1 }, { signal })).results ?? []).map((r) => fromTv(ctx, r))
          case 'UPCOMING_MOVIES':
            return ((await seerrApi.upcomingMovies(1, { signal })).results ?? []).map((r) => fromMovie(ctx, r))
          case 'UPCOMING_TV':
            return ((await seerrApi.upcomingTv(1, { signal })).results ?? []).map((r) => fromTv(ctx, r))
        }
      }),
  })
}

export interface DiscoverGenre {
  id: number
  name: string
  imageUrl: string | null
}

/** Genre slider rows; each genre gets one random backdrop (1280x720) at load. */
export function useGenreSlider(type: 'movie' | 'tv') {
  const { active } = useSeerrSession()
  const key = useSeerrKey()
  const ctx = useSeerrImageContext()
  return useQuery({
    queryKey: key('genres', type),
    enabled: active,
    staleTime: 30 * 60_000,
    queryFn: ({ signal }) =>
      guard(async (): Promise<DiscoverGenre[]> => {
        const list = type === 'movie' ? await seerrApi.genreSliderMovie({ signal }) : await seerrApi.genreSliderTv({ signal })
        return list
          .filter((g): g is { id: number; name: string; backdrops?: string[] } => g.id != null && g.name != null)
          .map((g) => {
            const b = g.backdrops?.length ? g.backdrops[Math.floor(Math.random() * g.backdrops.length)] : null
            return {
              id: g.id,
              name: g.name,
              imageUrl: b
                ? createImageUrl(ctx, 'Backdrop', b, null, {
                    width: 1280,
                    height: 720,
                  })
                : null,
            }
          })
      }),
  })
}

export interface DiscoverRating {
  critic: number | null
  /** audienceScore / 10 (0-10 scale) */
  audience: number | null
}

/**
 * Rotten Tomatoes ratings (`getDiscoverRating`): movie -> critic + audience, tv -> critic only, person /
 * unknown -> none. Failures (404 included) give an empty rating and are not retried. Keyed by type and id
 * (upstream keys only by id, so a movie and a show with the same TMDB id collide).
 */
export function useDiscoverRating(type: string | null | undefined, id: number | null | undefined) {
  const { active } = useSeerrSession()
  const key = useSeerrKey()
  return useQuery({
    queryKey: key('rating', type, id),
    enabled: active && id != null && (type === 'movie' || type === 'tv'),
    staleTime: Infinity,
    retry: false,
    queryFn: async ({ signal }): Promise<DiscoverRating> => {
      try {
        if (type === 'movie') {
          const r = await seerrApi.movieRatings(id!, { signal })
          return {
            critic: r.criticsScore ?? null,
            audience: r.audienceScore != null ? r.audienceScore / 10 : null,
          }
        }
        const r = await seerrApi.tvRatings(id!, { signal })
        return { critic: r.criticsScore ?? null, audience: null }
      } catch {
        return { critic: null, audience: null }
      }
    },
  })
}

export interface RequestGridItem {
  request: MediaRequest
  item: DiscoverItem
}

/** Run `fn` over `items` with at most `limit` in flight (upstream Semaphore(3)). */
async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

/** Request tab (`SeerrRequestsViewModel`): GET /request, then each title's details, 3 at a time. Any failure fails the tab. */
export function useRequests() {
  const { active } = useSeerrSession()
  const key = useSeerrKey()
  const ctx = useSeerrImageContext()
  return useQuery({
    queryKey: key('requests'),
    enabled: active,
    queryFn: ({ signal }) =>
      guard(async (): Promise<RequestGridItem[]> => {
        const results = (await seerrApi.requests({ signal })).results ?? []
        const usable = results.filter((r) => r.media?.tmdbId != null && (r.type === 'movie' || r.type === 'tv'))
        return mapLimit(usable, 3, async (request) => {
          const id = request.media!.tmdbId!
          const item =
            request.type === 'movie'
              ? fromMovie(ctx, await seerrApi.movie(id, { signal }))
              : fromTv(ctx, await seerrApi.tv(id, { signal }))
          return { request, item }
        })
      }),
  })
}

/** Discover search (`DiscoverSearchViewModel`): page 1, movies and TV only. */
export function useDiscoverSearch(query: string) {
  const { active } = useSeerrSession()
  const key = useSeerrKey()
  const ctx = useSeerrImageContext()
  const q = query.trim()
  return useQuery({
    queryKey: key('search', q),
    enabled: active && q.length > 0,
    staleTime: 5 * 60_000,
    queryFn: ({ signal }) =>
      guard(async () =>
        ((await seerrApi.search(q, 1, { signal })).results ?? [])
          .map((r) => fromSearch(ctx, r))
          .filter((i) => i.type === 'movie' || i.type === 'tv'),
      ),
  })
}

export interface PagerPage {
  items: DiscoverItem[]
  total: number
  page: number
}

/**
 * `DiscoverRequestPager`: 20 per Seerr page (1-indexed), fetched on demand as the grid scrolls.
 */
export function useDiscoverPager(type: DiscoverRequestType, filter: DiscoverFilter, sort: DiscoverSortAndDirection) {
  const { active } = useSeerrSession()
  const key = useSeerrKey()
  const ctx = useSeerrImageContext()
  const hasSort = type === 'DISCOVER_MOVIES' || type === 'DISCOVER_TV'
  return useInfiniteQuery({
    queryKey: key('pager', type, filter, hasSort ? sort : null),
    enabled: active,
    staleTime: 5 * 60_000,
    initialPageParam: 1,
    getNextPageParam: (last: PagerPage, all) => {
      const loaded = all.reduce((n, p) => n + p.items.length, 0)
      return loaded < last.total && last.items.length > 0 ? last.page + 1 : undefined
    },
    queryFn: ({ pageParam, signal }) =>
      guard(async (): Promise<PagerPage> => {
        const page = pageParam
        switch (type) {
          case 'DISCOVER_MOVIES': {
            const r = await seerrApi.discoverMovies(discoverQuery(filter, sort, false, page), { signal })
            return {
              items: (r.results ?? []).map((x) => fromMovie(ctx, x)),
              total: r.totalResults ?? 0,
              page,
            }
          }
          case 'DISCOVER_TV': {
            const r = await seerrApi.discoverTv(discoverQuery(filter, sort, true, page), { signal })
            return {
              items: (r.results ?? []).map((x) => fromTv(ctx, x)),
              total: r.totalResults ?? 0,
              page,
            }
          }
          case 'TRENDING': {
            const r = await seerrApi.trending(page, { signal })
            return {
              items: (r.results ?? []).map((x) => fromSearch(ctx, x)),
              total: r.totalResults ?? 0,
              page,
            }
          }
          case 'UPCOMING_MOVIES': {
            const r = await seerrApi.upcomingMovies(page, { signal })
            return {
              items: (r.results ?? []).map((x) => fromMovie(ctx, x)),
              total: r.totalResults ?? 0,
              page,
            }
          }
          case 'UPCOMING_TV': {
            const r = await seerrApi.upcomingTv(page, { signal })
            return {
              items: (r.results ?? []).map((x) => fromTv(ctx, x)),
              total: r.totalResults ?? 0,
              page,
            }
          }
        }
      }),
  })
}

export interface FilterValue {
  label: string
  value: number | string
}

/** `FilterOptionCache.getDiscoverFilterOptionValues` (1 h cache). */
export function useFilterValues(kind: DiscoverFilterKind | null, isTv: boolean) {
  const { active } = useSeerrSession()
  const key = useSeerrKey()
  return useQuery({
    queryKey: key('filterValues', kind, isTv),
    enabled: active && kind != null,
    staleTime: 60 * 60_000,
    queryFn: ({ signal }) =>
      guard(async (): Promise<FilterValue[]> => {
        switch (kind) {
          case 'genres': {
            const list = isTv ? await seerrApi.genreSliderTv({ signal }) : await seerrApi.genreSliderMovie({ signal })
            return list.filter((g) => g.id != null && g.name != null).map((g) => ({ label: g.name!, value: g.id! }))
          }
          case 'studios': {
            // Region hard-coded to US upstream (FilterOptionCache TODO).
            const list = isTv
              ? await seerrApi.watchProvidersTv('US', { signal })
              : await seerrApi.watchProvidersMovies('US', { signal })
            return list.filter((p) => p.id != null && p.name != null).map((p) => ({ label: p.name!, value: p.id! }))
          }
          case 'status':
            return TV_SHOW_STATUSES.map((label, value) => ({ label, value }))
          case 'certification':
            return (isTv ? TV_CERTIFICATIONS : MOVIE_CERTIFICATIONS).map((c) => ({ label: c, value: c }))
          case 'rating':
            return Array.from({ length: 10 }, (_, i) => ({
              label: String(i + 1),
              value: i + 1,
            }))
          default:
            return []
        }
      }),
  })
}

// ---------------------------------------------------------------------------------------------
// Details

export function useMovieDetails(id: number | null) {
  const { active } = useSeerrSession()
  const key = useSeerrKey()
  return useQuery({
    queryKey: key('movie', id),
    enabled: active && id != null,
    // Upstream re-fetches the movie on every resume (LifecycleResumeEffect): refetch on mount / focus.
    staleTime: 0,
    refetchOnWindowFocus: true,
    queryFn: ({ signal }) => guard(() => seerrApi.movie(id!, { signal })),
  })
}

export function useTvDetails(id: number | null) {
  const { active } = useSeerrSession()
  const key = useSeerrKey()
  return useQuery({
    queryKey: key('tv', id),
    enabled: active && id != null,
    queryFn: ({ signal }) => guard(() => seerrApi.tv(id!, { signal })),
  })
}

/** "More like this" / "Recommended" (page 1). */
export function useRelated(type: 'movie' | 'tv', kind: 'similar' | 'recommendations', id: number | null) {
  const { active } = useSeerrSession()
  const key = useSeerrKey()
  const ctx = useSeerrImageContext()
  return useQuery({
    queryKey: key(type, id, kind),
    enabled: active && id != null,
    staleTime: 30 * 60_000,
    queryFn: ({ signal }) =>
      guard(async (): Promise<DiscoverItem[]> => {
        if (type === 'movie') {
          const r =
            kind === 'similar'
              ? await seerrApi.movieSimilar(id!, 1, { signal })
              : await seerrApi.movieRecommendations(id!, 1, { signal })
          return (r.results ?? []).map((x) => fromMovie(ctx, x))
        }
        const r =
          kind === 'similar' ? await seerrApi.tvSimilar(id!, 1, { signal }) : await seerrApi.tvRecommendations(id!, 1, { signal })
        return (r.results ?? []).map((x) => fromTv(ctx, x))
      }),
  })
}

export function usePersonCredits(id: number | null) {
  const { active } = useSeerrSession()
  const key = useSeerrKey()
  const ctx = useSeerrImageContext()
  return useQuery({
    queryKey: key('person', id),
    enabled: active && id != null,
    staleTime: 30 * 60_000,
    queryFn: ({ signal }) =>
      guard(async () => {
        const c = await seerrApi.personCombinedCredits(id!, { signal })
        return mergeCredits([...(c.cast ?? []).map((x) => fromCredit(ctx, x)), ...(c.crew ?? []).map((x) => fromCredit(ctx, x))])
      }),
  })
}

// ---------------------------------------------------------------------------------------------
// Request options (`SeerrService.getProfilesAndFolders`)

export interface SeerrProfile {
  id: number
  name: string
  isDefault: boolean
}

export interface SeerrRootFolder {
  id: number
  path: string
  freeSpace: string
  isDefault: boolean
}

export interface SeerrRequestData {
  serverId: number
  server4kId: number
  profiles: SeerrProfile[]
  rootFolders: SeerrRootFolder[]
  profiles4k: SeerrProfile[]
  rootFolders4k: SeerrRootFolder[]
}

export const EMPTY_REQUEST_DATA: SeerrRequestData = {
  serverId: -1,
  server4kId: -1,
  profiles: [],
  rootFolders: [],
  profiles4k: [],
  rootFolders4k: [],
}

export const hasAdvancedData = (d: SeerrRequestData) =>
  d.profiles.length > 0 || d.rootFolders.length > 0 || d.profiles4k.length > 0 || d.rootFolders4k.length > 0

function pickServer(list: ServiceServer[], is4k: boolean): ServiceServer | undefined {
  return list.find((s) => s.isDefault && !!s.is4k === is4k) ?? list.find((s) => !!s.is4k === is4k)
}

function profilesAndFolders(d: ServiceDetails, locale?: string) {
  const activeProfile = d.server?.activeProfileId
  const activeDir = d.server?.activeDirectory
  const profiles = (d.profiles ?? [])
    .filter((p) => p.id != null && p.name != null)
    .map((p) => ({
      id: p.id!,
      name: p.name!,
      isDefault: p.id === activeProfile,
    }))
  const rootFolders = (d.rootFolders ?? [])
    .filter((f) => f.id != null && f.path != null)
    .map((f) => ({
      id: f.id!,
      path: f.path!,
      freeSpace: f.freeSpace != null ? formatBytes(f.freeSpace, undefined, undefined, locale) : '',
      isDefault: f.path === activeDir,
    }))
  return { profiles, rootFolders }
}

/**
 * Radarr/Sonarr servers, quality profiles and root folders, fetched only for users with REQUEST_ADVANCED
 * (admins implied). Everyone else gets empty data and requests use the server defaults.
 */
export async function getProfilesAndFolders(
  type: 'movie' | 'tv',
  user: SeerrUser | null,
  locale?: string,
): Promise<SeerrRequestData> {
  if (!hasPermission(user, 'REQUEST_ADVANCED')) return EMPTY_REQUEST_DATA
  let result = { ...EMPTY_REQUEST_DATA }
  const servers = type === 'movie' ? await seerrApi.radarrServers() : await seerrApi.sonarrServers()
  const detail = (id: number) => (type === 'movie' ? seerrApi.radarrServer(id) : seerrApi.sonarrServer(id))
  const normal = pickServer(servers, false)
  const four = pickServer(servers, true)
  if (normal?.id != null) {
    const pf = profilesAndFolders(await detail(normal.id), locale)
    result = {
      ...result,
      serverId: normal.id,
      profiles: pf.profiles,
      rootFolders: pf.rootFolders,
    }
  }
  if (four?.id != null) {
    const pf = profilesAndFolders(await detail(four.id), locale)
    result = {
      ...result,
      server4kId: four.id,
      profiles4k: pf.profiles,
      rootFolders4k: pf.rootFolders,
    }
  }
  return result
}

export function useInvalidateSeerr() {
  const client = useQueryClient()
  return () => invalidateSeerr(client)
}

export type { PublicSettings }

// ---------------------------------------------------------------------------------------------
// Integration points for the Jellyfin pages and the main search (spec 04 §D.4); not used by Discover itself.

type TmdbItem = { Type?: string | null; ProviderIds?: Record<string, string | null> | null } | null | undefined

const tmdbIdOf = (item: TmdbItem): number | null => {
  const raw = item?.ProviderIds?.Tmdb
  const n = raw ? Number(raw) : NaN
  return Number.isInteger(n) && n > 0 ? n : null
}

/**
 * `SeerrService.similar(item)` for a Jellyfin Movie / Series / Season / Episode / Person: the "Discover" row of
 * those pages. Disabled (data undefined) while Seerr is not linked; an item without a Tmdb id gives [].
 */
export function useSeerrSimilarFor(item: TmdbItem) {
  const { active } = useSeerrSession()
  const key = useSeerrKey()
  const ctx = useSeerrImageContext()
  const tmdb = tmdbIdOf(item)
  const type = item?.Type ?? null
  return useQuery({
    queryKey: key('similarFor', type, tmdb),
    enabled: active && item != null,
    staleTime: 30 * 60_000,
    queryFn: ({ signal }) =>
      guard(async (): Promise<DiscoverItem[]> => {
        if (tmdb == null) return []
        switch (type) {
          case 'Movie':
            return ((await seerrApi.movieSimilar(tmdb, 1, { signal })).results ?? []).map((x) => fromMovie(ctx, x))
          case 'Series':
          case 'Season':
          case 'Episode':
            return ((await seerrApi.tvSimilar(tmdb, 1, { signal })).results ?? []).map((x) => fromTv(ctx, x))
          case 'Person': {
            const c = await seerrApi.personCombinedCredits(tmdb, { signal })
            return mergeCredits([
              ...(c.cast ?? []).map((x) => fromCredit(ctx, x)),
              ...(c.crew ?? []).map((x) => fromCredit(ctx, x)),
            ])
          }
          default:
            return []
        }
      }),
  })
}

/** `SeerrService.getTvSeries(series)`: drives the Jellyfin series page's "Discover" button (shown only on success). */
export function useSeerrSeriesFor(series: TmdbItem) {
  const { active } = useSeerrSession()
  const key = useSeerrKey()
  const ctx = useSeerrImageContext()
  const tmdb = tmdbIdOf(series)
  return useQuery({
    queryKey: key('tv', tmdb, 'forSeries'),
    enabled: active && tmdb != null,
    staleTime: 5 * 60_000,
    queryFn: ({ signal }) => guard(async () => fromTv(ctx, await seerrApi.tv(tmdb!, { signal }))),
  })
}

/** `discoverPerson(item)`: the Seerr person for a Jellyfin person (link target of its "view more"), or null. */
export function discoverPersonFor(person: TmdbItem & { Name?: string | null; Overview?: string | null }): DiscoverItem | null {
  const tmdb = tmdbIdOf(person)
  if (tmdb == null) return null
  return {
    id: tmdb,
    type: 'person',
    title: person?.Name ?? null,
    subtitle: null,
    overview: person?.Overview ?? null,
    availability: 'UNKNOWN',
    releaseDate: null,
    posterUrl: null,
    backdropUrl: null,
    logoUrl: null,
    jellyfinItemId: null,
  }
}

/**
 * Main Search page: the Discover results show only when Seerr is linked and the per-user toggle
 * `searchIncludeDiscover` is on (SearchViewModel). Results come from `useDiscoverSearch(query)`.
 */
export function useSeerrSearchEnabled(): boolean {
  const { active } = useSeerrSession()
  const include = usePrefs('searchIncludeDiscover')
  return active && include
}
