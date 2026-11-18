// Request building for photo libraries, albums and the slideshow. Ports of GetItemsFilter.applyTo
// (W/data/model/GetItemsFilter.kt), CollectionFolderViewModel.createGetItemsRequest
// (W/ui/components/CollectionFolderView.kt:513-567), SortAndDirection (W/ui/data/SortAndDirection.kt) and the
// slideshow list query (W/ui/slideshow/SlideshowViewModel.kt:124-144).
import type { BaseItemKind, ImageType, ItemFields, ItemSortBy, SortOrder, VideoType } from '@jellyfin/sdk/lib/generated-client/models'
import type { LibraryApiGetItemsRequest } from '@jellyfin/sdk/lib/generated-client/api/library-api'
import { SLIM_ITEM_FIELDS } from '../common/itemFields'

export interface SortAndDirection {
  sort: ItemSortBy
  direction: SortOrder
}

export const DEFAULT_SORT: SortAndDirection = { sort: 'SortName', direction: 'Ascending' }

/** `VideoSortOptions` (identical to the movie list); CollectionFolderPhotoAlbum's sort options. */
export const PHOTO_SORT_OPTIONS: readonly ItemSortBy[] = [
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

/** `getStringRes(sort)` (SortAndDirection.kt:157-195), for the sorts photo pages offer. */
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
    case 'Runtime':
      return 'runtime_sort'
    case 'Default':
      return 'default_track'
    default:
      return 'sort_by_name'
  }
}

/** SortByButton: picking the current sort flips the direction, another sort keeps it. */
export function nextSort(current: SortAndDirection, picked: ItemSortBy): SortAndDirection {
  if (picked === current.sort) return { sort: picked, direction: flipDirection(current.direction) }
  return { sort: picked, direction: current.direction }
}

export const flipDirection = (d: SortOrder): SortOrder => (d === 'Ascending' ? 'Descending' : 'Ascending')

// ---------------------------------------------------------------------------------------------
// Filter (GetItemsFilter subset used by DefaultFilterOptions)

/** `FilterVideoType` serial names. */
export type FilterVideoType = '4K' | 'HD' | 'SD' | '3D' | 'Blu-Ray' | 'DVD'
export const FILTER_VIDEO_TYPES: readonly FilterVideoType[] = ['4K', 'HD', 'SD', '3D', 'Blu-Ray', 'DVD']

/** `GetItemsFilter`: `undefined` = inactive. */
export interface PhotoFilter {
  played?: boolean
  favorite?: boolean
  genres?: string[]
  minCommunityRating?: number
  officialRatings?: string[]
  videoTypes?: FilterVideoType[]
  years?: number[]
  decades?: number[]
}

export type FilterKind = 'played' | 'favorite' | 'genres' | 'communityRating' | 'officialRatings' | 'videoTypes' | 'years' | 'decades'

/** `DefaultFilterOptions` (ItemFilterBy.kt:8), in dropdown order, with the label keys of ItemFilterBy. */
export const PHOTO_FILTER_OPTIONS: readonly { kind: FilterKind; labelKey: string; multiple: boolean }[] = [
  { kind: 'played', labelKey: 'played', multiple: false },
  { kind: 'favorite', labelKey: 'favorites', multiple: false },
  { kind: 'genres', labelKey: 'genres', multiple: true },
  // flagged supportMultiple upstream (ItemFilterBy.kt:208) although it is a single minimum: the menu stays open
  { kind: 'communityRating', labelKey: 'community_rating', multiple: true },
  { kind: 'officialRatings', labelKey: 'official_rating', multiple: true },
  { kind: 'videoTypes', labelKey: 'video', multiple: true },
  { kind: 'years', labelKey: 'year', multiple: true },
  { kind: 'decades', labelKey: 'decade', multiple: true },
]

export type FilterValue = boolean | number | string | readonly (number | string)[]

export function getFilterValue(f: PhotoFilter, kind: FilterKind): FilterValue | undefined {
  switch (kind) {
    case 'played':
      return f.played
    case 'favorite':
      return f.favorite
    case 'genres':
      return f.genres
    case 'communityRating':
      return f.minCommunityRating
    case 'officialRatings':
      return f.officialRatings
    case 'videoTypes':
      return f.videoTypes
    case 'years':
      return f.years
    case 'decades':
      return f.decades
  }
}

/** `ItemFilterBy.set`; `undefined` clears. Empty lists clear too (FilterByButton: empty -> null). */
export function setFilterValue(f: PhotoFilter, kind: FilterKind, value: FilterValue | undefined): PhotoFilter {
  const list = <T,>(v: unknown): T[] | undefined => (Array.isArray(v) && v.length > 0 ? ([...v] as T[]) : undefined)
  const next: PhotoFilter = { ...f }
  switch (kind) {
    case 'played':
      next.played = typeof value === 'boolean' ? value : undefined
      break
    case 'favorite':
      next.favorite = typeof value === 'boolean' ? value : undefined
      break
    case 'genres':
      next.genres = list<string>(value)
      break
    case 'communityRating':
      next.minCommunityRating = typeof value === 'number' ? value : undefined
      break
    case 'officialRatings':
      next.officialRatings = list<string>(value)
      break
    case 'videoTypes':
      next.videoTypes = list<FilterVideoType>(value)
      break
    case 'years':
      next.years = list<number>(value)
      break
    case 'decades':
      next.decades = list<number>(value)
      break
  }
  return compactFilter(next)
}

