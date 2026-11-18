// Pure editing operations of the home customization screen (W/ui/main/settings/HomeSettingsViewModel.kt,
// HomeLibraryRowTypeList.kt, HomeSettingsAddRow.kt, HomeRowSettings.kt). Unit-tested in editorModel.test.ts.
import type { BaseItemKind, CollectionType, ItemSortBy } from '@jellyfin/sdk/lib/generated-client/models'
import type { Library } from '../../common/libraries'
import { CARD_HEIGHT } from '../../common/viewOptions'
import {
  defaultViewOptionsFor,
  encodeRow,
  GENRE_VIEW_OPTIONS,
  LIVE_TV_VIEW_OPTIONS,
  viewOptions,
  type HomeRowConfig,
  type HomeRowViewOptions,
  type SortAndDirection,
} from '../model/homeRowConfig'
import { PRESET_DEFAULT, presetForItemKind, viewOptionsForCollectionType } from '../model/homeRowPresets'

/** `HomeRowConfigDisplay`: a row with the editor's stable id (ids are never persisted). */
export type EditorRow = { id: number; config: HomeRowConfig }

export const withIds = (rows: readonly HomeRowConfig[], from = 0): EditorRow[] => rows.map((config, i) => ({ id: from + i, config }))
export const nextIdOf = (rows: readonly EditorRow[]) => rows.reduce((m, r) => Math.max(m, r.id + 1), 0)

export type MoveDirection = 'UP' | 'DOWN'

/** `List.move`: swap with the neighbour; out-of-range moves are no-ops. */
export function moveRow<T>(rows: readonly T[], direction: MoveDirection, index: number): T[] {
  const to = direction === 'UP' ? index - 1 : index + 1
  if (index < 0 || index >= rows.length || to < 0 || to >= rows.length) return rows.slice()
  const out = rows.slice()
  ;[out[index], out[to]] = [out[to], out[index]]
  return out
}

/** Drag-and-drop (web): moves one entry from `from` to `to` (both indexes in the current list). */
export function reorderRow<T>(rows: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || from >= rows.length || to < 0 || to >= rows.length) return rows.slice()
  const out = rows.slice()
  const [moved] = out.splice(from, 1)
  out.splice(to, 0, moved)
  return out
}

/** `resizeCards`: every row's height += 4 * relative (no clamping, as upstream). */
export function resizeAll(rows: readonly EditorRow[], relative: number): EditorRow[] {
  return rows.map((r) => ({ ...r, config: { ...r.config, viewOptions: { ...r.config.viewOptions, heightDp: r.config.viewOptions.heightDp + 4 * relative } } }))
}

/**
 * `onConfigAction(Combine)`: the clicked row becomes ContinueWatchingCombined (its view options kept, same
 * id) and every other ContinueWatching / NextUp row is removed.
 */
export function combineRows(rows: readonly EditorRow[], rowId: number): EditorRow[] {
  const row = rows.find((r) => r.id === rowId)
  if (!row) return rows.slice()
  return rows
    .map((r) => (r.id === rowId ? { id: r.id, config: { type: 'ContinueWatchingCombined', viewOptions: row.config.viewOptions } as HomeRowConfig } : r))
    .filter((r) => r.id === rowId || (r.config.type !== 'ContinueWatching' && r.config.type !== 'NextUp'))
}

/** `onConfigAction(Split)`: ContinueWatching (same id) followed by a new NextUp row, same view options. */
export function splitRow(rows: readonly EditorRow[], rowId: number, newId: number): EditorRow[] {
  const index = rows.findIndex((r) => r.id === rowId)
  if (index < 0) return rows.slice()
  const vo = rows[index].config.viewOptions
  const out = rows.slice()
  out.splice(index, 1, { id: rowId, config: { type: 'ContinueWatching', viewOptions: vo } }, { id: newId, config: { type: 'NextUp', viewOptions: vo } })
  return out
}

/** ByParent sort dialog: picking the current sort flips it, "Default" clears it, anything else is ascending. */
export function nextSort(current: SortAndDirection | null, picked: ItemSortBy): SortAndDirection | null {
  if (current?.sort === picked) return { sort: picked, direction: current.direction === 'Ascending' ? 'Descending' : 'Ascending' }
  if (picked === 'Default') return null
  return { sort: picked, direction: 'Ascending' }
}

