// TanStack Query hooks for the music pages (AlbumViewModel, ArtistViewModel, SongDetailsPage, RecommendedMusic,
// NowPlayingViewModel). Query keys start with qk(); `meta` declares which item mutations refetch them.
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models'
import { getLibraryApi } from '@jellyfin/sdk/lib/utils/api/library-api'
import { getLyricApi } from '@jellyfin/sdk/lib/utils/api/lyric-api'
import { useQuery } from '@tanstack/react-query'
import { itemKey, qk } from '../../../api/queryKeys'
import { useApi, useSession } from '../../../api/session'
import { itemQueryMeta } from '../../common/itemCache'
import { ITEM_ROW_FIELDS, SLIM_ITEM_FIELDS } from '../../common/itemFields'
import { allSongs } from './songSources'

export function useUserId(): string {
  return useSession()?.user.id ?? ''
}

/** `GET /Items/{id}` (refetched after favorite changes through the shared cache patching). */
export function useMusicItem(itemId: string | null | undefined) {
  const api = useApi()
  const userId = useUserId()
  return useQuery({
    queryKey: itemKey(itemId),
    enabled: !!itemId,
    meta: itemQueryMeta('deleted'),
    queryFn: async ({ signal }) => (await getLibraryApi(api).getItem({ itemId: itemId!, userId }, { signal })).data,
  })
}

/** Album songs, all pages (getPagerForAlbum: ParentIndexNumber, IndexNumber, SortName). */
export function useAlbumSongs(albumId: string | null | undefined) {
  const api = useApi()
  const userId = useUserId()
  return useQuery({
    queryKey: qk('music', 'albumSongs', albumId),
    enabled: !!albumId,
    meta: itemQueryMeta('deleted'),
    queryFn: ({ signal }) => allSongs(api, userId, { kind: 'album', id: albumId! }, signal),
  })
}

/** Playlist songs, all pages (getPagerForPlaylist). */
export function usePlaylistSongs(playlistId: string | null | undefined) {
  const api = useApi()
  const userId = useUserId()
  return useQuery({
    queryKey: qk('music', 'playlistSongs', playlistId),
    enabled: !!playlistId,
    meta: itemQueryMeta('deleted'),
    queryFn: ({ signal }) => allSongs(api, userId, { kind: 'playlist', id: playlistId! }, signal),
  })
}

/** `GET /Items/{id}/Similar?excludeArtistIds&fields=Slim&limit=25`. */
export function useSimilar(itemId: string | null | undefined, excludeArtistIds: readonly string[]) {
  const api = useApi()
  const userId = useUserId()
  return useQuery({
    queryKey: qk('music', 'similar', itemId, excludeArtistIds),
    enabled: !!itemId,
    meta: itemQueryMeta('deleted'),
    queryFn: async ({ signal }) =>
      (
        await getLibraryApi(api).getSimilarItems(
          { itemId: itemId!, userId, excludeArtistIds: excludeArtistIds.length ? [...excludeArtistIds] : undefined, fields: SLIM_ITEM_FIELDS, limit: 25 },
          { signal },
        )
      ).data.Items ?? [],
  })
}

/** Music videos of an album (`albumIds`) or an artist (`artistIds`). */
export function useMusicVideos(by: { albumId?: string | null; artistId?: string | null }) {
  const api = useApi()
  const userId = useUserId()
  const id = by.albumId ?? by.artistId
  return useQuery({
    queryKey: qk('music', 'videos', by.albumId ? 'album' : 'artist', id),
    enabled: !!id,
    meta: itemQueryMeta('played', 'favorite', 'deleted'),
    queryFn: async ({ signal }) =>
      (
        await getLibraryApi(api).getItems(
          {
            userId,
            albumIds: by.albumId ? [by.albumId] : undefined,
            artistIds: by.artistId ? [by.artistId] : undefined,
            recursive: true,
            includeItemTypes: ['MusicVideo'],
            fields: ITEM_ROW_FIELDS,
          },
          { signal },
        )
      ).data.Items ?? [],
  })
}

/** Album extras (ExtrasService.getExtras -> special features). */
export function useExtras(itemId: string | null | undefined) {
  const api = useApi()
  const userId = useUserId()
  return useQuery({
    queryKey: qk('music', 'extras', itemId),
    enabled: !!itemId,
    queryFn: async ({ signal }) => (await getLibraryApi(api).getSpecialFeatures({ itemId: itemId!, userId }, { signal })).data ?? [],
  })
}

