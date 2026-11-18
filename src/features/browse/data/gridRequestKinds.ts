// Requests a generic item grid can page through (Destination.ItemGrid request + RequestHandler). The
// "View more" grid receives one of these through the /grid location state (`ItemGridState`):
//
//   { title, titleIsKey?, request: 'items' | 'resume' | 'nextUp', params: GridRequestParams, initialPosition }
//
// `params.query` is the SDK request object without paging (`startIndex` / `limit` /
// `enableTotalRecordCount` are added per page), so any feature can open a grid of its own request.
import type { Api } from '@jellyfin/sdk'
import type { LibraryApiGetItemsRequest, LibraryApiGetResumeItemsRequest } from '@jellyfin/sdk/lib/generated-client/api/library-api'
import type { ShowApiGetNextUpRequest } from '@jellyfin/sdk/lib/generated-client/api/show-api'
import { getLibraryApi } from '@jellyfin/sdk/lib/utils/api/library-api'
import { getShowApi } from '@jellyfin/sdk/lib/utils/api/show-api'
import type { AspectRatioName } from '../../common/viewOptions'
import type { Page } from './usePagedItems'

export type GridRequestKind = 'items' | 'resume' | 'nextUp'

type NoPaging<T> = Omit<T, 'startIndex' | 'limit' | 'enableTotalRecordCount'>

export type GridQuery =
  | { request: 'items'; query: NoPaging<LibraryApiGetItemsRequest> }
  | { request: 'resume'; query: NoPaging<LibraryApiGetResumeItemsRequest> }
  | { request: 'nextUp'; query: NoPaging<ShowApiGetNextUpRequest> }

/** `ItemGridState.params` for the request kinds above. */
export type GridRequestParams = {
  query: Record<string, unknown>
  /** `ViewOptions(aspectRatio = ...)` of the originating row (default poster). */
  aspectRatio?: AspectRatioName
  columns?: number
  spacing?: number
}

export function isGridRequestKind(v: unknown): v is GridRequestKind {
  return v === 'items' || v === 'resume' || v === 'nextUp'
}

/** One page of a grid query (the handlers' `prepare` + `execute`). */
export async function fetchGridPage(
  api: Api,
  q: GridQuery,
  startIndex: number,
  limit: number,
  withTotal: boolean,
  signal?: AbortSignal,
): Promise<Page> {
  const paging = { startIndex, limit, enableTotalRecordCount: withTotal }
  const res =
    q.request === 'resume'
      ? await getLibraryApi(api).getResumeItems({ ...q.query, ...paging }, { signal })
      : q.request === 'nextUp'
        ? await getShowApi(api).getNextUp({ ...q.query, ...paging }, { signal })
        : await getLibraryApi(api).getItems({ ...q.query, ...paging }, { signal })
  return { items: res.data.Items ?? [], total: withTotal ? (res.data.TotalRecordCount ?? null) : null }
}
