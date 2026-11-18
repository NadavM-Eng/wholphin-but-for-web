// Sort options (W/ui/data/SortAndDirection.kt) and the sortBy/sortOrder of a library grid request
// (CollectionFolderViewModel.createGetItemsRequest, CollectionFolderView.kt:538-560).
import type { BaseItemKind, CollectionType, ItemSortBy, SortOrder } from '@jellyfin/sdk/lib/generated-client/models'

export type SortAndDirection = { sort: ItemSortBy; direction: SortOrder }

export const DEFAULT_SORT: SortAndDirection = Object.freeze({ sort: 'SortName', direction: 'Ascending' })

export const flipDirection = (d: SortOrder): SortOrder => (d === 'Ascending' ? 'Descending' : 'Ascending')

const VIDEO: ItemSortBy[] = [
  'SortName',
  'PremiereDate',
  'DateCreated',
  'DatePlayed',
  'CommunityRating',
  'CriticRating',
  'OfficialRating',
  'Runtime',
  'PlayCount',
  'Random',
]

export const MOVIE_SORT_OPTIONS: readonly ItemSortBy[] = VIDEO
export const VIDEO_SORT_OPTIONS: readonly ItemSortBy[] = VIDEO
export const SERIES_SORT_OPTIONS: readonly ItemSortBy[] = [
  'SortName',
  'PremiereDate',
  'DateCreated',
  'DateLastContentAdded',
  'SeriesDatePlayed',
  'CommunityRating',
  'CriticRating',
  'OfficialRating',
  'Random',
]
export const EPISODE_SORT_OPTIONS: readonly ItemSortBy[] = [
  'SortName',
  'PremiereDate',
  'DateCreated',
  'DatePlayed',
  'AiredEpisodeOrder',
  'CommunityRating',
  'CriticRating',
  'OfficialRating',
  'Runtime',
  'PlayCount',
  'Random',
]
export const PLAYLIST_SORT_OPTIONS: readonly ItemSortBy[] = ['Default', ...VIDEO]
export const BOX_SET_SORT_OPTIONS: readonly ItemSortBy[] = ['Default', ...VIDEO]
export const ALBUM_SORT_OPTIONS: readonly ItemSortBy[] = [
  'SortName',
  'PremiereDate',
  'DateCreated',
  'DatePlayed',
  'AlbumArtist',
  'CommunityRating',
  'CriticRating',
  'Random',
]
export const ARTIST_SORT_OPTIONS: readonly ItemSortBy[] = [
  'SortName',
  'PremiereDate',
  'DateCreated',
  'DatePlayed',
  'CommunityRating',
  'CriticRating',
  'Random',
]
export const SONG_SORT_OPTIONS: readonly ItemSortBy[] = [
  'SortName',
  'PremiereDate',
  'Album',
  'AlbumArtist',
  'Artist',
  'DateCreated',
  'DatePlayed',
  'CommunityRating',
  'CriticRating',
  'PlayCount',
  'Runtime',
  'Random',
]

/** `getStringRes(sort)`: the Android string name of a sort label. */
export function sortLabelKey(sort: ItemSortBy): string {
  switch (sort) {
    case 'SortName':
    case 'SeriesSortName':
      return 'sort_by_name'
    case 'PremiereDate':
      return 'sort_by_date_released'
    case 'DateCreated':
      return 'sort_by_date_added'
    case 'DateLastContentAdded':
      return 'sort_by_date_episode_added'
    case 'DatePlayed':
    case 'SeriesDatePlayed':
      return 'sort_by_date_played'
    case 'Random':
      return 'sort_by_random'
    case 'CommunityRating':
      return 'community_rating'
    case 'CriticRating':
      return 'critic_rating'
    case 'OfficialRating':
      return 'official_rating'
    case 'PlayCount':
      return 'play_count'
    case 'AiredEpisodeOrder':
      return 'aired_episode_order'
    case 'Runtime':
      return 'runtime_sort'
    case 'Default':
      return 'default_track'
    case 'Album':
      return 'album'
    case 'AlbumArtist':
      return 'album_artist'
    case 'Artist':
      return 'artist'
    default:
      return 'sort_by_name'
  }
}

/** `rememberSortOptions(collectionType)`. Unknown / mixed => Video list. */
export function sortOptionsForCollection(collectionType: CollectionType | null | undefined): readonly ItemSortBy[] {
  switch (collectionType) {
    case 'movies':
      return MOVIE_SORT_OPTIONS
    case 'tvshows':
      return SERIES_SORT_OPTIONS
    case 'music':
      return ALBUM_SORT_OPTIONS
    case 'boxsets':
      return BOX_SET_SORT_OPTIONS
    default:
      return VIDEO_SORT_OPTIONS
  }
}

/** `rememberSortOptions(type)`. */
export function sortOptionsForKind(kind: BaseItemKind): readonly ItemSortBy[] {
  switch (kind) {
    case 'Movie':
      return MOVIE_SORT_OPTIONS
    case 'Series':
    case 'Season':
      return SERIES_SORT_OPTIONS
    case 'Episode':
      return EPISODE_SORT_OPTIONS
    case 'Audio':
      return SONG_SORT_OPTIONS
    case 'MusicAlbum':
      return ALBUM_SORT_OPTIONS
    case 'MusicArtist':
      return ARTIST_SORT_OPTIONS
    case 'BoxSet':
      return BOX_SET_SORT_OPTIONS
    default:
      return VIDEO_SORT_OPTIONS
  }
}

/** Dropdown pick: the current sort flips direction, another keeps the current direction. */
export function pickSort(current: SortAndDirection, sort: ItemSortBy): SortAndDirection {
  return { sort, direction: current.sort === sort ? flipDirection(current.direction) : current.direction }
}

/**
 * Library grid sort: `[sort]` + SortName tie-breaker (unless sorting by name) + ProductionYear for movie
 * libraries, each tie-breaker ascending. `Default` sends nothing (server order).
 */
export function gridSortParams(
  s: SortAndDirection,
  collectionType: CollectionType | null | undefined,
): { sortBy?: ItemSortBy[]; sortOrder?: SortOrder[] } {
  if (s.sort === 'Default') return {}
  const sortBy: ItemSortBy[] = [s.sort]
  const sortOrder: SortOrder[] = [s.direction]
  if (s.sort !== 'SortName') {
    sortBy.push('SortName')
    sortOrder.push('Ascending')
  }
  if (collectionType === 'movies') {
    sortBy.push('ProductionYear')
    sortOrder.push('Ascending')
  }
  return { sortBy, sortOrder }
}