/** Artist albums (`albumArtistIds`) or "Appears on" (`contributingArtistIds`), newest first. */
export function useArtistAlbums(artistId: string | null | undefined, kind: 'albums' | 'appearsOn') {
  const api = useApi()
  const userId = useUserId()
  return useQuery({
    queryKey: qk('music', 'artistAlbums', kind, artistId),
    enabled: !!artistId,
    meta: itemQueryMeta('deleted'),
    queryFn: async ({ signal }) =>
      (
        await getLibraryApi(api).getItems(
          {
            userId,
            albumArtistIds: kind === 'albums' ? [artistId!] : undefined,
            contributingArtistIds: kind === 'appearsOn' ? [artistId!] : undefined,
            recursive: true,
            fields: SLIM_ITEM_FIELDS,
            includeItemTypes: ['MusicAlbum'],
            sortBy: ['PremiereDate', 'SortName'],
            sortOrder: ['Descending', 'Ascending'],
            limit: 200,
          },
          { signal },
        )
      ).data.Items ?? [],
  })
}

/** "Popular songs": `artistIds`, minCommunityRating=1, CommunityRating descending, limit 10. */
export function usePopularSongs(artistId: string | null | undefined) {
  const api = useApi()
  const userId = useUserId()
  return useQuery({
    queryKey: qk('music', 'popular', artistId),
    enabled: !!artistId,
    meta: itemQueryMeta('deleted'),
    queryFn: async ({ signal }) =>
      (
        await getLibraryApi(api).getItems(
          {
            userId,
            artistIds: [artistId!],
            fields: [...SLIM_ITEM_FIELDS, 'MediaSources'],
            recursive: true,
            includeItemTypes: ['Audio'],
            minCommunityRating: 1,
            sortBy: ['CommunityRating'],
            sortOrder: ['Descending'],
            limit: 10,
          },
          { signal },
        )
      ).data.Items ?? [],
  })
}

/**
 * Album backdrop item (getBackdropItemForAlbum): the album when it has backdrops, else the first of its album
 * artists (up to 50, shuffled) that has one.
 */
export function useAlbumBackdropItem(album: BaseItemDto | null | undefined) {
  const api = useApi()
  const userId = useUserId()
  const hasOwn = (album?.BackdropImageTags?.length ?? 0) > 0
  return useQuery({
    queryKey: qk('music', 'albumBackdrop', album?.Id),
    enabled: !!album?.Id,
    staleTime: Infinity,
    queryFn: async ({ signal }): Promise<BaseItemDto | null> => {
      if (hasOwn) return album!
      const ids = (album!.AlbumArtists ?? [])
        .map((a) => a.Id)
        .filter((x): x is string => !!x)
        .sort(() => Math.random() - 0.5)
        .slice(0, 50)
      if (!ids.length) return null
      const res = await getLibraryApi(api).getItems({ userId, ids, imageTypes: ['Backdrop'] }, { signal })
      return res.data.Items?.[0] ?? null
    },
  })
}

/** `GET /Audio/{id}/Lyrics` (in-memory cache like upstream's LRU of 20: kept for the session). */
export function useLyrics(itemId: string | null | undefined, hasLyrics: boolean) {
  const api = useApi()
  return useQuery({
    queryKey: qk('music', 'lyrics', itemId),
    enabled: !!itemId && hasLyrics,
    staleTime: Infinity,
    gcTime: 30 * 60_000,
    retry: false,
    queryFn: async ({ signal }) => {
      try {
        return (await getLyricApi(api).getLyrics({ itemId: itemId! }, { signal })).data
      } catch {
        return null
      }
    },
  })
}

/** Song backdrops then artist backdrops for Now Playing (NowPlayingViewModel.listenForBackdrop). */
export function useNowPlayingBackdropItems(songId: string | null | undefined, enabled: boolean) {
  const api = useApi()
  const userId = useUserId()
  return useQuery({
    queryKey: qk('music', 'nowPlayingBackdrops', songId),
    enabled: !!songId && enabled,
    staleTime: 10 * 60_000,
    queryFn: async ({ signal }) => {
      const song = (await getLibraryApi(api).getItem({ itemId: songId!, userId }, { signal })).data
      const artistIds = (song.ArtistItems ?? []).map((a) => a.Id).filter((x): x is string => !!x)
      const artists = artistIds.length
        ? ((
            await getLibraryApi(api).getItems(
              { userId, ids: artistIds, imageTypes: ['Backdrop'], limit: 50, enableImages: true, enableImageTypes: ['Backdrop'] },
              { signal },
            )
          ).data.Items ?? [])
        : []
      return { song, artists }
    },
  })
}

