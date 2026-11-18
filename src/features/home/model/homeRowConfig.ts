// Home row configuration (W/data/model/HomeRowConfig.kt). The JSON shape is byte-compatible with
// upstream's kotlinx serialization: class discriminator "type", Kotlin enum names for Wholphin enums,
// Jellyfin wire names for SDK enums, default-valued keys omitted on write (encodeDefaults = false).
import type { BaseItemKind, ItemSortBy, SortOrder } from '@jellyfin/sdk/lib/generated-client/models'
import { dashedId } from '../../common/displayPreferences'
import {
  ASPECT_RATIOS,
  CARD_HEIGHT,
  CONTENT_SCALES,
  VIEW_IMAGE_TYPES,
  type AspectRatioName,
  type ContentScale,
  type ViewImageType,
} from '../../common/viewOptions'

export type HomeRowViewOptions = {
  heightDp: number
  spacing: number
  contentScale: ContentScale
  aspectRatio: AspectRatioName
  imageType: ViewImageType
  showTitles: boolean
  useSeries: boolean
  episodeContentScale: ContentScale
  episodeAspectRatio: AspectRatioName
  episodeImageType: ViewImageType
}

/** `HomeRowViewOptions()` (HomeRowConfig.kt:250-261). */
export const DEFAULT_VIEW_OPTIONS: Readonly<HomeRowViewOptions> = Object.freeze({
  heightDp: CARD_HEIGHT.poster,
  spacing: 16,
  contentScale: 'FILL',
  aspectRatio: 'TALL',
  imageType: 'PRIMARY',
  showTitles: false,
  useSeries: true,
  episodeContentScale: 'FILL',
  episodeAspectRatio: 'TALL',
  episodeImageType: 'PRIMARY',
})

export const viewOptions = (o: Partial<HomeRowViewOptions> = {}): HomeRowViewOptions => ({ ...DEFAULT_VIEW_OPTIONS, ...o })

/** `HomeRowViewOptions.genreDefault`. */
export const GENRE_VIEW_OPTIONS: Readonly<HomeRowViewOptions> = Object.freeze(viewOptions({ heightDp: CARD_HEIGHT.episode, aspectRatio: 'WIDE' }))
/** `HomeRowViewOptions.liveTvDefault`. */
export const LIVE_TV_VIEW_OPTIONS: Readonly<HomeRowViewOptions> = Object.freeze(
  viewOptions({ heightDp: CARD_HEIGHT.liveTv, aspectRatio: 'WIDE', contentScale: 'FIT' }),
)

export type SortAndDirection = { sort: ItemSortBy; direction: SortOrder }
export type KeyValueEntry = { key: string; value: string }

/** `HomeGetItemsFilter`; `minPremiereDate`/`maxPremiereDate` are kept but (as upstream) not sent. */
export type HomeGetItemsFilter = {
  sortBy?: ItemSortBy[]
  sortOrder?: SortOrder[]
  ids?: string[]
  minCommunityRating?: number
  minCriticRating?: number
  recursive?: boolean
  searchTerm?: string
  parentId?: string
  includeItemTypes?: BaseItemKind[]
  isFavorite?: boolean
  isPlayed?: boolean
  officialRatings?: string[]
  tags?: string[]
  years?: number[]
  personIds?: string[]
  minOfficialRating?: string
  hasOfficialRating?: boolean
  studioIds?: string[]
  genreIds?: string[]
  minPremiereDate?: string
  maxPremiereDate?: string
}

type WithView = { viewOptions: HomeRowViewOptions }

export type HomeRowConfig =
  | ({ type: 'ContinueWatching' } & WithView)
  | ({ type: 'NextUp' } & WithView)
  | ({ type: 'ContinueWatchingCombined' } & WithView)
  | ({ type: 'RecentlyAdded'; parentId: string } & WithView)
  | ({ type: 'RecentlyReleased'; parentId: string } & WithView)
  | ({ type: 'Genres'; parentId: string } & WithView)
  | ({ type: 'Studios'; parentId: string } & WithView)
  | ({ type: 'Favorite'; kind: BaseItemKind } & WithView)
  | ({ type: 'Recordings' } & WithView)
  | ({ type: 'TvPrograms' } & WithView)
  | ({ type: 'TvChannels' } & WithView)
  | ({ type: 'Suggestions'; parentId: string } & WithView)
  | ({ type: 'ByParent'; parentId: string; recursive: boolean; sort: SortAndDirection | null } & WithView)
  | ({ type: 'GetItems'; name: string; filter: HomeGetItemsFilter } & WithView)
  | ({
      type: 'CustomEndpoint'
      endpoint: string
      title: string
      headers: KeyValueEntry[] | null
      query: KeyValueEntry[] | null
    } & WithView)

