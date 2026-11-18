// Song lists the queue is filled from (W/ui/detail/music/Utils.kt getPagerForAlbum/Artist/Playlist and
// CollectionFolderMusic.onClickPlayAll). Upstream wraps each request in a lazily paged list and appends it
// in chunks of 25; here the pages are fetched in order and each page is appended as it arrives.
import type { Api } from '@jellyfin/sdk'
import type { BaseItemDto, ItemSortBy } from '@jellyfin/sdk/lib/generated-client/models'
import { getLibraryApi } from '@jellyfin/sdk/lib/utils/api/library-api'
import { DETAIL_ITEM_FIELDS } from '../../common/itemFields'

export type SongSource =
  | { kind: 'album'; id: string }
  | { kind: 'artist'; id: string }
  | { kind: 'playlist'; id: string }
  /** a music library's "Play all / Shuffle": every song, no sort (CollectionFolderMusic.kt) */
  | { kind: 'library'; id: string }
  /** a music library's genre page "Play all / Shuffle": the genre's songs in that library */
  | { kind: 'genre'; id: string; genreId: string }

const TRACK_SORT: ItemSortBy[] = ['ParentIndexNumber', 'IndexNumber', 'SortName']

export function songRequest(source: SongSource, userId: string) {
  const base = { userId, includeItemTypes: ['Audio' as const], fields: DETAIL_ITEM_FIELDS, enableUserData: true }
  switch (source.kind) {
    case 'album':
      return { ...base, parentId: source.id, sortBy: TRACK_SORT }
    case 'artist':
      // upstream comment: "TODO better sort"
      return { ...base, artistIds: [source.id], recursive: true, sortBy: TRACK_SORT }
    case 'playlist':
      return { ...base, parentId: source.id, recursive: true, sortBy: ['Default' as ItemSortBy] }
    case 'library':
      return { ...base, parentId: source.id, recursive: true }
    case 'genre':
      return { ...base, parentId: source.id, recursive: true, genreIds: [source.genreId] }
  }
}

/** First chunk is small so playback starts quickly (upstream chunk size 25), later pages are larger. */
export const FIRST_CHUNK = 25
export const NEXT_CHUNK = 200

/**
 * Yields the songs of `source` from `startIndex` on (upstream `addAllToQueue(list, startIndex)` skips the
 * first `startIndex` songs), page by page.
 */
export async function* songPages(api: Api, userId: string, source: SongSource, startIndex = 0, signal?: AbortSignal): AsyncGenerator<BaseItemDto[]> {
  let start = Math.max(0, startIndex)
  let limit = FIRST_CHUNK
  for (;;) {
    const res = await getLibraryApi(api).getItems({ ...songRequest(source, userId), startIndex: start, limit, enableTotalRecordCount: true }, { signal })
    const items = res.data.Items ?? []
    if (items.length) yield items
    start += items.length
    const total = res.data.TotalRecordCount ?? 0
    if (items.length < limit || start >= total) return
    limit = NEXT_CHUNK
  }
}

/** All songs of `source` (Add to queue / Play next of an album, artist or playlist). */
export async function allSongs(api: Api, userId: string, source: SongSource, signal?: AbortSignal): Promise<BaseItemDto[]> {
  const out: BaseItemDto[] = []
  for await (const page of songPages(api, userId, source, 0, signal)) out.push(...page)
  return out
}

/** The song source behind a music item, or null for kinds the music player does not expand. */
export function sourceForItem(item: Pick<BaseItemDto, 'Id' | 'Type'>): SongSource | null {
  if (!item.Id) return null
  switch (item.Type) {
    case 'MusicAlbum':
      return { kind: 'album', id: item.Id }
    case 'MusicArtist':
      return { kind: 'artist', id: item.Id }
    case 'Playlist':
      return { kind: 'playlist', id: item.Id }
    default:
      return null
  }
}
