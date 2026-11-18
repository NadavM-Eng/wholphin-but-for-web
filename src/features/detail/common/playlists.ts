// Server playlists (W/services/PlaylistCreator.kt getServerPlaylists / createServerPlaylist /
// addToServerPlaylist / removeFromServerPlaylist, W/ui/detail/PlaylistDetails.kt move + permission).
import type { Api } from '@jellyfin/sdk'
import type { BaseItemDto, MediaType } from '@jellyfin/sdk/lib/generated-client/models'
import { getLibraryApi } from '@jellyfin/sdk/lib/utils/api/library-api'
import { getPlaylistApi } from '@jellyfin/sdk/lib/utils/api/playlist-api'
import { qk } from '../../../api/queryKeys'

export type PlaylistInfo = { id: string; name: string; count: number; mediaType: MediaType | null }

const status = (err: unknown) => (err as { response?: { status?: unknown } } | null)?.response?.status

/** `GET /Playlists/{id}/Users/{userId}` -> canEdit; 404 (no permission row) and any other error -> false. */
/** One cache entry for "may this user edit the playlist", shared by the video and the music playlist pages. */
export const playlistCanEditKey = (playlistId: string) => qk('playlistCanEdit', playlistId)

export async function canEditPlaylist(api: Api, playlistId: string, userId: string, signal?: AbortSignal): Promise<boolean> {
  try {
    const res = await getPlaylistApi(api).getPlaylistUser({ playlistId, userId }, { signal })
    return res.data.CanEdit === true
  } catch {
    return false
  }
}

/**
 * `getServerPlaylists(query, mediaType = null)`: the 25 most recently filled playlists matching the query that
 * the user may edit. Only a 404 skips a playlist; other permission errors fail the whole list (as upstream).
 */
export async function editablePlaylists(api: Api, userId: string, query: string, unknownName: string, signal?: AbortSignal): Promise<PlaylistInfo[]> {
  const res = await getLibraryApi(api).getItems(
    {
      userId,
      searchTerm: query.trim() !== '' ? query : undefined,
      includeItemTypes: ['Playlist'],
      recursive: true,
      limit: 25,
      sortBy: ['DateLastContentAdded'],
      sortOrder: ['Descending'],
      fields: ['ChildCount'],
    },
    { signal },
  )
  const out: PlaylistInfo[] = []
  for (const p of res.data.Items ?? []) {
    if (!p.Id) continue
    try {
      const perm = await getPlaylistApi(api).getPlaylistUser({ playlistId: p.Id, userId }, { signal })
      if (perm.data.CanEdit) out.push({ id: p.Id, name: p.Name ?? unknownName, count: p.ChildCount ?? 0, mediaType: p.MediaType ?? null })
    } catch (err) {
      if (status(err) === 404) continue
      throw err
    }
  }
  return out
}

/**
 * `POST /Playlists/{id}/Items?ids=…`. Upstream sends no userId (PlaylistCreator.kt:407-412); the server then
 * falls back to the token's user, which older servers reject, so the web passes it.
 */
export async function addToPlaylist(api: Api, playlistId: string, itemId: string, userId: string) {
  await getPlaylistApi(api).addItemToPlaylist({ playlistId, ids: [itemId], userId })
}

/** `POST /Playlists` {name, ids, users: [{userId, canEdit: true}], isPublic: false}. */
export async function createPlaylist(api: Api, name: string, itemIds: string[], userId: string): Promise<string | null> {
  const res = await getPlaylistApi(api).createPlaylist({
    createPlaylistDto: { Name: name, Ids: itemIds, UserId: userId, Users: [{ UserId: userId, CanEdit: true }], IsPublic: false },
  })
  return res.data.Id ?? null
}

/** `GET /Playlists/{id}/Items`: the playlist's entries in playlist order (item id + entry id). */
export async function playlistEntries(api: Api, playlistId: string, userId: string, signal?: AbortSignal): Promise<{ id: string; entryId: string }[]> {
  const res = await getPlaylistApi(api).getPlaylistItems({ playlistId, userId, fields: [], enableImages: false, enableUserData: false }, { signal })
  return (res.data.Items ?? []).map((i) => ({ id: i.Id ?? '', entryId: i.PlaylistItemId ?? i.Id ?? '' }))
}

/**
 * The entry id of the row at `index` (`GET /Items?parentId=` rows carry no PlaylistItemId): in playlist order the
 * entry at the same index when it is the same item, else the first entry of that item.
 */
export function entryIdFor(entries: readonly { id: string; entryId: string }[] | undefined, item: BaseItemDto, index: number, playlistOrder: boolean): string {
  if (item.PlaylistItemId) return item.PlaylistItemId
  const id = item.Id ?? ''
  if (playlistOrder && entries?.[index]?.id === id) return entries[index].entryId
  return entries?.find((e) => e.id === id)?.entryId ?? id
}

/**
 * `DELETE /Playlists/{id}/Items?entryIds=…`. Upstream passes the item id where the server expects the playlist
 * entry id (W/ui/detail/PlaylistDetails.kt removeFromPlaylist), which removes the wrong entry or nothing when
 * an item appears twice; the web sends the entry id (see entryIdFor).
 */
export async function removeFromPlaylist(api: Api, playlistId: string, entryId: string) {
  await getPlaylistApi(api).removeItemFromPlaylist({ playlistId, entryIds: [entryId] })
}

/** `POST /Playlists/{id}/Items/{entryId}/Move/{newIndex}` (same entry-id fix as removal). */
export async function moveInPlaylist(api: Api, playlistId: string, entryId: string, newIndex: number) {
  await getPlaylistApi(api).moveItem({ playlistId, itemId: entryId, newIndex })
}