export type HomeRowType = HomeRowConfig['type']

export const HOME_ROW_TYPES: readonly HomeRowType[] = [
  'ContinueWatching',
  'NextUp',
  'ContinueWatchingCombined',
  'RecentlyAdded',
  'RecentlyReleased',
  'Genres',
  'Studios',
  'Favorite',
  'Recordings',
  'TvPrograms',
  'TvChannels',
  'Suggestions',
  'ByParent',
  'GetItems',
  'CustomEndpoint',
]

/** The class default of `viewOptions` per row type (Genres/Studios: genre, TV rows: live TV). */
export function defaultViewOptionsFor(type: HomeRowType): HomeRowViewOptions {
  switch (type) {
    case 'Genres':
    case 'Studios':
      return { ...GENRE_VIEW_OPTIONS }
    case 'TvPrograms':
    case 'TvChannels':
      return { ...LIVE_TV_VIEW_OPTIONS }
    default:
      return { ...DEFAULT_VIEW_OPTIONS }
  }
}

/** `HomePageSettings`. */
export type HomePageSettings = { rows: HomeRowConfig[]; version: number }

export const SUPPORTED_HOME_PAGE_SETTINGS_VERSION = 1

export class UnsupportedHomeSettingsVersionError extends Error {
  readonly unsupportedVersion: number | null
  constructor(version: number | null) {
    super(`Unsupported version ${version}, max supported is ${SUPPORTED_HOME_PAGE_SETTINGS_VERSION}`)
    this.unsupportedVersion = version
  }
}

/** Whether a row is a "watching" row (ContinueWatching / NextUp / combined). */
export const isWatchingRow = (c: HomeRowConfig) => c.type === 'ContinueWatching' || c.type === 'NextUp' || c.type === 'ContinueWatchingCombined'

// ---------------------------------------------------------------------------------------------
// Decoding (lenient: unknown keys ignored, unknown/invalid rows skipped)

type Json = Record<string, unknown>

class InvalidRow extends Error {}

const isObj = (v: unknown): v is Json => typeof v === 'object' && v != null && !Array.isArray(v)

function str(o: Json, k: string, required = true): string | undefined {
  const v = o[k]
  if (typeof v === 'string') return v
  if (v == null && !required) return undefined
  throw new InvalidRow(k)
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  if (v === undefined) return fallback
  if (typeof v === 'string' && (allowed as readonly string[]).includes(v)) return v as T
  throw new InvalidRow(String(v))
}

function num(v: unknown, fallback: number): number {
  if (v === undefined) return fallback
  if (typeof v === 'number' && Number.isFinite(v)) return Math.trunc(v)
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Math.trunc(Number(v))
  throw new InvalidRow('number')
}

function bool(v: unknown, fallback: boolean): boolean {
  if (v === undefined) return fallback
  if (typeof v === 'boolean') return v
  if (v === 'true' || v === 'false') return v === 'true'
  throw new InvalidRow('boolean')
}

export function decodeViewOptions(v: unknown, type: HomeRowType): HomeRowViewOptions {
  if (v === undefined || v === null) return defaultViewOptionsFor(type)
  if (!isObj(v)) throw new InvalidRow('viewOptions')
  const d = DEFAULT_VIEW_OPTIONS
  return {
    heightDp: num(v.heightDp, d.heightDp),
    spacing: num(v.spacing, d.spacing),
    contentScale: oneOf(v.contentScale, CONTENT_SCALES, d.contentScale),
    aspectRatio: oneOf(v.aspectRatio, ASPECT_RATIOS, d.aspectRatio),
    imageType: oneOf(v.imageType, VIEW_IMAGE_TYPES, d.imageType),
    showTitles: bool(v.showTitles, d.showTitles),
    useSeries: bool(v.useSeries, d.useSeries),
    episodeContentScale: oneOf(v.episodeContentScale, CONTENT_SCALES, d.episodeContentScale),
    episodeAspectRatio: oneOf(v.episodeAspectRatio, ASPECT_RATIOS, d.episodeAspectRatio),
    episodeImageType: oneOf(v.episodeImageType, VIEW_IMAGE_TYPES, d.episodeImageType),
  }
}

