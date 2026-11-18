// The search requests (W/ui/search/SearchViewModel.kt searchType / searchCombined / searchSeerr).
import type { Api } from '@jellyfin/sdk'
import type { BaseItemDto, BaseItemKind } from '@jellyfin/sdk/lib/generated-client/models'
import { getArtistApi } from '@jellyfin/sdk/lib/utils/api/artist-api'
import { getLibraryApi } from '@jellyfin/sdk/lib/utils/api/library-api'
import { getPersonApi } from '@jellyfin/sdk/lib/utils/api/person-api'
import { useQueries, useQuery, type UseQueryResult } from '@tanstack/react-query'
import { qk } from '../../api/queryKeys'
import { useApi } from '../../api/session'
import { itemQueryMeta } from '../common/itemCache'
import { PROGRAM_ITEM_FIELDS, SLIM_ITEM_FIELDS } from '../common/itemFields'
import type { SearchDiscoverProvider, SearchDiscoverResult } from './searchExtensions'
import { sortByRelevance } from './searchRelevance'

/** SEARCH_LIMIT: every request asks for 50 results; there is no paging upstream. */
export const SEARCH_LIMIT = 50

export type SearchResult<T> =
  | { status: 'searching' }
  | { status: 'error'; message: string }
  | { status: 'success'; items: T[] }

/** One request per type (category mode). */
export async function searchType(api: Api, type: BaseItemKind, query: string, signal?: AbortSignal): Promise<BaseItemDto[]> {
  const opt = { signal }
  let items: BaseItemDto[]
  if (type === 'MusicArtist') {
    const res = await getArtistApi(api).getArtists(
      { searchTerm: query, fields: SLIM_ITEM_FIELDS, limit: SEARCH_LIMIT, enableTotalRecordCount: false },
      opt,
    )
    items = res.data.Items ?? []
  } else if (type === 'Person') {
    // GET /Persons has no enableTotalRecordCount
    const res = await getPersonApi(api).getPersons({ searchTerm: query, fields: SLIM_ITEM_FIELDS, limit: SEARCH_LIMIT }, opt)
    items = res.data.Items ?? []
  } else {
    const res = await getLibraryApi(api).getItems(
      {
        searchTerm: query,
        recursive: true,
        includeItemTypes: [type],
        fields: type === 'LiveTvProgram' ? PROGRAM_ITEM_FIELDS : SLIM_ITEM_FIELDS,
        limit: SEARCH_LIMIT,
        enableTotalRecordCount: false,
      },
      opt,
    )
    items = res.data.Items ?? []
  }
  return sortByRelevance(items, query)
}

/**
 * Combined mode: one request for every included type (People/Artists included, as upstream). An empty
 * list (every type excluded) sends no includeItemTypes, so the server searches all types, as upstream.
 */
export async function searchCombined(api: Api, types: readonly BaseItemKind[], query: string, signal?: AbortSignal): Promise<BaseItemDto[]> {
  const res = await getLibraryApi(api).getItems(
    {
      searchTerm: query,
      recursive: true,
      includeItemTypes: types.length > 0 ? [...types] : undefined,
      fields: SLIM_ITEM_FIELDS,
      limit: SEARCH_LIMIT,
    },
    { signal },
  )
  return sortByRelevance(res.data.Items ?? [], query)
}

function errorText(err: unknown): string {
  if (err instanceof Error && err.message) return err.message
  return String(err)
}

function toResult<T>(q: Pick<UseQueryResult<T[]>, 'data' | 'error' | 'isError'>): SearchResult<T> {
  if (q.data) return { status: 'success', items: q.data }
  if (q.isError) return { status: 'error', message: errorText(q.error) }
  return { status: 'searching' }
}

const STALE_MS = 5 * 60_000
// A delete refetches the results (upstream re-reads the deleted item and always fails with "Error refreshing").
const META = itemQueryMeta('deleted')

/** Per-type results in category mode; empty when the query is blank or combined mode is on. */
export function useTypeResults(query: string, types: readonly BaseItemKind[], enabled: boolean): Map<BaseItemKind, SearchResult<BaseItemDto>> {
  const api = useApi()
  const active = enabled && query.trim() !== ''
  const results = useQueries({
    queries: (active ? types : []).map((type) => ({
      queryKey: qk('search', 'type', type, query),
      queryFn: ({ signal }: { signal: AbortSignal }) => searchType(api, type, query, signal),
      staleTime: STALE_MS,
      meta: META,
    })),
  })
  const map = new Map<BaseItemKind, SearchResult<BaseItemDto>>()
  if (active) types.forEach((t, i) => map.set(t, toResult(results[i])))
  return map
}

export function useCombinedResults(query: string, types: readonly BaseItemKind[], enabled: boolean): SearchResult<BaseItemDto> | null {
  const api = useApi()
  const active = enabled && query.trim() !== ''
  const q = useQuery({
    queryKey: qk('search', 'combined', types.join(','), query),
    queryFn: ({ signal }) => searchCombined(api, types, query, signal),
    enabled: active,
    staleTime: STALE_MS,
    meta: META,
  })
  return active ? toResult(q) : null
}

/** Seerr results, MOVIE and TV only; null when Seerr is inactive, discover is excluded or the query is blank. */
export function useDiscoverResults(
  query: string,
  discover: { provider: SearchDiscoverProvider; cacheKey: string } | null,
  enabled: boolean,
): SearchResult<SearchDiscoverResult> | null {
  const active = enabled && !!discover && query.trim() !== ''
  const q = useQuery({
    queryKey: qk('search', 'discover', discover?.cacheKey ?? null, query),
    queryFn: async ({ signal }) => {
      const items = await discover!.provider.search(query, signal)
      return items.filter((r) => r.card.mediaType === 'movie' || r.card.mediaType === 'tv')
    },
    enabled: active,
    staleTime: STALE_MS,
  })
  return active ? toResult(q) : null
}
