// Item-kind sets used across features (W/util/Constants.kt, W/ui/playback/PlaybackConstants.kt).
import type { BaseItemKind, CollectionType } from '@jellyfin/sdk/lib/generated-client/models'

/** `supportedPlayableTypes`: kinds that get Play / Resume / Restart / "Play with" in the context menu. */
export const SUPPORTED_PLAYABLE_TYPES: ReadonlySet<BaseItemKind> = new Set<BaseItemKind>([
  'Movie',
  'Episode',
  'Video',
  'MusicVideo',
  'TvChannel',
  'TvProgram',
  'Recording',
  'Season',
  'Series',
  'BoxSet',
  'Playlist',
])

/** `supportedShufflableTypes`: kinds that get "Shuffle". */
export const SUPPORTED_SHUFFLABLE_TYPES: ReadonlySet<BaseItemKind> = new Set<BaseItemKind>(['Season', 'Series', 'BoxSet', 'Playlist'])

/** `BaseItemKind.playable` (PlaybackConstants.kt): the media Play key on a focused card starts playback. */
export const PLAY_KEY_TYPES: ReadonlySet<BaseItemKind> = new Set<BaseItemKind>([
  'Episode',
  'Movie',
  'MusicVideo',
  'Trailer',
  'Video',
  'LiveTvChannel',
  'LiveTvProgram',
  'Program',
  'Recording',
  'TvChannel',
  'TvProgram',
])

/** `supportedCollectionTypes` (Constants.kt): libraries the app shows. `undefined` = mixed content. */
export const SUPPORTED_COLLECTION_TYPES: ReadonlySet<CollectionType | undefined> = new Set<CollectionType | undefined>([
  'movies',
  'tvshows',
  'homevideos',
  'playlists',
  'boxsets',
  'livetv',
  'musicvideos',
  'folders',
  'music',
  'photos',
  undefined,
])

export const isPlayableType = (t: BaseItemKind | null | undefined) => t != null && SUPPORTED_PLAYABLE_TYPES.has(t)
export const isShufflableType = (t: BaseItemKind | null | undefined) => t != null && SUPPORTED_SHUFFLABLE_TYPES.has(t)
export const isPlayKeyType = (t: BaseItemKind | null | undefined) => t != null && PLAY_KEY_TYPES.has(t)

/** `formatTypeName` (Formatting.kt:276-310): plural display name string key of a kind. */
export function typeNameKey(kind: BaseItemKind): string {
  switch (kind) {
    case 'Movie':
      return 'movies_title'
    case 'Series':
      return 'tv_shows_title'
    case 'Episode':
      return 'episodes'
    case 'Video':
      return 'videos'
    case 'Playlist':
    case 'ManualPlaylistsFolder':
    case 'PlaylistsFolder':
      return 'playlists'
    case 'CollectionFolder':
      return 'library'
    case 'LiveTvProgram':
      return 'programs'
    case 'Person':
      return 'people_title'
    case 'BoxSet':
      return 'collections'
    case 'Audio':
      return 'songs'
    case 'Channel':
    case 'LiveTvChannel':
    case 'TvChannel':
      return 'channels'
    case 'Genre':
    case 'MusicGenre':
      return 'genres'
    case 'MusicAlbum':
      return 'albums'
    case 'MusicArtist':
      return 'artists'
    case 'MusicVideo':
      return 'music_videos'
    case 'Photo':
      return 'photos'
    case 'PhotoAlbum':
      return 'photo_albums'
    case 'Program':
    case 'TvProgram':
      return 'programs'
    case 'Recording':
      return 'recordings'
    case 'Season':
      return 'tv_seasons'
    case 'Studio':
      return 'studios'
    case 'Trailer':
      return 'trailers_title'
    case 'UserView':
      return 'user_views'
    case 'Year':
      return 'year'
    case 'AudioBook':
      return 'audio_books'
    case 'Book':
      return 'books'
    default:
      return 'folders_title'
  }
}
