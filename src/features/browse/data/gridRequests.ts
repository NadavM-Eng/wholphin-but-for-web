// `GET /Items` requests of the library grid (CollectionFolderViewModel.createGetItemsRequest,
// positionOfLetter) and their page fetchers.
import type { Api } from '@jellyfin/sdk'
import type { CollectionType } from '@jellyfin/sdk/lib/generated-client/models'
import type { LibraryApiGetItemsRequest } from '@jellyfin/sdk/lib/generated-client/api/library-api'
import { getLibraryApi } from '@jellyfin/sdk/lib/utils/api/library-api'
import { SLIM_ITEM_FIELDS } from '../../common/itemFields'
import { applyFilter, type GetItemsFilter } from '../model/filter'
import { letterBound, letterJumpIndex } from '../model/letterJump'
import { gridSortParams, type SortAndDirection } from '../model/sort'
import type { PageFetcher } from './usePagedItems'

export type ItemsParams = Omit<LibraryApiGetItemsRequest, 'startIndex' | 'limit' | 'enableTotalRecordCount'>

export type GridRequest = {
  /** The library / folder (also excluded from the results). */
  parentId: string
  collectionType: CollectionType | null | undefined
  recursive: boolean
  filter: GetItemsFilter
  sort: SortAndDirection
}

/** `createGetItemsRequest`. `includeItemTypes` comes from the filter only (null => no restriction). */
export function gridItemsParams(r: GridRequest, userId: string): ItemsParams {
  return {
    userId,
    parentId: r.parentId,
    enableImageTypes: ['Primary', 'Thumb', 'Backdrop', 'Logo'],
    recursive: r.recursive,
    excludeItemIds: [r.parentId],
    ...gridSortParams(r.sort, r.collectionType),
    fields: SLIM_ITEM_FIELDS,
    ...applyFilter(r.filter),
  }
}

/** Page fetcher for any `GET /Items` parameter set (ApiRequestPager + GetItemsRequestHandler). */
export function itemsPageFetcher(api: Api, params: ItemsParams): PageFetcher {
  return async (startIndex, limit, withTotal, signal) => {
    const res = await getLibraryApi(api).getItems({ ...params, startIndex, limit, enableTotalRecordCount: withTotal }, { signal })
    return { items: res.data.Items ?? [], total: withTotal ? (res.data.TotalRecordCount ?? null) : null }
  }
}

/**
 * `positionOfLetter`: the grid request with `nameLessThan`, limit 0, the total count and no images,
 * fields or user data. Descending name sort counts below the next letter (see letterJump.ts).
 */
export async function itemsLetterIndex(api: Api, params: ItemsParams, letter: string, total: number): Promise<number> {
  const direction = params.sortBy?.[0] === 'SortName' ? (params.sortOrder?.[0] ?? 'Ascending') : 'Ascending'
  const res = await getLibraryApi(api).getItems({
    ...params,
    enableImageTypes: undefined,
    fields: undefined,
    nameLessThan: letterBound(letter, direction),
    limit: 0,
    enableTotalRecordCount: true,
    enableUserData: false,
  })
  return letterJumpIndex(res.data.TotalRecordCount, total, direction)
}
