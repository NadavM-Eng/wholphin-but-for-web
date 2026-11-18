// Display presets (W/ui/main/settings/HomeRowPresets.kt), per-library defaults
// (HomeSettingsService.viewOptionsForCollectionType) and the default row set (createDefault).
import type { BaseItemKind, CollectionType } from '@jellyfin/sdk/lib/generated-client/models'
import type { Library } from '../../common/libraries'
import { CARD_HEIGHT } from '../../common/viewOptions'
import {
  DEFAULT_VIEW_OPTIONS,
  GENRE_VIEW_OPTIONS,
  LIVE_TV_VIEW_OPTIONS,
  viewOptions,
  type HomeRowConfig,
  type HomeRowViewOptions,
} from './homeRowConfig'

export type HomeRowPresets = {
  continueWatching: HomeRowViewOptions
  movieLibrary: HomeRowViewOptions
  tvLibrary: HomeRowViewOptions
  videoLibrary: HomeRowViewOptions
  photoLibrary: HomeRowViewOptions
  musicLibrary: HomeRowViewOptions
  playlist: HomeRowViewOptions
  liveTv: HomeRowViewOptions
  genreSize: number
}

export const PRESET_DEFAULT: HomeRowPresets = {
  continueWatching: viewOptions(),
  movieLibrary: viewOptions(),
  tvLibrary: viewOptions(),
  videoLibrary: viewOptions({ aspectRatio: 'WIDE' }),
  photoLibrary: viewOptions({ aspectRatio: 'WIDE', contentScale: 'CROP' }),
  musicLibrary: viewOptions({ aspectRatio: 'SQUARE' }),
  playlist: viewOptions({ aspectRatio: 'SQUARE', contentScale: 'FIT' }),
  liveTv: { ...LIVE_TV_VIEW_OPTIONS },
  genreSize: GENRE_VIEW_OPTIONS.heightDp,
}

function compactLibraries(height: number, epHeight: number) {
  return {
    movieLibrary: viewOptions({ heightDp: height }),
    tvLibrary: viewOptions({ heightDp: height }),
    videoLibrary: viewOptions({ heightDp: epHeight, aspectRatio: 'WIDE' }),
    photoLibrary: viewOptions({ heightDp: epHeight, aspectRatio: 'WIDE', contentScale: 'CROP' }),
    musicLibrary: viewOptions({ heightDp: epHeight, aspectRatio: 'SQUARE' }),
    playlist: viewOptions({ heightDp: epHeight, aspectRatio: 'SQUARE', contentScale: 'FIT' }),
    liveTv: { ...LIVE_TV_VIEW_OPTIONS },
    genreSize: epHeight,
  }
}

export const PRESET_COMPACT: HomeRowPresets = {
  continueWatching: viewOptions({ heightDp: 148 }),
  ...compactLibraries(148, 100),
}

export const PRESET_SERIES_THUMBS: HomeRowPresets = {
  continueWatching: viewOptions({
    heightDp: 100,
    imageType: 'THUMB',
    aspectRatio: 'WIDE',
    useSeries: true,
    episodeImageType: 'THUMB',
    episodeAspectRatio: 'WIDE',
  }),
  ...compactLibraries(148, 100),
}

export const PRESET_EPISODE_THUMBNAILS: HomeRowPresets = {
  continueWatching: viewOptions({
    heightDp: 100,
    imageType: 'THUMB',
    aspectRatio: 'WIDE',
    showTitles: true,
    useSeries: false,
    episodeImageType: 'PRIMARY',
    episodeAspectRatio: 'WIDE',
  }),
  ...compactLibraries(148, 100),
}

/** The presets list in upstream order with their title string keys. */
export const HOME_ROW_PRESETS: readonly { titleKey: string; preset: HomeRowPresets }[] = [
  { titleKey: 'display_preset_default', preset: PRESET_DEFAULT },
  { titleKey: 'display_preset_compact', preset: PRESET_COMPACT },
  { titleKey: 'display_preset_series_thumb', preset: PRESET_SERIES_THUMBS },
  { titleKey: 'display_preset_episode_thumbnails', preset: PRESET_EPISODE_THUMBNAILS },
]