/** `BoxSetSortOptions` (SortAndDirection.kt:102-115). */
export const BOX_SET_SORT_OPTIONS: readonly ItemSortBy[] = [
  'Default',
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

/** `getStringRes(ItemSortBy)` (SortAndDirection.kt:157-190). */
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
    default:
      return 'default_track'
  }
}

// ---- add row ----

export type MetaRowType = 'CONTINUE_WATCHING' | 'NEXT_UP' | 'COMBINED_CONTINUE_WATCHING'
export const META_ROW_TYPES: readonly { type: MetaRowType; labelKey: string }[] = [
  { type: 'CONTINUE_WATCHING', labelKey: 'continue_watching' },
  { type: 'NEXT_UP', labelKey: 'next_up' },
  { type: 'COMBINED_CONTINUE_WATCHING', labelKey: 'combine_continue_next' },
]

export function metaRow(type: MetaRowType): HomeRowConfig {
  switch (type) {
    case 'CONTINUE_WATCHING':
      return { type: 'ContinueWatching', viewOptions: viewOptions() }
    case 'NEXT_UP':
      return { type: 'NextUp', viewOptions: viewOptions() }
    case 'COMBINED_CONTINUE_WATCHING':
      return { type: 'ContinueWatchingCombined', viewOptions: viewOptions() }
  }
}

export type LibraryRowType =
  | 'RECENTLY_ADDED'
  | 'RECENTLY_RELEASED'
  | 'SUGGESTIONS'
  | 'GENRES'
  | 'STUDIOS'
  | 'TV_CHANNELS'
  | 'TV_PROGRAMS'
  | 'RECENTLY_RECORDED'
  | 'COLLECTION'
  | 'PLAYLIST'

export const LIBRARY_ROW_TYPE_LABEL: Record<LibraryRowType, string> = {
  RECENTLY_ADDED: 'recently_added',
  RECENTLY_RELEASED: 'recently_released',
  SUGGESTIONS: 'suggestions',
  GENRES: 'genres',
  STUDIOS: 'studios',
  TV_CHANNELS: 'channels',
  TV_PROGRAMS: 'watch_live',
  RECENTLY_RECORDED: 'recently_recorded',
  COLLECTION: 'collection',
  PLAYLIST: 'playlist',
}

/** `SuggestionsWorker.getTypeForCollection` is non-null only for MOVIES and TVSHOWS. */
const supportsSuggestions = (ct: CollectionType | null) => ct === 'movies' || ct === 'tvshows'

/** `getSupportedRowTypes` (HomeLibraryRowTypeList.kt:60-122), branch order kept. */
export function supportedRowTypes(library: Library): LibraryRowType[] {
  if (library.isRecordingFolder) return ['RECENTLY_RECORDED', 'GENRES']
  if (library.collectionType === 'livetv') return ['TV_CHANNELS', 'TV_PROGRAMS']
  if (library.collectionType === 'tvshows') return ['RECENTLY_ADDED', 'RECENTLY_RELEASED', 'SUGGESTIONS', 'GENRES', 'STUDIOS']
  if (supportsSuggestions(library.collectionType)) return ['RECENTLY_ADDED', 'RECENTLY_RELEASED', 'SUGGESTIONS', 'GENRES']
  if (library.collectionType === 'boxsets') return ['RECENTLY_ADDED', 'RECENTLY_RELEASED', 'GENRES', 'COLLECTION']
  if (library.collectionType === 'playlists') return ['RECENTLY_ADDED', 'RECENTLY_RELEASED', 'GENRES', 'PLAYLIST']
  return ['RECENTLY_ADDED', 'RECENTLY_RELEASED', 'GENRES']
}

/**
 * `addRow(library, type)` (HomeSettingsViewModel.kt:296-413). COLLECTION / PLAYLIST open the search dialog
 * instead (null here).
 */
