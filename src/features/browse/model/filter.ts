// Library filters (W/data/model/GetItemsFilter.kt, W/data/filter/ItemFilterBy.kt). The JSON shape is the
// Kotlin field names so a saved filter reads back unchanged; ids are kept as the server sends them.
import type { BaseItemKind, VideoType } from '@jellyfin/sdk/lib/generated-client/models'

/** `FilterVideoType` (serialized enum names) with their labels (`readable`). */
export type FilterVideoType = 'FOUR_K' | 'HD' | 'SD' | 'THREE_D' | 'BLU_RAY' | 'DVD'
export const FILTER_VIDEO_TYPES: readonly { value: FilterVideoType; label: string }[] = [
  { value: 'FOUR_K', label: '4K' },
  { value: 'HD', label: 'HD' },
  { value: 'SD', label: 'SD' },
  { value: 'THREE_D', label: '3D' },
  { value: 'BLU_RAY', label: 'Blu-Ray' },
  { value: 'DVD', label: 'DVD' },
]

/** `GetItemsFilterOverride`. */
export type FilterOverride = 'NONE' | 'PERSON' | 'ARTIST'

/** `GetItemsFilter`: null/undefined = that filter is off. */
export type GetItemsFilter = {
  favorite?: boolean | null
  genres?: string[] | null
  minCommunityRating?: number | null
  officialRatings?: string[] | null
  persons?: string[] | null
  played?: boolean | null
  studios?: string[] | null
  tags?: string[] | null
  includeItemTypes?: BaseItemKind[] | null
  videoTypes?: FilterVideoType[] | null
  years?: number[] | null
  decades?: number[] | null
  override?: FilterOverride
}

/** `ItemFilterBy` objects. */
export type FilterKind = 'Played' | 'Favorite' | 'Genre' | 'Studio' | 'CommunityRating' | 'OfficialRating' | 'VideoType' | 'Year' | 'Decade'

export type FilterDef = {
  kind: FilterKind
  /** Android string name of the label. */
  labelKey: string
  supportMultiple: boolean
  get: (f: GetItemsFilter) => unknown
  set: (f: GetItemsFilter, value: unknown) => GetItemsFilter
}

const list = <T>(v: unknown): T[] | null => (Array.isArray(v) && v.length > 0 ? (v as T[]) : null)

export const FILTERS: Readonly<Record<FilterKind, FilterDef>> = {
  Genre: { kind: 'Genre', labelKey: 'genres', supportMultiple: true, get: (f) => f.genres ?? null, set: (f, v) => ({ ...f, genres: list<string>(v) }) },
  Played: { kind: 'Played', labelKey: 'played', supportMultiple: false, get: (f) => f.played ?? null, set: (f, v) => ({ ...f, played: v == null ? null : Boolean(v) }) },
  Favorite: { kind: 'Favorite', labelKey: 'favorites', supportMultiple: false, get: (f) => f.favorite ?? null, set: (f, v) => ({ ...f, favorite: v == null ? null : Boolean(v) }) },
  OfficialRating: {
    kind: 'OfficialRating',
    labelKey: 'official_rating',
    supportMultiple: true,
    get: (f) => f.officialRatings ?? null,
    set: (f, v) => ({ ...f, officialRatings: list<string>(v) }),
  },
  VideoType: { kind: 'VideoType', labelKey: 'video', supportMultiple: true, get: (f) => f.videoTypes ?? null, set: (f, v) => ({ ...f, videoTypes: list<FilterVideoType>(v) }) },
  Year: { kind: 'Year', labelKey: 'year', supportMultiple: true, get: (f) => f.years ?? null, set: (f, v) => ({ ...f, years: list<number>(v) }) },
  Decade: { kind: 'Decade', labelKey: 'decade', supportMultiple: true, get: (f) => f.decades ?? null, set: (f, v) => ({ ...f, decades: list<number>(v) }) },
  // ItemFilterBy.kt:208 flags it supportMultiple, but it is a single minimum value (kept open on select).
  CommunityRating: {
    kind: 'CommunityRating',
    labelKey: 'community_rating',
    supportMultiple: true,
    get: (f) => (f.minCommunityRating == null ? null : Math.trunc(f.minCommunityRating)),
    set: (f, v) => ({ ...f, minCommunityRating: typeof v === 'number' ? v : null }),
  },
  Studio: { kind: 'Studio', labelKey: 'studios', supportMultiple: true, get: (f) => f.studios ?? null, set: (f, v) => ({ ...f, studios: list<string>(v) }) },
}

const opts = (...k: FilterKind[]) => k.map((x) => FILTERS[x])

export const DEFAULT_FILTER_OPTIONS = opts('Played', 'Favorite', 'Genre', 'CommunityRating', 'OfficialRating', 'VideoType', 'Year', 'Decade')
export const DEFAULT_TV_FILTER_OPTIONS = opts('Played', 'Favorite', 'Genre', 'Studio', 'CommunityRating', 'OfficialRating', 'VideoType', 'Year', 'Decade')
export const FAVORITES_FILTER_OPTIONS = opts('Played', 'Genre', 'CommunityRating', 'OfficialRating', 'VideoType', 'Year', 'Decade')
export const GENRES_FILTER_OPTIONS = opts('Played', 'Favorite', 'Studio', 'CommunityRating', 'OfficialRating', 'VideoType', 'Year', 'Decade')
export const STUDIOS_FILTER_OPTIONS = opts('Played', 'Favorite', 'Genre', 'CommunityRating', 'OfficialRating', 'VideoType', 'Year', 'Decade')

/** `countFilters`: the badge number. */
export function countFilters(f: GetItemsFilter, options: readonly FilterDef[]): number {
  return options.filter((o) => o.get(f) != null).length
}