/** `HomeRowPresets.getByCollectionType`. PLAYLISTS/BOOKS/FOLDERS/UNKNOWN get the plain defaults. */
export function presetForCollectionType(p: HomeRowPresets, ct: CollectionType | null | undefined): HomeRowViewOptions {
  switch (ct) {
    case 'movies':
    case 'boxsets':
      return { ...p.movieLibrary }
    case 'tvshows':
      return { ...p.tvLibrary }
    case 'musicvideos':
    case 'trailers':
    case 'homevideos':
      return { ...p.videoLibrary }
    case 'photos':
      return { ...p.photoLibrary }
    case 'livetv':
      return { ...p.liveTv }
    case 'music':
      return { ...p.musicLibrary }
    default:
      return { ...DEFAULT_VIEW_OPTIONS }
  }
}

/** `HomeRowPresets.getByItemType` (HomeRowPresets.kt:64-104, SH-3). */
export function presetForItemKind(p: HomeRowPresets, kind: BaseItemKind): HomeRowViewOptions {
  switch (kind) {
    case 'Series':
    case 'Season':
      return { ...p.tvLibrary }
    case 'Episode':
      return { ...p.continueWatching }
    case 'Video':
    case 'MusicVideo':
    case 'Photo':
    case 'PhotoAlbum':
      return { ...p.videoLibrary }
    case 'Playlist':
      return { ...p.playlist }
    case 'MusicArtist':
    case 'MusicAlbum':
    case 'Audio':
      return { ...p.musicLibrary }
    case 'TvChannel':
    case 'LiveTvChannel':
    case 'Program':
    case 'TvProgram':
    case 'LiveTvProgram':
      return { ...p.liveTv }
    case 'Genre':
    case 'MusicGenre':
    case 'Studio':
      return { ...GENRE_VIEW_OPTIONS, heightDp: p.genreSize }
    default:
      // MOVIE, BOX_SET, PERSON and anything else
      return { ...p.movieLibrary }
  }
}

/**
 * `HomeSettingsViewModel.applyPreset` (:700-803). `collectionTypeOf` returns the parent's collection
 * type (libraries first, else the item, else null = UNKNOWN).
 */
export function applyPreset(
  rows: readonly HomeRowConfig[],
  p: HomeRowPresets,
  collectionTypeOf: (parentId: string) => CollectionType | null | undefined,
): HomeRowConfig[] {
  return rows.map((c): HomeRowConfig => {
    switch (c.type) {
      case 'ContinueWatching':
      case 'NextUp':
      case 'ContinueWatchingCombined':
        return { ...c, viewOptions: { ...p.continueWatching } }
      case 'ByParent':
      case 'RecentlyAdded':
      case 'RecentlyReleased':
      case 'Suggestions':
        return { ...c, viewOptions: presetForCollectionType(p, collectionTypeOf(c.parentId)) }
      case 'Favorite':
        return { ...c, viewOptions: presetForItemKind(p, c.kind) }
      case 'Genres':
      case 'Studios':
        return { ...c, viewOptions: { ...c.viewOptions, heightDp: p.genreSize } }
      case 'Recordings':
        return { ...c, viewOptions: { ...p.tvLibrary } }
      case 'TvPrograms':
      case 'TvChannels':
        return { ...c, viewOptions: { ...p.liveTv } }
      case 'GetItems':
      case 'CustomEndpoint':
        return c
    }
  })
}

/** `viewOptionsForCollectionType` (HomeSettingsService.kt:668-705). */
export function viewOptionsForCollectionType(ct: CollectionType | null | undefined): HomeRowViewOptions {
  switch (ct) {
    case 'music':
      return viewOptions({ heightDp: CARD_HEIGHT.episode, aspectRatio: 'SQUARE' })
    case 'photos':
    case 'homevideos':
    case 'musicvideos':
    case 'trailers':
      return viewOptions({ heightDp: CARD_HEIGHT.episode, aspectRatio: 'WIDE' })
    case 'livetv':
      return { ...LIVE_TV_VIEW_OPTIONS }
    default:
      return viewOptions()
  }
}

/**
 * `HomeSettingsService.createDefault`: Combined Continue Watching & Next Up, then for each library
 * (in server order) "Watch live" for Live TV or "Recently added in {library}".
 * Pass the libraries the drawer has not unpinned (upstream `getFilteredUserLibraries`).
 */
export function createDefaultRows(libraries: readonly Library[]): HomeRowConfig[] {
  const rows: HomeRowConfig[] = [{ type: 'ContinueWatchingCombined', viewOptions: viewOptions() }]
  for (const lib of libraries) {
    if (lib.collectionType === 'livetv') rows.push({ type: 'TvPrograms', viewOptions: { ...LIVE_TV_VIEW_OPTIONS } })
    else rows.push({ type: 'RecentlyAdded', parentId: lib.id, viewOptions: viewOptionsForCollectionType(lib.collectionType) })
  }
  return rows
}