function keyValues(v: unknown): KeyValueEntry[] | null {
  if (v == null) return null
  if (!Array.isArray(v)) throw new InvalidRow('entries')
  return v.map((e) => {
    if (!isObj(e) || typeof e.key !== 'string' || typeof e.value !== 'string') throw new InvalidRow('entry')
    return { key: e.key, value: e.value }
  })
}

function decodeFilter(v: unknown): HomeGetItemsFilter {
  if (!isObj(v)) throw new InvalidRow('filter')
  const out: HomeGetItemsFilter = {}
  const strArr = (x: unknown) => (Array.isArray(x) && x.every((s) => typeof s === 'string') ? (x as string[]) : undefined)
  const assign = <K extends keyof HomeGetItemsFilter>(k: K, val: HomeGetItemsFilter[K] | undefined) => {
    if (val !== undefined) out[k] = val
  }
  assign('sortBy', strArr(v.sortBy) as ItemSortBy[] | undefined)
  assign('sortOrder', strArr(v.sortOrder) as SortOrder[] | undefined)
  assign('ids', strArr(v.ids))
  assign('minCommunityRating', typeof v.minCommunityRating === 'number' ? v.minCommunityRating : undefined)
  assign('minCriticRating', typeof v.minCriticRating === 'number' ? v.minCriticRating : undefined)
  assign('recursive', typeof v.recursive === 'boolean' ? v.recursive : undefined)
  assign('searchTerm', typeof v.searchTerm === 'string' ? v.searchTerm : undefined)
  assign('parentId', typeof v.parentId === 'string' ? v.parentId : undefined)
  assign('includeItemTypes', strArr(v.includeItemTypes) as BaseItemKind[] | undefined)
  assign('isFavorite', typeof v.isFavorite === 'boolean' ? v.isFavorite : undefined)
  assign('isPlayed', typeof v.isPlayed === 'boolean' ? v.isPlayed : undefined)
  assign('officialRatings', strArr(v.officialRatings))
  assign('tags', strArr(v.tags))
  assign('years', Array.isArray(v.years) && v.years.every((y) => typeof y === 'number') ? (v.years as number[]) : undefined)
  assign('personIds', strArr(v.personIds))
  assign('minOfficialRating', typeof v.minOfficialRating === 'string' ? v.minOfficialRating : undefined)
  assign('hasOfficialRating', typeof v.hasOfficialRating === 'boolean' ? v.hasOfficialRating : undefined)
  assign('studioIds', strArr(v.studioIds))
  assign('genreIds', strArr(v.genreIds))
  assign('minPremiereDate', typeof v.minPremiereDate === 'string' ? v.minPremiereDate : undefined)
  assign('maxPremiereDate', typeof v.maxPremiereDate === 'string' ? v.maxPremiereDate : undefined)
  return out
}

