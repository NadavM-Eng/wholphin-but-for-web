import type { LibraryApiGetItemsRequest } from '@jellyfin/sdk/lib/generated-client/api/library-api'
// Data of the detail pages (MovieViewModel / EpisodeViewModel / PersonViewModel …): every read is a
// TanStack query keyed under qk('detail', …), so Back shows cached data at once and the shared item
// mutations (useItemActions) patch it in place.
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models'
import { getLibraryApi } from '@jellyfin/sdk/lib/utils/api/library-api'
import { keepPreviousData, useQueries, useQuery } from '@tanstack/react-query'
import { useCallback, useMemo, useState } from 'react'
import { itemKey, qk } from '../../../api/queryKeys'
import { useApi, useSession } from '../../../api/session'
import { getSeriesTrackChoices, getItemPlayback, usePlaybackChoicesStore } from '../../../stores/playbackChoices'
import { usePrefs } from '../../../stores/preferences'
import type { ServerUserConfig } from '../../playback/engine/streamChoice'
import { itemQueryMeta } from '../../common/itemCache'
import { ITEM_ROW_FIELDS } from '../../common/itemFields'
import { computeChosenStreams, type ChosenStreams } from './streams'

export const detailKeys = {
  item: (id: string) => itemKey(id),
  localTrailers: (id: string) => qk('detail', 'localTrailers', id),
  extras: (id: string) => qk('detail', 'extras', id),
  similar: (id: string) => qk('detail', 'similar', id),
  people: (id: string) => qk('detail', 'peopleFavorites', id),
}

/** `GET /Items/{id}` with the detail fields (`DetailItemFields`), refetched whenever the page mounts (upstream re-inits on resume). */
export function useDetailItem(itemId: string | undefined) {
  const api = useApi()
  const userId = useSession()?.user.id
  return useQuery({
    queryKey: detailKeys.item(itemId ?? ''),
    enabled: !!itemId,
    refetchOnMount: 'always',
    meta: itemQueryMeta('played', 'favorite'),
    queryFn: async ({ signal }) => {
      // GET /Items/{id} has no fields parameter: it always returns the full DTO (DetailItemFields upstream).
      const res = await getLibraryApi(api).getItem({ itemId: itemId ?? '', userId }, { signal })
      return res.data
    },
  })
}

/** `TrailerService.getLocalTrailers`: only when LocalTrailerCount > 0. */
export function useLocalTrailers(item: BaseItemDto | undefined) {
  const api = useApi()
  const userId = useSession()?.user.id
  const id = item?.Id ?? ''
  return useQuery({
    queryKey: detailKeys.localTrailers(id),
    enabled: !!id && (item?.LocalTrailerCount ?? 0) > 0,
    queryFn: async ({ signal }) => (await getLibraryApi(api).getLocalTrailers({ itemId: id, userId }, { signal })).data,
  })
}

/** `GET /Items/{id}/SpecialFeatures`. Failures are silent (upstream). */
export function useSpecialFeatures(itemId: string | undefined, enabled = true) {
  const api = useApi()
  const userId = useSession()?.user.id
  return useQuery({
    queryKey: detailKeys.extras(itemId ?? ''),
    enabled: !!itemId && enabled,
    // Fresh on every visit, as the detail item (upstream reloads extras on ON_RESUME, spec 08 BR-8). staleTime 0
    // as well: the series overview enables this query only once its season is known, after the mount.
    refetchOnMount: 'always',
    staleTime: 0,
    meta: itemQueryMeta('played'),
    queryFn: async ({ signal }) => (await getLibraryApi(api).getSpecialFeatures({ itemId: itemId ?? '', userId }, { signal })).data,
  })
}

/** `GET /Items/{id}/Similar` (limit 25, ItemRowFields). */
export function useSimilarItems(itemId: string | undefined, enabled = true) {
  const api = useApi()
  const userId = useSession()?.user.id
  return useQuery({
    queryKey: detailKeys.similar(itemId ?? ''),
    enabled: !!itemId && enabled,
    meta: itemQueryMeta('deleted'),
    queryFn: async ({ signal }) =>
      (await getLibraryApi(api).getSimilarItems({ itemId: itemId ?? '', userId, fields: ITEM_ROW_FIELDS, limit: 25 }, { signal })).data.Items ?? [],
  })
}

/**
 * `PeopleFavorites.getPeopleFor`: the favorite flag of each person of the item (ids in chunks of 50).
 * Used only for the person menu label, as upstream.
 */
