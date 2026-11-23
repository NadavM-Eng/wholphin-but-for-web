// Data of the series pages (W/ui/detail/series/SeriesViewModel.kt): seasons, the paged episode list of a season,
// the people of the focused episode and the episode the series Play button starts. Every read is a TanStack
// query, so the shared item actions (useItemActions) patch watched / favorite marks in place.
import type { Api } from '@jellyfin/sdk'
import type { BaseItemDto, BaseItemDtoQueryResult, ItemFields, BaseItemPerson } from '@jellyfin/sdk/lib/generated-client/models'
import { getLibraryApi } from '@jellyfin/sdk/lib/utils/api/library-api'
import { getShowApi } from '@jellyfin/sdk/lib/utils/api/show-api'
import { useQueries, useQuery, type QueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useState } from 'react'
import { qk } from '../../../api/queryKeys'
import { useApi, useSession } from '../../../api/session'
import { itemQueryMeta } from '../../common/itemCache'
import { detailKeys } from '../common/detailQueries'
import type { BlockingList } from './episodeIndex'

/** `ApiRequestPager` page sizes: the episodes pager uses the default 100, the seasons pager 20 (SeriesViewModel.kt:346). */
export const EPISODE_PAGE_SIZE = 100
export const SEASON_PAGE_SIZE = 20
/** Pages younger than this are not refetched when the strip mounts. */
const FRESH_MS = 3000

/** `loadEpisodesInternal` fields (SeriesViewModel.kt:362-371). */
export const EPISODE_FIELDS: ItemFields[] = ['MediaSources', 'MediaSourceCount', 'Overview', 'CustomRating', 'PrimaryImageAspectRatio', 'CanDelete', 'ParentId']

export const seriesKeys = {
  seasons: (seriesId: string) => qk('series', 'seasons', seriesId),
  episodes: (seriesId: string, seasonId: string, page: number) => qk('series', 'episodes', seriesId, seasonId, page),
}

/**
 * `getSeasons`: `GET /Items?parentId={series}&includeItemTypes=Season&sortBy=IndexNumber` (Specials, index 0,
 * sort first). Upstream pages it 20 at a time; every season is one tab or card anyway, so the web asks for all
 * of them at once. Both pages use the details-page request (user data, aspect ratio, CanDelete): one cache entry
 * serves the seasons row and the season tabs.
 */
export function useSeasons(seriesId: string) {
  const api = useApi()
  const userId = useSession()?.user.id
  return useQuery({
    queryKey: seriesKeys.seasons(seriesId),
    enabled: !!seriesId,
    // Upstream refreshes the season pages on every resume.
    refetchOnMount: 'always',
    meta: itemQueryMeta('played', 'favorite', 'deleted'),
    queryFn: async ({ signal }) => {
      const res = await getLibraryApi(api).getItems(
        {
          userId,
          parentId: seriesId,
          recursive: false,
          includeItemTypes: ['Season'],
          sortBy: ['IndexNumber'],
          sortOrder: ['Ascending'],
          enableUserData: true,
          fields: ['PrimaryImageAspectRatio', 'CanDelete'],
        },
        { signal },
      )
      return res.data.Items ?? []
    },
  })
}

function episodesPageQuery(api: Api, userId: string | undefined, seriesId: string, seasonId: string, page: number) {
  return {
    queryKey: seriesKeys.episodes(seriesId, seasonId, page),
    meta: itemQueryMeta('played', 'favorite', 'deleted'),
    queryFn: async ({ signal }: { signal?: AbortSignal }): Promise<BaseItemDtoQueryResult> => {
      // GET /Shows/{id}/Episodes: no isMissing filter, so the server's "display missing episodes" user setting
      // decides whether missing and unaired (virtual) episodes are listed, as upstream.
      const res = await getShowApi(api).getEpisodes(
        {
          seriesId,
          seasonId,
          userId,
          sortBy: 'IndexNumber',
          fields: EPISODE_FIELDS,
          startIndex: page * EPISODE_PAGE_SIZE,
          limit: EPISODE_PAGE_SIZE,
        },
        { signal },
      )
      return res.data
    },
  }
}

export type EpisodeList = {
  seasonId: string
  /** Number of episodes; null until the first page arrived. */
  total: number | null
  /** Episode at an index, or undefined while its page loads (rendering an index requests its page). */
  get: (index: number) => BaseItemDto | undefined
  /** Like `get` without requesting the page (layout estimates). */
  peek: (index: number) => BaseItemDto | undefined
  isLoading: boolean
  isError: boolean
  error: unknown
  refetch: () => void
}

/**
 * The episodes of one season, paged 100 at a time (`ApiRequestPager` over `GET /Shows/{id}/Episodes`).
 * Pages are refetched when the page mounts again (BR-8: watched marks and progress are fresh after playback).
 */