/** Multi-select rows toggle membership; Played/Favorite set the boolean; the rating sets the minimum. */
export function toggleFilterValue(f: PhotoFilter, kind: FilterKind, value: boolean | number | string): PhotoFilter {
  const current = getFilterValue(f, kind)
  if (kind === 'played' || kind === 'favorite' || kind === 'communityRating') return setFilterValue(f, kind, value)
  const arr = Array.isArray(current) ? (current as (number | string)[]) : []
  const next = arr.includes(value as never) ? arr.filter((v) => v !== value) : [...arr, value as number | string]
  return setFilterValue(f, kind, next)
}

export function countFilters(f: PhotoFilter): number {
  return PHOTO_FILTER_OPTIONS.reduce((n, o) => (getFilterValue(f, o.kind) != null ? n + 1 : n), 0)
}

export function clearFilters(): PhotoFilter {
  return {}
}

/** Drops undefined keys so equal filters serialize equally. */
export function compactFilter(f: PhotoFilter): PhotoFilter {
  const out: PhotoFilter = {}
  for (const [k, v] of Object.entries(f) as [keyof PhotoFilter, unknown][]) {
    if (v === undefined || v === null) continue
    if (Array.isArray(v) && v.length === 0) continue
    ;(out as Record<string, unknown>)[k] = v
  }
  return out
}

/** URL form of the filter (the slideshow's `filter` query parameter): JSON, or undefined when empty. */
export function serializeFilter(f: PhotoFilter): string | undefined {
  const c = compactFilter(f)
  return Object.keys(c).length ? JSON.stringify(c) : undefined
}

export function parseFilter(raw: string | null | undefined): PhotoFilter {
  if (!raw) return {}
  try {
    const v: unknown = JSON.parse(raw)
    if (!v || typeof v !== 'object' || Array.isArray(v)) return {}
    const o = v as Record<string, unknown>
    const bool = (x: unknown) => (typeof x === 'boolean' ? x : undefined)
    const strs = (x: unknown) => (Array.isArray(x) ? x.filter((s): s is string => typeof s === 'string') : undefined)
    const nums = (x: unknown) => (Array.isArray(x) ? x.filter((s): s is number => typeof s === 'number' && Number.isFinite(s)) : undefined)
    return compactFilter({
      played: bool(o.played),
      favorite: bool(o.favorite),
      genres: strs(o.genres),
      minCommunityRating: typeof o.minCommunityRating === 'number' ? o.minCommunityRating : undefined,
      officialRatings: strs(o.officialRatings),
      videoTypes: strs(o.videoTypes)?.filter((s): s is FilterVideoType => (FILTER_VIDEO_TYPES as readonly string[]).includes(s)),
      years: nums(o.years),
      decades: nums(o.decades),
    })
  } catch {
    return {}
  }
}

/** `years` union every year of each selected decade (`it..<(it + 10)`). */
export function expandYears(f: PhotoFilter): number[] {
  const set = new Set<number>(f.years ?? [])
  for (const d of f.decades ?? []) for (let y = d; y < d + 10; y++) set.add(y)
  return [...set]
}

type ItemsRequest = LibraryApiGetItemsRequest

/** `GetItemsFilter.applyTo(GetItemsRequest)` (overwriteIncludeTypes = true: the filter has no types, so none are sent). */
export function applyFilter(req: ItemsRequest, f: PhotoFilter): ItemsRequest {
  const vt = f.videoTypes?.length ? f.videoTypes : null
  const years = expandYears(f)
  const out: { -readonly [K in keyof ItemsRequest]: ItemsRequest[K] } = {
    ...req,
    includeItemTypes: undefined,
    isFavorite: f.favorite,
    genreIds: f.genres,
    minCommunityRating: f.minCommunityRating,
    isPlayed: f.played,
    officialRatings: f.officialRatings,
    years: years.length ? years : undefined,
  }
  if (vt) {
    if (vt.includes('4K')) out.is4K = true
    if (vt.includes('HD')) out.isHd = true
    else if (vt.includes('SD')) out.isHd = false
    if (vt.includes('3D')) out.is3D = true
    const types = vt.flatMap((v): VideoType[] => (v === 'Blu-Ray' ? ['BluRay'] : v === 'DVD' ? ['Dvd'] : []))
    if (types.length) out.videoTypes = types
  }
  return out
}

/** `enableImageTypes` of the library grid. */
const GRID_IMAGE_TYPES: ImageType[] = ['Primary', 'Thumb', 'Backdrop', 'Logo']

