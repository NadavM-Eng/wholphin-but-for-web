// `NavDrawerService.getAllUserLibraries` (W/services/NavDrawerService.kt:128-168): the user views the app
// supports plus Live TV recording folders.
import type { Api } from '@jellyfin/sdk'
import type { BaseItemDto, BaseItemKind, CollectionType, UserDto } from '@jellyfin/sdk/lib/generated-client/models'
import { getUserViewApi } from '@jellyfin/sdk/lib/utils/api/user-view-api'
import { isCancelledError, useQuery, useQueryClient, type QueryClient, type UseQueryResult } from '@tanstack/react-query'
import { qk } from '../../api/queryKeys'
import { recordingFoldersQuery } from '../../app/shell/useDrawerItems'
import { useApi, useSession } from '../../api/session'
import { sameId } from '../../lib/ids'
import { SUPPORTED_COLLECTION_TYPES } from './itemKinds'

export type Library = {
  id: string
  name: string
  type: BaseItemKind | null
  /** `null` = mixed content (upstream maps it to UNKNOWN). */
  collectionType: CollectionType | null
  isRecordingFolder: boolean
}

/** `ServerUserConfig.tvAccess`. */
export const hasTvAccess = (user: UserDto | null | undefined) => user?.Policy?.EnableLiveTvAccess === true

/**
 * `ensureQueryData` joins an in-flight fetch; when that fetch is cancelled (its last observer unmounted, e.g. the
 * drawer re-mounting during startup) the join rejects with a CancelledError and the caller's query would wait for
 * its 1 s retry. Start a fresh fetch instead.
 */
async function ensureJoined<T>(fetch: () => Promise<T>): Promise<T> {
  try {
    return await fetch()
  } catch (e) {
    if (isCancelledError(e)) return fetch()
    throw e
  }
}

/** Same query (key + request) as `useUserViews`, so both share one cache entry. */
export function fetchUserViews(qc: QueryClient, api: Api, userId: string): Promise<BaseItemDto[]> {
  return ensureJoined(() => qc.ensureQueryData({
    queryKey: qk('userViews'),
    staleTime: 5 * 60_000,
    queryFn: async ({ signal }) => (await getUserViewApi(api).getUserViews({ userId }, { signal })).data.Items ?? [],
  }))
}

export async function fetchLibraries(qc: QueryClient, api: Api, user: UserDto): Promise<Library[]> {
  const userId = user.Id ?? ''
  const views = await fetchUserViews(qc, api, userId)
  // shares the drawer's cache entry (401/403 already mapped to "none" there)
  const recordingFolders: string[] = hasTvAccess(user)
    ? (await ensureJoined(() => qc.ensureQueryData(recordingFoldersQuery(api, userId)))).map((f) => f.Id ?? '')
    : []
  return views
    .filter((v) => SUPPORTED_COLLECTION_TYPES.has(v.CollectionType ?? undefined) || recordingFolders.some((r) => sameId(r, v.Id)))
    .map((v) => ({
      id: v.Id ?? '',
      name: v.Name ?? '',
      type: v.Type ?? null,
      collectionType: v.CollectionType ?? null,
      isRecordingFolder: recordingFolders.some((r) => sameId(r, v.Id)),
    }))
}

/** Query options of the libraries list (for `useQuery` or `qc.ensureQueryData`). */
export function librariesQuery(qc: QueryClient, api: Api, user: UserDto) {
  return {
    queryKey: qk('libraries'),
    staleTime: 5 * 60_000,
    queryFn: () => fetchLibraries(qc, api, user),
  }
}

/** The user's supported libraries (all of them; pins/hiding are a drawer concern). */
export function useLibraries(): UseQueryResult<Library[]> {
  const api = useApi()
  const qc = useQueryClient()
  const session = useSession()
  return useQuery({
    ...librariesQuery(qc, api, session?.userDto ?? {}),
    enabled: !!session,
  })
}

export function findLibrary(libraries: readonly Library[] | undefined, id: string | null | undefined): Library | undefined {
  return libraries?.find((l) => sameId(l.id, id))
}

/** `getTypeFor(collectionType)` (PlaybackConstants.kt:87-102): the main item kind of a library. */
export function kindForCollectionType(collectionType: CollectionType | null | undefined): BaseItemKind | null {
  switch (collectionType) {
    case 'movies':
      return 'Movie'
    case 'tvshows':
      return 'Series'
    case 'music':
      return 'Audio'
    case 'musicvideos':
      return 'MusicVideo'
    case 'trailers':
      return 'Trailer'
    case 'homevideos':
      return 'Video'
    case 'boxsets':
      return 'BoxSet'
    case 'books':
      return 'Book'
    case 'photos':
      return 'PhotoAlbum'
    case 'livetv':
      return 'LiveTvChannel'
    case 'playlists':
      return 'Playlist'
    case 'folders':
      return 'Folder'
    default:
      return null
  }
}