export function libraryRow(library: Library, type: LibraryRowType): HomeRowConfig | null {
  const vo = viewOptionsForCollectionType(library.collectionType)
  const parentId = library.id
  switch (type) {
    case 'RECENTLY_ADDED':
      return { type: 'RecentlyAdded', parentId, viewOptions: vo }
    case 'RECENTLY_RELEASED':
      return { type: 'RecentlyReleased', parentId, viewOptions: vo }
    case 'GENRES':
      return { type: 'Genres', parentId, viewOptions: { ...GENRE_VIEW_OPTIONS } }
    case 'STUDIOS':
      // `HomeRowConfig.Studios(library.itemId)`: the class default (genreDefault)
      return { type: 'Studios', parentId, viewOptions: defaultViewOptionsFor('Studios') }
    case 'SUGGESTIONS':
      return { type: 'Suggestions', parentId, viewOptions: vo }
    case 'TV_CHANNELS':
      return { type: 'TvChannels', viewOptions: { ...LIVE_TV_VIEW_OPTIONS } }
    case 'TV_PROGRAMS':
      return { type: 'TvPrograms', viewOptions: defaultViewOptionsFor('TvPrograms') }
    case 'RECENTLY_RECORDED':
      // `RecentlyAdded(library.itemId)`: plain HomeRowViewOptions()
      return { type: 'RecentlyAdded', parentId, viewOptions: viewOptions() }
    case 'COLLECTION':
    case 'PLAYLIST':
      return null
  }
}

/** `addRow(type, parent)`: a collection / playlist picked in the search dialog. */
export const byParentRow = (parentId: string): HomeRowConfig => ({ type: 'ByParent', parentId, recursive: false, sort: null, viewOptions: viewOptions() })

/** `addFavoriteRow`: view options from the default preset by kind. */
export const favoriteRow = (kind: BaseItemKind): HomeRowConfig => ({ type: 'Favorite', kind, viewOptions: presetForItemKind(PRESET_DEFAULT, kind) })

