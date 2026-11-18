// Grid sources and "Play all" for library folders (CollectionFolderViewModel.createPager NONE branch,
// CollectionFolderView onClickPlayAll).
import type { Api } from '@jellyfin/sdk'
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models'
import { qk } from '../../../api/queryKeys'
import { nav } from '../../../app/nav'
import type { GridSource } from '../components/LibraryGrid'
import { gridItemsParams, itemsLetterIndex, itemsPageFetcher } from './gridRequests'
import type { GridState } from './useGridState'

export function folderSource(api: Api, userId: string, item: BaseItemDto, recursive: boolean): (s: GridState) => GridSource {
  return (s) => {
    const params = gridItemsParams(
      { parentId: item.Id ?? '', collectionType: item.CollectionType ?? null, recursive, filter: s.filter, sort: s.sort },
      userId,
    )
    return {
      key: qk('browse', 'grid', params),
      fetchPage: itemsPageFetcher(api, params),
      letterIndex: (letter, total) => itemsLetterIndex(api, params, letter, total),
    }
  }
}

/**
 * Header Play / Shuffle: `PlaybackList(itemId = folder, startIndex 0, shuffle, recursive, sort, filter)`;
 * a photo album parent opens the slideshow instead (Shuffle behaves like Play there). The filter is passed
 * as its GetItemsFilter JSON.
 */
export function playAllPath(item: BaseItemDto, recursive: boolean, s: GridState, shuffle: boolean): string {
  const id = item.Id ?? ''
  const filter = JSON.stringify(s.filter)
  const sort = s.sort.sort
  const order = s.sort.direction === 'Descending' ? 'desc' : 'asc'
  // CollectionFolderView.kt:981-988: the album slideshow keeps the grid's sort too
  if (item.Type === 'PhotoAlbum') return nav.slideshow(id, { index: 0, recursive: true, start: true, filter, sort, order })
  return nav.playList(id, { index: 0, shuffle, recursive, sort, order, filter })
}