/** `delete`: clears the given filters. */
export function deleteFilters(f: GetItemsFilter, options: readonly FilterDef[]): GetItemsFilter {
  return options.reduce((acc, o) => o.set(acc, null), f)
}

/** `merge`: keeps this filter's set values and fills the unset ones from `saved`; `override` from this. */
export function mergeFilter(page: GetItemsFilter, saved: GetItemsFilter): GetItemsFilter {
  return {
    favorite: page.favorite ?? saved.favorite ?? null,
    genres: page.genres ?? saved.genres ?? null,
    minCommunityRating: page.minCommunityRating ?? saved.minCommunityRating ?? null,
    officialRatings: page.officialRatings ?? saved.officialRatings ?? null,
    persons: page.persons ?? saved.persons ?? null,
    played: page.played ?? saved.played ?? null,
    studios: page.studios ?? saved.studios ?? null,
    tags: page.tags ?? saved.tags ?? null,
    includeItemTypes: page.includeItemTypes ?? saved.includeItemTypes ?? null,
    videoTypes: page.videoTypes ?? saved.videoTypes ?? null,
    years: page.years ?? saved.years ?? null,
    decades: page.decades ?? saved.decades ?? null,
    override: page.override ?? 'NONE',
  }
}

/** The `years` sent: explicit years plus every year of each selected decade (d..d+9). */
export function filterYears(f: GetItemsFilter): number[] | undefined {
  const out = new Set<number>(f.years ?? [])
  for (const d of f.decades ?? []) for (let y = d; y < d + 10; y++) out.add(y)
  return out.size > 0 ? [...out].sort((a, b) => a - b) : undefined
}

/** The `GET /Items` parameters a filter sets (`GetItemsFilter.applyTo(GetItemsRequest)`). */
export type ItemsFilterParams = {
  includeItemTypes?: BaseItemKind[]
  isFavorite?: boolean
  genreIds?: string[]
  minCommunityRating?: number
  personIds?: string[]
  isPlayed?: boolean
  studioIds?: string[]
  tags?: string[]
  officialRatings?: string[]
  years?: number[]
  is4K?: boolean
  isHd?: boolean
  is3D?: boolean
  videoTypes?: VideoType[]
}

const nn = <T>(v: T | null | undefined): T | undefined => (v == null ? undefined : v)
const nonEmpty = <T>(v: T[] | null | undefined): T[] | undefined => (v && v.length > 0 ? v : undefined)

/**
 * `applyTo(req, overwriteIncludeTypes)`: with `overwriteIncludeTypes` (the default) the filter's types
 * replace the request's, even when unset (CollectionFolderView: the library's own kinds are dropped).
 * Video types map to the REST names `is4K` / `isHd` / `is3D` (Kotlin is4k / is3d).
 */
export function applyFilter(f: GetItemsFilter, requestTypes?: BaseItemKind[]): ItemsFilterParams {
  const vt = nonEmpty(f.videoTypes)
  const videoTypes = vt?.flatMap((v): VideoType[] => (v === 'BLU_RAY' ? ['BluRay'] : v === 'DVD' ? ['Dvd'] : []))
  return {
    includeItemTypes: requestTypes !== undefined ? requestTypes : nonEmpty(f.includeItemTypes),
    isFavorite: nn(f.favorite),
    genreIds: nonEmpty(f.genres),
    minCommunityRating: nn(f.minCommunityRating),
    personIds: nonEmpty(f.persons),
    isPlayed: nn(f.played),
    studioIds: nonEmpty(f.studios),
    tags: nonEmpty(f.tags),
    officialRatings: nonEmpty(f.officialRatings),
    years: filterYears(f),
    is4K: vt?.includes('FOUR_K') ? true : undefined,
    isHd: vt ? (vt.includes('HD') ? true : vt.includes('SD') ? false : undefined) : undefined,
    is3D: vt?.includes('THREE_D') ? true : undefined,
    videoTypes: videoTypes && videoTypes.length > 0 ? videoTypes : undefined,
  }
}

/** One selectable value of a filter (`FilterValueOption`). */
export type FilterValue = { name: string; value: string | number | boolean | null }

/** Whether `value` is the selected one / among the selected (`FilterByButton` isSelected). */
export function isValueSelected(def: FilterDef, f: GetItemsFilter, value: FilterValue): boolean {
  const cur = def.get(f)
  switch (def.kind) {
    case 'Played':
    case 'Favorite':
      return cur != null && cur === (value.name === 'True')
    case 'OfficialRating':
      return Array.isArray(cur) && cur.includes(value.name)
    case 'CommunityRating':
      return cur === value.value
    default:
      return Array.isArray(cur) && (cur as unknown[]).includes(value.value)
  }
}

/** The filter after choosing `value` (toggle for lists, set for booleans and the rating). */
export function selectValue(def: FilterDef, f: GetItemsFilter, value: FilterValue): GetItemsFilter {
  switch (def.kind) {
    case 'Played':
    case 'Favorite':
      // "True"/"False" literal values, parsed with toBoolean
      return def.set(f, value.name === 'True')
    case 'CommunityRating':
      return def.set(f, value.value)
    case 'OfficialRating': {
      const cur = (def.get(f) as string[] | null) ?? []
      return def.set(f, cur.includes(value.name) ? cur.filter((x) => x !== value.name) : [...cur, value.name])
    }
    default: {
      const cur = (def.get(f) as unknown[] | null) ?? []
      return def.set(f, cur.includes(value.value) ? cur.filter((x) => x !== value.value) : [...cur, value.value])
    }
  }
}
