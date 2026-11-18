// Local persistence of the photo pages, keyed by server + user like upstream's Room tables:
// LibraryDisplayInfo (sort, filter, view options per folder; W/data/model/LibraryDisplayInfo.kt) and
// playback_effects (the slideshow colour filter per photo / per album; W/data/model/PlaybackEffect.kt).
import type { ItemSortBy, SortOrder } from '@jellyfin/sdk/lib/generated-client/models'
import { normalizeId } from '../../lib/ids'
import { readJson, writeJson } from '../../lib/storage'
import { useSessionStore } from '../../stores/session'
import type { AspectRatioName, ContentScale, ViewImageType } from '../common/viewOptions'
import { compactFilter, parseFilter, type PhotoFilter, type SortAndDirection } from './photoQuery'
import { normalizeFilter, type ImageFilter } from './slideshowModel'

function userScope(): string | null {
  const cur = useSessionStore.getState().current
  if (!cur) return null
  return `${normalizeId(cur.server.id)}:${normalizeId(cur.user.id)}`
}

// ---------------------------------------------------------------------------------------------
// View options (W/ui/components/ViewOptionsDialog.kt `ViewOptions`)

export type LayoutType = 'GRID' | 'LIST' | 'DENSE_LIST'

export interface ViewOptions {
  columns: number
  spacing: number
  contentScale: ContentScale
  aspectRatio: AspectRatioName
  showDetails: boolean
  showBackdrop: boolean
  imageType: ViewImageType
  showTitles: boolean
  type: LayoutType
}

/** `ViewOptionsWide`: the photo pages' defaults. */
export const VIEW_OPTIONS_WIDE: ViewOptions = {
  columns: 4,
  spacing: 24,
  contentScale: 'CROP',
  aspectRatio: 'WIDE',
  showDetails: false,
  showBackdrop: false,
  imageType: 'PRIMARY',
  showTitles: true,
  type: 'GRID',
}

const CONTENT_SCALES: readonly ContentScale[] = ['FIT', 'NONE', 'CROP', 'FILL', 'Fill_WIDTH', 'FILL_HEIGHT']
const ASPECTS: readonly AspectRatioName[] = ['TALL', 'WIDE', 'FOUR_THREE', 'SQUARE']
const LAYOUTS: readonly LayoutType[] = ['GRID', 'LIST', 'DENSE_LIST']

/** Reads JSON written by this app (unknown or invalid fields fall back to the defaults). */
export function normalizeViewOptions(v: unknown, defaults: ViewOptions = VIEW_OPTIONS_WIDE): ViewOptions {
  if (!v || typeof v !== 'object') return defaults
  const o = v as Record<string, unknown>
  const int = (x: unknown, lo: number, hi: number, d: number) =>
    typeof x === 'number' && Number.isFinite(x) ? Math.min(hi, Math.max(lo, Math.round(x))) : d
  const bool = (x: unknown, d: boolean) => (typeof x === 'boolean' ? x : d)
  const pick = <T extends string>(x: unknown, list: readonly T[], d: T) => (list.includes(x as T) ? (x as T) : d)
  return {
    columns: int(o.columns, 1, 12, defaults.columns),
    spacing: int(o.spacing, 0, 32, defaults.spacing),
    contentScale: pick(o.contentScale, CONTENT_SCALES, defaults.contentScale),
    aspectRatio: pick(o.aspectRatio, ASPECTS, defaults.aspectRatio),
    showDetails: bool(o.showDetails, defaults.showDetails),
    showBackdrop: bool(o.showBackdrop, defaults.showBackdrop),
    imageType: o.imageType === 'THUMB' ? 'THUMB' : o.imageType === 'PRIMARY' ? 'PRIMARY' : defaults.imageType,
    showTitles: bool(o.showTitles, defaults.showTitles),
    type: pick(o.type, LAYOUTS, defaults.type),
  }
}

/** Image type Primary sets the aspect ratio TALL, Thumb sets WIDE. */
export function withImageType(v: ViewOptions, imageType: ViewImageType): ViewOptions {
  return { ...v, imageType, aspectRatio: imageType === 'THUMB' ? 'WIDE' : 'TALL' }
}

/** Layout sets the spacing: Grid 16, List 4, Compact list 2. */
export function withLayout(v: ViewOptions, type: LayoutType): ViewOptions {
  return { ...v, type, spacing: type === 'GRID' ? 16 : type === 'LIST' ? 4 : 2 }
}

// ---------------------------------------------------------------------------------------------
// LibraryDisplayInfo

export interface DisplayInfo {
  sort: SortAndDirection | null
  filter: PhotoFilter | null
  viewOptions: ViewOptions | null
}

const displayKey = (scope: string) => `wholphin.photos.display.v1.${scope}`

type DisplayStore = Record<string, { sort?: string; direction?: string; filter?: unknown; viewOptions?: unknown }>

export function loadDisplayInfo(itemId: string): DisplayInfo {
  const scope = userScope()
  const empty: DisplayInfo = { sort: null, filter: null, viewOptions: null }
  if (!scope) return empty
  const row = readJson<DisplayStore>(displayKey(scope))?.[normalizeId(itemId)]
  if (!row) return empty
  return {
    sort:
      typeof row.sort === 'string'
        ? { sort: row.sort as ItemSortBy, direction: (row.direction === 'Descending' ? 'Descending' : 'Ascending') as SortOrder }
        : null,
    filter: row.filter != null ? parseFilter(JSON.stringify(row.filter)) : null,
    viewOptions: row.viewOptions != null ? normalizeViewOptions(row.viewOptions) : null,
  }
}

export function saveDisplayInfo(itemId: string, info: { sort: SortAndDirection; filter: PhotoFilter; viewOptions: ViewOptions | null }) {
  const scope = userScope()
  if (!scope) return
  const key = displayKey(scope)
  const store = readJson<DisplayStore>(key) ?? {}
  store[normalizeId(itemId)] = {
    sort: info.sort.sort,
    direction: info.sort.direction,
    filter: compactFilter(info.filter),
    viewOptions: info.viewOptions ?? undefined,
  }
  writeJson(key, store)
}

// ---------------------------------------------------------------------------------------------
// Colour filters (playback_effects: PHOTO per image, PHOTO_ALBUM per album)

export type EffectType = 'PHOTO' | 'PHOTO_ALBUM'

const effectsKey = (scope: string) => `wholphin.photos.effects.v1.${scope}`

export function loadImageFilter(itemId: string, type: EffectType): ImageFilter | null {
  const scope = userScope()
  if (!scope) return null
  const store = readJson<Record<string, unknown>>(effectsKey(scope))
  return normalizeFilter(store?.[`${type}:${normalizeId(itemId)}`])
}

export function saveImageFilter(itemId: string, type: EffectType, filter: ImageFilter): boolean {
  const scope = userScope()
  if (!scope) return false
  const key = effectsKey(scope)
  const store = readJson<Record<string, unknown>>(key) ?? {}
  store[`${type}:${normalizeId(itemId)}`] = filter
  writeJson(key, store)
  return true
}
