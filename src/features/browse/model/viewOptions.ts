// Library grid view options (W/ui/components/ViewOptionsDialog.kt `ViewOptions`). Field names and enum
// values follow the Kotlin serialization so the JSON matches what the TV app stores.
import type { BaseItemKind } from '@jellyfin/sdk/lib/generated-client/models'
import {
  ASPECT_RATIOS,
  CONTENT_SCALES,
  VIEW_IMAGE_TYPES,
  type AspectRatioName,
  type ContentScale,
  type ViewImageType,
} from '../../common/viewOptions'

export type ViewOptionsType = 'GRID' | 'LIST' | 'DENSE_LIST'
export const VIEW_OPTIONS_TYPES: readonly ViewOptionsType[] = ['GRID', 'LIST', 'DENSE_LIST']

export type ArtistSource = 'ARTIST' | 'ALBUM_ARTIST'

export type ViewOptions = {
  columns: number
  spacing: number
  contentScale: ContentScale
  aspectRatio: AspectRatioName
  showDetails: boolean
  showBackdrop: boolean
  imageType: ViewImageType
  showTitles: boolean
  type: ViewOptionsType
  /** `ViewOptionsExtras.MusicLibrary(artistSource)`; null = `None`. */
  artistSource: ArtistSource | null
}

/** `ViewOptions()` defaults. */
export const VIEW_OPTIONS_DEFAULT: Readonly<ViewOptions> = Object.freeze({
  columns: 6,
  spacing: 16,
  contentScale: 'FIT',
  aspectRatio: 'TALL',
  showDetails: false,
  showBackdrop: false,
  imageType: 'PRIMARY',
  showTitles: true,
  type: 'GRID',
  artistSource: null,
})

const vo = (o: Partial<ViewOptions>): ViewOptions => ({ ...VIEW_OPTIONS_DEFAULT, ...o })

export const VIEW_OPTIONS_POSTER: Readonly<ViewOptions> = Object.freeze(vo({ columns: 6, spacing: 16, contentScale: 'FILL' }))
export const VIEW_OPTIONS_WIDE: Readonly<ViewOptions> = Object.freeze(vo({ columns: 4, spacing: 24, contentScale: 'CROP', aspectRatio: 'WIDE' }))
export const VIEW_OPTIONS_SQUARE: Readonly<ViewOptions> = Object.freeze(vo({ columns: 6, spacing: 16, contentScale: 'FILL', aspectRatio: 'SQUARE' }))

/** `BaseItemKind.defaultViewOptions`. */
export function defaultViewOptionsForKind(kind: BaseItemKind): ViewOptions {
  switch (kind) {
    case 'Audio':
    case 'MusicAlbum':
    case 'MusicArtist':
    case 'Playlist':
      return { ...VIEW_OPTIONS_SQUARE }
    case 'Episode':
    case 'Video':
    case 'MusicVideo':
    case 'Photo':
    case 'PhotoAlbum':
    case 'TvChannel':
    case 'LiveTvChannel':
    case 'Program':
    case 'TvProgram':
    case 'LiveTvProgram':
      return { ...VIEW_OPTIONS_WIDE }
    default:
      return { ...VIEW_OPTIONS_POSTER }
  }
}

/** Image type setter: Primary => poster aspect, Thumb => 16:9. */
export function withImageType(o: ViewOptions, imageType: ViewImageType): ViewOptions {
  return { ...o, imageType, aspectRatio: imageType === 'THUMB' ? 'WIDE' : 'TALL' }
}

/** Layout setter: Grid 16, List 4, Compact list 2 spacing. */
export function withLayout(o: ViewOptions, type: ViewOptionsType): ViewOptions {
  return { ...o, type, spacing: type === 'GRID' ? 16 : type === 'LIST' ? 4 : 2 }
}

type Json = Record<string, unknown>

function pick<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback
}

function int(v: unknown, fallback: number, min: number, max: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.trunc(n))) : fallback
}

/** Lenient decode of a stored ViewOptions (unknown keys ignored, bad values defaulted). */
export function decodeViewOptions(v: unknown): ViewOptions | null {
  if (typeof v !== 'object' || v == null || Array.isArray(v)) return null
  const o = v as Json
  const d = VIEW_OPTIONS_DEFAULT
  const extras = o.extras as Json | undefined
  const artist = extras && typeof extras === 'object' ? extras.artistSource : o.artistSource
  return {
    columns: int(o.columns, d.columns, 1, 12),
    spacing: int(o.spacing, d.spacing, 0, 32),
    contentScale: pick(o.contentScale, CONTENT_SCALES, d.contentScale),
    aspectRatio: pick(o.aspectRatio, ASPECT_RATIOS, d.aspectRatio),
    showDetails: typeof o.showDetails === 'boolean' ? o.showDetails : d.showDetails,
    showBackdrop: typeof o.showBackdrop === 'boolean' ? o.showBackdrop : d.showBackdrop,
    imageType: pick(o.imageType, VIEW_IMAGE_TYPES, d.imageType),
    showTitles: typeof o.showTitles === 'boolean' ? o.showTitles : d.showTitles,
    type: pick(o.type, VIEW_OPTIONS_TYPES, d.type),
    artistSource: artist === 'ARTIST' || artist === 'ALBUM_ARTIST' ? artist : null,
  }
}