export function usePeopleFavorites(item: BaseItemDto | undefined) {
  const api = useApi()
  const userId = useSession()?.user.id
  const ids = useMemo(() => (item?.People ?? []).map((p) => p.Id).filter((x): x is string => !!x), [item?.People])
  return useQuery({
    queryKey: [...detailKeys.people(item?.Id ?? ''), ids.join(',')],
    enabled: ids.length > 0,
    meta: itemQueryMeta('favorite'),
    queryFn: async ({ signal }) => {
      const out: Record<string, boolean> = {}
      for (let i = 0; i < ids.length; i += 50) {
        const res = await getLibraryApi(api).getItems({ userId, ids: ids.slice(i, i + 50) }, { signal })
        for (const p of res.data.Items ?? []) if (p.Id) out[p.Id] = p.UserData?.IsFavorite ?? false
      }
      return out
    },
  })
}

/**
 * The source/audio/subtitle a Play press would use (`ItemPlaybackRepository.getSelectedTracks`), re-computed
 * whenever a remembered choice changes.
 */
export function useChosenStreams(item: BaseItemDto | undefined): ChosenStreams | null {
  const doc = usePlaybackChoicesStore((s) => s.doc)
  const preferredAudioLanguage = usePrefs('preferredAudioLang')
  const preferredSubtitleLanguage = usePrefs('preferredSubtitleLang')
  const subtitleMode = usePrefs('subtitleMode')
  const userConfig = useSession()?.userDto?.Configuration as ServerUserConfig | undefined
  return useMemo(() => {
    void doc
    if (!item?.MediaSources?.length || !item.Id) return null
    return computeChosenStreams(
      item,
      getItemPlayback(item.Id),
      getSeriesTrackChoices(item, 'AUDIO'),
      getSeriesTrackChoices(item, 'SUBTITLE'),
      { preferredAudioLanguage, preferredSubtitleLanguage, subtitleMode },
      userConfig,
    )
  }, [doc, item, preferredAudioLanguage, preferredSubtitleLanguage, subtitleMode, userConfig])
}

/** Items request of a paged row / list (`GetItemsRequest` without paging; a filter's params can be spread in). */
export type PagedItemsRequest = Omit<LibraryApiGetItemsRequest, 'startIndex' | 'limit' | 'enableTotalRecordCount'>

export type PagedItems = {
  /** Total count (null until the first page arrives). */
  total: number | null
  /** Item at an index, or undefined while its page loads (also requests the page). */
  get: (index: number) => BaseItemDto | undefined
  /** Every loaded item in order (holes skipped). */
  loaded: BaseItemDto[]
  isError: boolean
  error: unknown
  isLoading: boolean
  refetch: () => void
}

/**
 * Upstream `ApiRequestPager`: `GET /Items` in pages of `pageSize`, a page is fetched when an index in it is
 * first rendered. The first page also brings the total count.
 */
export function usePagedItems(key: readonly unknown[], request: PagedItemsRequest | null, pageSize: number, deps: Parameters<typeof itemQueryMeta> = []): PagedItems {
  const api = useApi()
  const userId = useSession()?.user.id
  const [pages, setPages] = useState<number[]>([0])
  const reqKey = JSON.stringify(request)
  const [lastReq, setLastReq] = useState(reqKey)
  if (lastReq !== reqKey) {
    setLastReq(reqKey)
    setPages([0])
  }
  const results = useQueries({
    queries: pages.map((page) => ({
      queryKey: [...key, reqKey, pageSize, page],
      enabled: request != null,
      placeholderData: page === 0 ? keepPreviousData : undefined,
      meta: itemQueryMeta(...deps),
      queryFn: async ({ signal }: { signal: AbortSignal }) => {
        const r = request ?? {}
        const res = await getLibraryApi(api).getItems(
          {
            userId,
            ...r,
            startIndex: page * pageSize,
            limit: pageSize,
            enableTotalRecordCount: true,
          },
          { signal },
        )
        return res.data
      },
    })),
  })
  const total = results[0]?.data?.TotalRecordCount ?? (results[0]?.data ? (results[0].data.Items?.length ?? 0) : null)
  const byPage = new Map<number, BaseItemDto[]>()
  pages.forEach((p, i) => {
    const items = results[i]?.data?.Items
    if (items) byPage.set(p, items)
  })
  const request_ = useCallback(
    (page: number) => {
      setPages((cur) => (cur.includes(page) ? cur : [...cur, page]))
    },
    [],
  )
  const get = (index: number) => {
    const page = Math.floor(index / pageSize)
    const items = byPage.get(page)
    if (!items && !pages.includes(page)) queueMicrotask(() => request_(page))
    return items?.[index - page * pageSize]
  }
  const loaded = [...byPage.entries()].sort((a, b) => a[0] - b[0]).flatMap(([, items]) => items)
  return {
    total,
    get,
    loaded,
    isError: results.some((r) => r.isError),
    error: results.find((r) => r.error)?.error,
    isLoading: results[0]?.isLoading ?? true,
    refetch: () => results.forEach((r) => void r.refetch()),
  }
}