export function useEpisodeList(seriesId: string, seasonId: string | null): EpisodeList | null {
  const api = useApi()
  const userId = useSession()?.user.id
  const [pages, setPages] = useState<{ season: string | null; list: number[] }>({ season: seasonId, list: [0] })
  if (pages.season !== seasonId) setPages({ season: seasonId, list: [0] })
  const list = pages.season === seasonId ? pages.list : [0]
  const results = useQueries({
    queries: list.map((page) => ({
      ...episodesPageQuery(api, userId, seriesId, seasonId ?? '', page),
      enabled: !!seasonId,
      // Fresh on every visit (BR-8), except pages the start-position search fetched a moment ago.
      // ('always': a plain `true` would only refetch once the global 30 s staleTime has passed.)
      refetchOnMount: (q: { state: { dataUpdatedAt: number } }) => (Date.now() - q.state.dataUpdatedAt > FRESH_MS ? 'always' : false),
    })),
  })
  const requestPage = useCallback((page: number) => {
    setPages((cur) => (cur.list.includes(page) ? cur : { season: cur.season, list: [...cur.list, page] }))
  }, [])
  const byPage = new Map<number, BaseItemDto[]>()
  let total: number | null = null
  list.forEach((p, i) => {
    const d = results[i]?.data
    if (!d) return
    byPage.set(p, d.Items ?? [])
    total ??= d.TotalRecordCount ?? d.Items?.length ?? 0
  })
  if (!seasonId) return null
  return {
    seasonId,
    total,
    get: (index: number) => {
      const page = Math.floor(index / EPISODE_PAGE_SIZE)
      const items = byPage.get(page)
      if (!items && !list.includes(page)) queueMicrotask(() => requestPage(page))
      return items?.[index - page * EPISODE_PAGE_SIZE]
    },
    peek: (index: number) => {
      const page = Math.floor(index / EPISODE_PAGE_SIZE)
      return byPage.get(page)?.[index - page * EPISODE_PAGE_SIZE]
    },
    isLoading: total == null && !results.some((r) => r.isError),
    isError: results.some((r) => r.isError),
    error: results.find((r) => r.error)?.error,
    refetch: () => results.forEach((r) => void r.refetch()),
  }
}

/** Async access to a season's episodes (pages fetched as needed, cached pages reused): the start-position search. */
export function episodeAccess(qc: QueryClient, api: Api, userId: string | undefined, seriesId: string, seasonId: string) {
  const ensure = (page: number) => qc.ensureQueryData(episodesPageQuery(api, userId, seriesId, seasonId, page))
  return {
    /** Fetches page 0 (or takes it from the cache) and gives the total. */
    loadTotal: async () => {
      const d = await ensure(0)
      return d.TotalRecordCount ?? d.Items?.length ?? 0
    },
    blocking: (size: number): BlockingList<BaseItemDto> => ({
      size,
      pageSize: EPISODE_PAGE_SIZE,
      get: async (index: number) => {
        const page = Math.floor(index / EPISODE_PAGE_SIZE)
        const d = await ensure(page)
        return d.Items?.[index - page * EPISODE_PAGE_SIZE]
      },
    }),
  }
}

/**
 * `lookupPeopleInEpisode` (SeriesViewModel.kt:599-623): the episode's people (`GET /Items/{id}`, shared with the
 * detail-item cache and kept 5 minutes, upstream caches 25 episodes). The fetch starts at once; the rows show
 * the result only after the episode has stayed focused for 250 ms.
 *
 * Web: until then the rows keep the people shown last instead of emptying (upstream clears them on every focus
 * change). A mouse moving along the strip selects episode after episode: emptied rows were torn down and built
 * again each time, pictures included, although most of the cast is the same. Without an episode (a season
 * loading) or when the lookup fails there is nothing to keep.
 */
export function usePeopleInEpisode(episodeId: string | null) {
  const api = useApi()
  const userId = useSession()?.user.id
  const q = useQuery({
    queryKey: detailKeys.item(episodeId ?? ''),
    enabled: !!episodeId,
    staleTime: 5 * 60_000,
    meta: itemQueryMeta('played', 'favorite'),
    queryFn: async ({ signal }) => (await getLibraryApi(api).getItem({ itemId: episodeId ?? '', userId }, { signal })).data,
  })
  const [shownFor, setShownFor] = useState<string | null>(null)
  useEffect(() => {
    const timer = setTimeout(() => setShownFor(episodeId), PEOPLE_DELAY_MS)
    return () => clearTimeout(timer)
  }, [episodeId])
  const settled = shownFor === episodeId
  const next = episodeId == null || (settled && q.isError) ? EMPTY : settled && q.data?.Id === episodeId ? (q.data.People ?? EMPTY) : null
  const [held, setHeld] = useState<BaseItemPerson[]>(EMPTY)
  if (next && next !== held) setHeld(next)
  return next ?? held
}

const PEOPLE_DELAY_MS = 250
const EMPTY: never[] = []

/**
 * `playNextUp` (SeriesViewModel.kt:509-531): the first `GET /Shows/NextUp?seriesId=` result, else the series'
 * first episode (`GET /Shows/{id}/Episodes?limit=1`), else null.
 */
export async function findEpisodeToPlay(api: Api, userId: string | undefined, seriesId: string): Promise<BaseItemDto | null> {
  const next = await getShowApi(api).getNextUp({ userId, seriesId })
  const first = next.data.Items?.[0]
  if (first) return first
  const eps = await getShowApi(api).getEpisodes({ seriesId, userId, limit: 1 })
  return eps.data.Items?.[0] ?? null
}

/** The detail item of an episode from the URL (its season and episode numbers drive the start position). */
export function fetchEpisodeHint(qc: QueryClient, api: Api, userId: string | undefined, episodeId: string): Promise<BaseItemDto> {
  return qc.ensureQueryData({
    queryKey: detailKeys.item(episodeId),
    queryFn: async () => (await getLibraryApi(api).getItem({ itemId: episodeId, userId })).data,
  })
}
