// Which item kinds the search page queries (W/ui/search/SearchViewModel.kt determineSearchableTypes,
// allSearchableTypes) and the library-kind mapping it relies on (W/ui/components/CollectionFolderGrid.kt
// `CollectionType.baseItemKinds`).
import type { BaseItemKind, CollectionType } from '@jellyfin/sdk/lib/generated-client/models'

/** Fixed order of the result rows. */
export const ALL_SEARCHABLE_TYPES: readonly BaseItemKind[] = [
  'Movie',
  'Series',
  'Episode',
  'BoxSet',
  'Person',
  'TvChannel',
  'LiveTvProgram',
  'MusicAlbum',
  'MusicArtist',
  'Audio',
  'MusicVideo',
  'Playlist',
  'Video',
  'Photo',
  'PhotoAlbum',
]

const LIVE_TV_KINDS: ReadonlySet<BaseItemKind> = new Set<BaseItemKind>(['TvChannel', 'LiveTvProgram', 'TvProgram', 'Program'])

/** `CollectionType.baseItemKinds`. `null` (mixed content) maps to UNKNOWN, which has none. */
export function kindsForCollectionType(collectionType: CollectionType | null | undefined): BaseItemKind[] {
  switch (collectionType) {
    case 'tvshows':
      return ['Series', 'Season', 'Episode']
    case 'movies':
      return ['Movie']
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

/**
 * The searchable types for this user: People always; Live TV kinds only with Live TV access (libraries
 * ignored); everything else only when one of the user's libraries holds that kind; minus `excluded`.
 */
export function determineSearchableTypes(
  libraryCollectionTypes: readonly (CollectionType | null | undefined)[],
  tvAccess: boolean,
  excluded: readonly string[],
): BaseItemKind[] {
  const libraryKinds = new Set(libraryCollectionTypes.flatMap((c) => kindsForCollectionType(c)))
  return ALL_SEARCHABLE_TYPES.filter((type) => {
    if (excluded.includes(type)) return false
    if (type === 'Person') return true
    if (LIVE_TV_KINDS.has(type)) return tvAccess
    return libraryKinds.has(type)
  })
}

/** `formatTypeName` (W/ui/Formatting.kt:276): the row title string key of a searchable type. */
export function searchTypeTitleKey(type: BaseItemKind): string {
  switch (type) {
    case 'Movie':
      return 'movies_title'
    case 'Series':
      return 'tv_shows_title'
    case 'Episode':
      return 'episodes'
    case 'BoxSet':
      return 'collections'
    case 'Person':
      return 'people_title'
    case 'TvChannel':
    case 'LiveTvChannel':
      return 'channels'
    case 'LiveTvProgram':
    case 'TvProgram':
    case 'Program':
      return 'programs'
    case 'MusicAlbum':
      return 'albums'
    case 'MusicArtist':
      return 'artists'
    case 'Audio':
      return 'songs'
    case 'MusicVideo':
      return 'music_videos'
    case 'Playlist':
      return 'playlists'
    case 'Video':
      return 'videos'
    case 'Photo':
      return 'photos'
    case 'PhotoAlbum':
      return 'photo_albums'
    default:
      return 'results'
  }
}

/** Card shape per row type (`SearchPageCard`). */
export type SearchCardKind = 'episode' | 'square' | 'person' | 'channel' | 'program' | 'poster'

export function searchCardKind(type: BaseItemKind): SearchCardKind {
  switch (type) {
    case 'Episode':
      return 'episode'
    case 'MusicAlbum':
    case 'MusicArtist':
    case 'Audio':
      return 'square'
    case 'Person':
      return 'person'
    case 'TvChannel':
      return 'channel'
    case 'Program':
    case 'TvProgram':
    case 'LiveTvProgram':
      return 'program'
    default:
      return 'poster'
  }
}

export const isProgramType = (type: BaseItemKind | null | undefined) =>
  type === 'Program' || type === 'TvProgram' || type === 'LiveTvProgram'

/** Card width in dp per kind (row virtualizer estimate): Cards.height2x3 = 172, heightEpisode = 128, HEIGHT_LIVE_TV = 96. */
export function searchCardWidthDp(kind: SearchCardKind): number {
  switch (kind) {
    case 'episode':
      // BannerCardWithTitle 128 x 16:9 plus horizontal padding 8 on each side
      return (128 * 16) / 9 + 16
    case 'square':
      return 128
    case 'person':
      return 108
    case 'channel':
    case 'program':
      return (96 * 16) / 9
    case 'poster':
      return (172 * 2) / 3
  }
}