/** `sortBy` / `sortOrder` with the SortName tie-breaker (no ProductionYear: not a MOVIES library). */
export function sortParams(s: SortAndDirection): { sortBy?: ItemSortBy[]; sortOrder?: SortOrder[] } {
  if (s.sort === 'Default') return {}
  if (s.sort === 'SortName') return { sortBy: ['SortName'], sortOrder: [s.direction] }
  return { sortBy: [s.sort, 'SortName'], sortOrder: [s.direction, 'Ascending'] }
}

/** Grid request (`createGetItemsRequest`): startIndex/limit are added by the pager. */
export function gridRequest(p: {
  userId: string
  folderId: string
  recursive: boolean
  sort: SortAndDirection
  filter: PhotoFilter
}): ItemsRequest {
  // includeItemTypes from the collection type is computed upstream but then overwritten by applyTo
  // (filter.includeItemTypes is null), so photo libraries list every child kind, plain folders included.
  return applyFilter(
    {
      userId: p.userId,
      parentId: p.folderId,
      enableImageTypes: GRID_IMAGE_TYPES,
      recursive: p.recursive,
      excludeItemIds: [p.folderId],
      ...sortParams(p.sort),
      fields: SLIM_ITEM_FIELDS,
    },
    p.filter,
  )
}

/** `PhotoItemFields` (= DetailItemFields + Width, Height). */
export const PHOTO_FIELDS: ItemFields[] = [
  'Overview',
  'Trickplay',
  'SortName',
  'Chapters',
  'MediaSources',
  'MediaSourceCount',
  'CanDelete',
  'PrimaryImageAspectRatio',
  'Width',
  'Height',
]

/**
 * Slideshow list (SlideshowViewModel): photos (and videos when "Play videos during slideshow" is on), a single
 * sort key without the SortName tie-breaker, then the grid's filter.
 */
export function slideshowRequest(p: {
  userId: string
  parentId: string
  recursive: boolean
  sort: SortAndDirection
  filter: PhotoFilter
  playVideos: boolean
}): ItemsRequest {
  const includeItemTypes: BaseItemKind[] = p.playVideos ? ['Photo', 'Video'] : ['Photo']
  // applyTo overwrites includeItemTypes with the filter's (null) upstream too, which would let albums and
  // folders into the slideshow; the web keeps the photo/video restriction (SlideshowViewModel.kt:135-144).
  return {
    ...applyFilter(
      {
        userId: p.userId,
        parentId: p.parentId,
        fields: PHOTO_FIELDS,
        recursive: p.recursive,
        sortBy: [p.sort.sort],
        sortOrder: [p.sort.direction],
      },
      p.filter,
    ),
    includeItemTypes,
  }
}

// ---------------------------------------------------------------------------------------------
// Slideshow route parameters (/slideshow/:parentId)

export interface SlideshowParams {
  parentId: string
  index: number
  /** Web: the clicked item, so the viewer opens on it even when the grid index differs from the photo index. */
  itemId: string | null
  start: boolean
  recursive: boolean
  sort: SortAndDirection
  filter: PhotoFilter
}

const SORTS: ReadonlySet<string> = new Set([...PHOTO_SORT_OPTIONS, 'Default'])

export function parseSlideshowParams(parentId: string, q: URLSearchParams): SlideshowParams {
  const index = Number(q.get('index') ?? 0)
  const sort = q.get('sort')
  const order = q.get('order')
  const truthy = (v: string | null) => v === '1' || v === 'true'
  return {
    parentId,
    index: Number.isFinite(index) && index > 0 ? Math.floor(index) : 0,
    itemId: q.get('id') || null,
    start: truthy(q.get('start')),
    recursive: truthy(q.get('recursive')),
    sort: {
      sort: sort && SORTS.has(sort) ? (sort as ItemSortBy) : DEFAULT_SORT.sort,
      direction: order === 'desc' || order === 'Descending' ? 'Descending' : 'Ascending',
    },
    filter: parseFilter(q.get('filter')),
  }
}

/**
 * The viewer's query with `index` / `id` set to the photo on screen, or null when it already says so. Other
 * parameters (sort, filter, start, recursive) are kept.
 */
export function withViewerPosition(q: URLSearchParams, index: number, itemId: string | null): URLSearchParams | null {
  const idx = String(index)
  if (q.get('index') === idx && (q.get('id') ?? null) === itemId) return null
  const next = new URLSearchParams(q)
  next.set('index', idx)
  if (itemId) next.set('id', itemId)
  else next.delete('id')
  return next
}

/** QueueFilter JSON for PlaybackList (`/play/list`): the subset the playback queue understands. */
export function queueFilterJson(f: PhotoFilter): string | undefined {
  const years = expandYears(f)
  const q: Record<string, unknown> = {}
  if (f.genres?.length) q.genreIds = f.genres
  if (years.length) q.years = years
  if (f.officialRatings?.length) q.officialRatings = f.officialRatings
  if (f.played != null) q.isPlayed = f.played
  if (f.favorite != null) q.isFavorite = f.favorite
  return Object.keys(q).length ? JSON.stringify(q) : undefined
}