/** One row; throws for an unknown type or a malformed row. */
export function decodeRow(v: unknown): HomeRowConfig {
  if (!isObj(v)) throw new InvalidRow('row')
  const type = v.type as HomeRowType
  if (!HOME_ROW_TYPES.includes(type)) throw new InvalidRow(`type ${String(v.type)}`)
  const viewOptions = decodeViewOptions(v.viewOptions, type)
  switch (type) {
    case 'ContinueWatching':
    case 'NextUp':
    case 'ContinueWatchingCombined':
    case 'Recordings':
    case 'TvPrograms':
    case 'TvChannels':
      return { type, viewOptions }
    case 'RecentlyAdded':
    case 'RecentlyReleased':
    case 'Genres':
    case 'Studios':
    case 'Suggestions':
      return { type, parentId: str(v, 'parentId')!, viewOptions }
    case 'Favorite':
      return { type, kind: str(v, 'kind') as BaseItemKind, viewOptions }
    case 'ByParent': {
      let sort: SortAndDirection | null = null
      if (v.sort != null) {
        if (!isObj(v.sort) || typeof v.sort.sort !== 'string' || typeof v.sort.direction !== 'string') throw new InvalidRow('sort')
        sort = { sort: v.sort.sort as ItemSortBy, direction: v.sort.direction as SortOrder }
      }
      return { type, parentId: str(v, 'parentId')!, recursive: bool(v.recursive, false), sort, viewOptions }
    }
    case 'GetItems':
      return { type, name: str(v, 'name')!, filter: decodeFilter(v.filter), viewOptions }
    case 'CustomEndpoint':
      return {
        type,
        endpoint: str(v, 'endpoint')!,
        title: str(v, 'title')!,
        headers: keyValues(v.headers),
        query: keyValues(v.query),
        viewOptions,
      }
  }
}

/** Lenient JSON parse: tolerates trailing commas like upstream's `allowTrailingComma`. */
export function parseLenientJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return JSON.parse(text.replace(/,\s*([}\]])/g, '$1'))
  }
}

/**
 * `HomeSettingsService.decode`: version missing or newer -> UnsupportedHomeSettingsVersionError;
 * rows that fail to decode are skipped individually.
 */
export function decodeHomePageSettings(input: unknown): HomePageSettings {
  const root = typeof input === 'string' ? parseLenientJson(input) : input
  if (!isObj(root)) throw new UnsupportedHomeSettingsVersionError(null)
  const version = typeof root.version === 'number' ? Math.trunc(root.version) : null
  if (version == null || version > SUPPORTED_HOME_PAGE_SETTINGS_VERSION) throw new UnsupportedHomeSettingsVersionError(version)
  const rows: HomeRowConfig[] = []
  for (const r of Array.isArray(root.rows) ? root.rows : []) {
    try {
      rows.push(decodeRow(r))
    } catch {
      // upstream logs "Unknown row" and skips it
    }
  }
  return { rows, version }
}

// ---------------------------------------------------------------------------------------------
// Encoding (encodeDefaults = false)

export function encodeViewOptions(o: HomeRowViewOptions): Json {
  const out: Json = {}
  for (const k of Object.keys(DEFAULT_VIEW_OPTIONS) as (keyof HomeRowViewOptions)[]) {
    if (o[k] !== DEFAULT_VIEW_OPTIONS[k]) out[k] = o[k]
  }
  return out
}

function sameViewOptions(a: HomeRowViewOptions, b: HomeRowViewOptions): boolean {
  return (Object.keys(DEFAULT_VIEW_OPTIONS) as (keyof HomeRowViewOptions)[]).every((k) => a[k] === b[k])
}

export function encodeRow(c: HomeRowConfig): Json {
  const out: Json = { type: c.type }
  switch (c.type) {
    case 'RecentlyAdded':
    case 'RecentlyReleased':
    case 'Genres':
    case 'Studios':
    case 'Suggestions':
      out.parentId = dashedId(c.parentId)
      break
    case 'Favorite':
      out.kind = c.kind
      break
    case 'ByParent':
      out.parentId = dashedId(c.parentId)
      if (c.recursive) out.recursive = true
      if (c.sort) out.sort = { sort: c.sort.sort, direction: c.sort.direction }
      break
    case 'GetItems':
      out.name = c.name
      out.filter = { ...c.filter }
      break
    case 'CustomEndpoint':
      out.endpoint = c.endpoint
      out.title = c.title
      if (c.headers) out.headers = c.headers
      if (c.query) out.query = c.query
      break
    default:
      break
  }
  if (!sameViewOptions(c.viewOptions, defaultViewOptionsFor(c.type))) out.viewOptions = encodeViewOptions(c.viewOptions)
  return out
}

export function encodeHomePageSettings(s: HomePageSettings): string {
  return JSON.stringify({ rows: s.rows.map(encodeRow), version: s.version })
}

/** Stable identity of a row's data request (view options do not change what is fetched). */
export function rowDataKey(c: HomeRowConfig): string {
  const { viewOptions: _ignored, ...rest } = c
  return JSON.stringify(rest)
}
