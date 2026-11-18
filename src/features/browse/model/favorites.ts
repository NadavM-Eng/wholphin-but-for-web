// Favorites page model (W/ui/detail/FavoritesViewModel.kt).
import type { BaseItemKind, CollectionType } from '@jellyfin/sdk/lib/generated-client/models'
import { FAVORITES_ID } from './displayInfo'

/** `favoriteOptions`: the supported favorite types, also their tab order. */
export const FAVORITE_OPTIONS: readonly BaseItemKind[] = [
  'Movie',
  'Series',
  'Season',
  'Episode',
  'BoxSet',
  'Person',
  'TvChannel',
  'MusicAlbum',
  'MusicArtist',
  'Audio',
  'MusicVideo',
  'Playlist',
  'Video',
  'Photo',
  'PhotoAlbum',
]

/** `CollectionType.baseItemKinds` (W/ui/components/CollectionFolderGrid.kt:190-245). */
export function collectionKinds(collectionType: CollectionType | null | undefined): BaseItemKind[] {
  switch (collectionType) {
    case 'movies':
      return ['Movie']
    case 'tvshows':
      return ['Series', 'Season', 'Episode']
    case 'photos':
    case 'homevideos':
      return ['Video', 'Photo', 'PhotoAlbum']
    case 'music':
      return ['Audio', 'MusicArtist', 'MusicAlbum']
    case 'musicvideos':
      return ['MusicVideo']
    case 'boxsets':
      return ['BoxSet']
    case 'playlists':
      return ['Playlist']
    case 'livetv':
      return ['TvChannel', 'LiveTvChannel', 'Program', 'TvProgram', 'LiveTvProgram']
    case 'trailers':
      return ['Trailer']
    case 'books':
      return ['Book']
    case 'folders':
      return ['Folder']
    default:
      return []
  }
}

/** `possibleFavoriteTypes` then `favoriteOptions.filter { it in available }`: Person is always possible. */
export function favoriteTypes(collectionTypes: readonly (CollectionType | null | undefined)[]): BaseItemKind[] {
  const available = new Set<BaseItemKind>(collectionTypes.flatMap((c) => collectionKinds(c)))
  available.add('Person')
  return FAVORITE_OPTIONS.filter((k) => available.has(k))
}

/** `libraryDisplayItemId(type)`: legacy keys for six types, else the kind's serial name. */
export function favoritesDisplayId(kind: BaseItemKind): string {
  const legacy: Partial<Record<BaseItemKind, string>> = {
    Movie: 'movies',
    Series: 'series',
    Episode: 'episodes',
    Video: 'videos',
    Playlist: 'playlists',
    Person: 'people',
  }
  return `${FAVORITES_ID}_${legacy[kind] ?? kind}`
}

export type FavoriteTabResult = { kind: BaseItemKind; status: 'pending' | 'error' | 'empty' | 'items' }

/**
 * Initial tab (`initialFetchAndWait`): the preferred tab (remembered, else the first option) when it has
 * items or failed; else, in option order, the first type that has items or failed; `null` while an
 * earlier type is still loading; 'none' when every type came back empty.
 */
export function initialFavoriteTab(preferred: BaseItemKind | null, results: readonly FavoriteTabResult[]): BaseItemKind | 'none' | null {
  const usable = (r: FavoriteTabResult) => r.status === 'items' || r.status === 'error'
  const pref = results.find((r) => r.kind === preferred)
  if (pref?.status === 'pending') return null
  if (pref && usable(pref)) return pref.kind
  for (const r of results) {
    if (r.status === 'pending') return null
    if (usable(r)) return r.kind
  }
  return 'none'
}