/** `favoriteOptions` (FavoritesViewModel.kt). */
const FAVORITE_OPTIONS: readonly BaseItemKind[] = [
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

/** `CollectionType.baseItemKinds` (CollectionFolderGrid.kt:190-251). */
function baseItemKinds(ct: CollectionType | null): BaseItemKind[] {
  switch (ct) {
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
      return ['TvChannel', 'LiveTvChannel', 'LiveTvProgram', 'Program', 'TvProgram']
    default:
      return []
  }
}

/** `possibleFavoriteTypes(sort = true)`: kinds implied by the libraries, plus Person, in `favoriteOptions` order. */
export function possibleFavoriteTypes(libraries: readonly Library[]): BaseItemKind[] {
  const kinds = new Set<BaseItemKind>(['Person'])
  for (const l of libraries) for (const k of baseItemKinds(l.collectionType)) kinds.add(k)
  return FAVORITE_OPTIONS.filter((k) => kinds.has(k))
}

// ---- row settings ----

export type ViewOptionKey = keyof HomeRowViewOptions
export type PrefItem =
  | { kind: 'slider'; key: 'heightDp' | 'spacing'; titleKey: string; min: number; max: number; step: number }
  | { kind: 'switch'; key: 'showTitles' | 'useSeries'; titleKey: string }
  | { kind: 'choice'; key: 'imageType' | 'episodeImageType' | 'aspectRatio' | 'episodeAspectRatio' | 'contentScale' | 'episodeContentScale'; titleKey: string; arrayKey: string }
  | { kind: 'action'; action: 'useThumb' | 'reset'; titleKey: string }

export type PrefGroup = { titleKey: string; items: PrefItem[] }

const HEIGHT: PrefItem = { kind: 'slider', key: 'heightDp', titleKey: 'height', min: 64, max: CARD_HEIGHT.poster + 64, step: 4 }
const SPACING: PrefItem = { kind: 'slider', key: 'spacing', titleKey: 'spacing', min: 0, max: 32, step: 2 }
const SHOW_TITLES: PrefItem = { kind: 'switch', key: 'showTitles', titleKey: 'show_titles' }
const USE_SERIES: PrefItem = { kind: 'switch', key: 'useSeries', titleKey: 'use_series' }
const IMAGE_TYPE: PrefItem = { kind: 'choice', key: 'imageType', titleKey: 'image_type', arrayKey: 'image_types' }
const ASPECT: PrefItem = { kind: 'choice', key: 'aspectRatio', titleKey: 'aspect_ratio', arrayKey: 'aspect_ratios' }
const SCALE: PrefItem = { kind: 'choice', key: 'contentScale', titleKey: 'global_content_scale', arrayKey: 'content_scale' }
const EP_IMAGE_TYPE: PrefItem = { kind: 'choice', key: 'episodeImageType', titleKey: 'image_type', arrayKey: 'image_types' }
const EP_ASPECT: PrefItem = { kind: 'choice', key: 'episodeAspectRatio', titleKey: 'aspect_ratio', arrayKey: 'aspect_ratios' }
const EP_SCALE: PrefItem = { kind: 'choice', key: 'episodeContentScale', titleKey: 'global_content_scale', arrayKey: 'content_scale' }
const USE_THUMB: PrefItem = { kind: 'action', action: 'useThumb', titleKey: 'use_thumb_images' }
const RESET: PrefItem = { kind: 'action', action: 'reset', titleKey: 'reset' }

/** `Options.OPTIONS / OPTIONS_EPISODES / GENRE_OPTIONS` chosen as in HomeSettingsPage.kt:214-225. */
export function prefGroupsFor(config: HomeRowConfig): PrefGroup[] {
  switch (config.type) {
    case 'ContinueWatching':
    case 'ContinueWatchingCombined':
      return [
        { titleKey: 'general', items: [HEIGHT, SPACING, SHOW_TITLES, IMAGE_TYPE, ASPECT, SCALE] },
        { titleKey: 'for_episodes', items: [USE_SERIES, EP_IMAGE_TYPE, EP_ASPECT, EP_SCALE] },
        { titleKey: 'more', items: [USE_THUMB, RESET] },
      ]
    case 'Genres':
      return [{ titleKey: 'general', items: [HEIGHT, SPACING, RESET] }]
    default:
      return [
        { titleKey: 'general', items: [HEIGHT, SPACING, SHOW_TITLES, IMAGE_TYPE, ASPECT, SCALE, USE_SERIES] },
        { titleKey: 'more', items: [USE_THUMB, RESET] },
      ]
  }
}

/** Reset target: `genreDefault` only for Genres (Studios get the plain defaults, as upstream). */
export const resetViewOptionsFor = (config: HomeRowConfig): HomeRowViewOptions =>
  config.type === 'Genres' ? { ...GENRE_VIEW_OPTIONS } : viewOptions()

/** Value list of a choice preference, in the order of its string array. */
export const CHOICE_VALUES = {
  imageType: ['PRIMARY', 'THUMB'],
  episodeImageType: ['PRIMARY', 'THUMB'],
  aspectRatio: ['TALL', 'WIDE', 'FOUR_THREE', 'SQUARE'],
  episodeAspectRatio: ['TALL', 'WIDE', 'FOUR_THREE', 'SQUARE'],
  contentScale: ['FIT', 'NONE', 'CROP', 'FILL', 'Fill_WIDTH', 'FILL_HEIGHT'],
  episodeContentScale: ['FIT', 'NONE', 'CROP', 'FILL', 'Fill_WIDTH', 'FILL_HEIGHT'],
} as const

/** Setter semantics: picking an image type also sets the matching aspect ratio (PRIMARY -> TALL, THUMB -> WIDE). */
export function setViewOption(vo: HomeRowViewOptions, key: ViewOptionKey, value: string | number | boolean): HomeRowViewOptions {
  if (key === 'imageType') return { ...vo, imageType: value as HomeRowViewOptions['imageType'], aspectRatio: value === 'THUMB' ? 'WIDE' : 'TALL' }
  if (key === 'episodeImageType')
    return { ...vo, episodeImageType: value as HomeRowViewOptions['episodeImageType'], episodeAspectRatio: value === 'THUMB' ? 'WIDE' : 'TALL' }
  return { ...vo, [key]: value }
}

/** `ViewOptionsUseThumb`. */
export const thumbOptions = (vo: HomeRowViewOptions): HomeRowViewOptions => ({
  ...vo,
  heightDp: CARD_HEIGHT.episode,
  spacing: 20,
  imageType: 'THUMB',
  aspectRatio: 'WIDE',
  contentScale: 'FIT',
  episodeImageType: 'THUMB',
  episodeAspectRatio: 'WIDE',
  episodeContentScale: 'FIT',
})

/** The editor title of a row (`HomeSettingsService.resolve`): the combined row is named after the action. */
export function editorTitleKey(config: HomeRowConfig): string | null {
  return config.type === 'ContinueWatchingCombined' ? 'combine_continue_next' : null
}

/** `settingsChanged`: rows (configs, order, view options) differ from the loaded ones. */
export function rowsChanged(a: readonly HomeRowConfig[], b: readonly HomeRowConfig[]): boolean {
  // compare the canonical JSON form (fixed key order, defaults omitted), like the data-class equality
  const enc = (rows: readonly HomeRowConfig[]) => JSON.stringify(rows.map(encodeRow))
  return a.length !== b.length || enc(a) !== enc(b)
}
