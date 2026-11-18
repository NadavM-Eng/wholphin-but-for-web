// Port of W/services/ImageUrlService.kt (spec 07 §7). URLs are built by hand (image routes are anonymous,
// no token is added), so they work in <img src> and stay cache-friendly thanks to `tag`.
import type { BaseItemDto, BaseItemPerson, ImageType } from '@jellyfin/sdk/lib/generated-client/models'
import { useSyncExternalStore } from 'react'
import { sameId } from '../lib/ids'
import { useSessionStore } from '../stores/session'
import { getScale, useDp } from '../theme/scale'

export type { ImageType } from '@jellyfin/sdk/lib/generated-client/models'

/** `QUALITY` constant (ImageUrlService.kt). */
export const IMAGE_QUALITY = 96

export interface ImageUrlParams {
  maxWidth?: number | null
  maxHeight?: number | null
  width?: number | null
  height?: number | null
  quality?: number | null
  fillWidth?: number | null
  fillHeight?: number | null
  tag?: string | null
  format?: string | null
  percentPlayed?: number | null
  unplayedCount?: number | null
  blur?: number | null
  backgroundColor?: string | null
  foregroundLayer?: string | null
  imageIndex?: number | null
}

/**
 * Low-level `getItemImageUrl(itemId, imageType, ...)`: `{base}/Items/{id}/Images/{type}[/{index}]?…`.
 * Only non-null params are emitted; width/height/fill* only when > 0. Returns null without a base URL.
 */
export function buildItemImageUrl(
  baseUrl: string | null | undefined,
  itemId: string,
  imageType: ImageType,
  params: ImageUrlParams = {},
): string | null {
  if (!baseUrl?.trim()) return null
  const { imageIndex, quality = IMAGE_QUALITY, ...rest } = params
  const q = new URLSearchParams()
  const positive = (v: number | null | undefined) => (v != null && v > 0 ? v : null)
  const entries: [string, string | number | null | undefined][] = [
    ['maxWidth', rest.maxWidth],
    ['maxHeight', rest.maxHeight],
    ['width', positive(rest.width)],
    ['height', positive(rest.height)],
    ['quality', quality],
    ['fillWidth', positive(rest.fillWidth)],
    ['fillHeight', positive(rest.fillHeight)],
    ['tag', rest.tag],
    ['format', rest.format],
    ['percentPlayed', rest.percentPlayed],
    ['unplayedCount', rest.unplayedCount],
    ['blur', rest.blur],
    ['backgroundColor', rest.backgroundColor],
    ['foregroundLayer', rest.foregroundLayer],
  ]
  for (const [k, v] of entries) if (v != null && v !== '') q.set(k, String(v))
  const base = baseUrl.replace(/\/+$/, '')
  const index = imageIndex != null ? `/${imageIndex}` : ''
  const qs = q.toString()
  return `${base}/Items/${encodeURIComponent(itemId)}/Images/${imageType}${index}${qs ? `?${qs}` : ''}`
}

/** The DTO fields the selection rules read. */
export type ImageItem = Pick<
  BaseItemDto,
  | 'Id'
  | 'Type'
  | 'SeriesId'
  | 'ImageTags'
  | 'BackdropImageTags'
  | 'ParentThumbItemId'
  | 'ParentThumbImageTag'
  | 'ParentBackdropItemId'
  | 'ParentBackdropImageTags'
  | 'SeriesPrimaryImageTag'
  | 'ParentLogoItemId'
  | 'ParentLogoImageTag'
>

export interface ItemImageOptions {
  /** device pixels (already converted); see `imagePx` */
  fillWidth?: number | null
  fillHeight?: number | null
  /** episode/season cards show the series image (BaseItem.useSeriesForPrimary, default true) */
  useSeriesForPrimary?: boolean
}

/**
 * Item -> image URL selection rules (ImageUrlService.getItemImageUrl, spec 07 §7.2), ported branch by branch.
 * Returns null when there is no image to request (e.g. a Backdrop for an item without backdrops).
 */
export function getItemImageUrl(
  baseUrl: string | null | undefined,
  item: ImageItem | null | undefined,
  imageType: ImageType,
  opts: ItemImageOptions = {},
): string | null {
  if (!item?.Id) return null
  const itemId = item.Id
  const type = item.Type
  const seriesId = item.SeriesId ?? null
  const useSeriesForPrimary = opts.useSeriesForPrimary ?? true
  const imageTags = item.ImageTags ?? {}
  const backdropTags = item.BackdropImageTags ?? []
  const parentThumbId = item.ParentThumbItemId ?? null
  const parentBackdropId = item.ParentBackdropItemId ?? null
  const parentBackdropTags = item.ParentBackdropImageTags ?? []
  const isEpOrSeason = type === 'Episode' || type === 'Season'
  const has = (t: ImageType) => t in imageTags
  const size = { fillWidth: opts.fillWidth, fillHeight: opts.fillHeight }
  const url = (id: string, t: ImageType, tag: string | null | undefined) =>
    buildItemImageUrl(baseUrl, id, t, { ...size, tag: tag ?? null })

  switch (imageType) {
    case 'Logo':
      if (seriesId != null && isEpOrSeason) {
        return url(seriesId, imageType, sameId(item.ParentLogoItemId, seriesId) ? item.ParentLogoImageTag : null)
      }
      return url(itemId, imageType, imageTags[imageType])

    case 'Backdrop':
      if (seriesId != null && isEpOrSeason) {
        return url(seriesId, imageType, sameId(parentBackdropId, seriesId) ? parentBackdropTags[0] : null)
      }
      if (backdropTags.length > 0) return url(itemId, imageType, backdropTags[0])
      return null

    case 'Thumb':
      if (useSeriesForPrimary && parentThumbId != null && isEpOrSeason) {
        return url(parentThumbId, imageType, item.ParentThumbImageTag)
      }
      if (useSeriesForPrimary && parentBackdropId != null && isEpOrSeason) {
        return url(parentBackdropId, 'Backdrop', parentBackdropTags[0])
      }
      if (parentThumbId != null && type === 'Season' && !has(imageType)) {
        return url(parentThumbId, imageType, item.ParentThumbImageTag)
      }
      if (useSeriesForPrimary && parentThumbId == null && type === 'Episode' && !has(imageType)) {
        return url(itemId, 'Primary', imageTags.Primary)
      }
      if (!has(imageType) && backdropTags.length > 0) return url(itemId, 'Backdrop', backdropTags[0])
      return url(itemId, imageType, imageTags[imageType])

    case 'Primary':
    case 'Banner':
      if (seriesId != null && ((useSeriesForPrimary && isEpOrSeason) || (type === 'Season' && !has(imageType)))) {
        if (imageType !== 'Primary') return url(seriesId, imageType, null)
        // The server sends SeriesPrimaryImageTag with every season and episode whose series has a primary image,
        // whatever fields and image types the request named. Without it the series has none (the series of a
        // Live TV recording) and the request is certain to answer 404: upstream sends it anyway
        // (ImageUrlService.kt:155-171, Coil swallows the failure); here the placeholder shows without it.
        return item.SeriesPrimaryImageTag ? url(seriesId, imageType, item.SeriesPrimaryImageTag) : null
      }
      return url(itemId, imageType, imageTags[imageType])

    default:
      return url(itemId, imageType, imageTags[imageType])
  }
}

/** `getUserImageUrl(userId)`: `{base}/UserImage?userId=` (10.9+). The tag (if known) busts the cache. */
export function getUserImageUrl(baseUrl: string | null | undefined, userId: string, tag?: string | null): string | null {
  if (!baseUrl?.trim()) return null
  const q = new URLSearchParams({ userId })
  if (tag) q.set('tag', tag)
  return `${baseUrl.replace(/\/+$/, '')}/UserImage?${q}`
}

/** Person image (Person.kt calls the SDK directly: Primary + tag, no quality/size). */
export function getPersonImageUrl(
  baseUrl: string | null | undefined,
  person: Pick<BaseItemPerson, 'Id' | 'PrimaryImageTag'>,
  /** Device-pixel box (see `imagePx`); without it the server sends the original file (often thousands of px). */
  size: { fillWidth?: number | null; fillHeight?: number | null } = {},
) {
  if (!person.Id) return null
  return buildItemImageUrl(baseUrl, person.Id, 'Primary', {
    quality: null,
    tag: person.PrimaryImageTag ?? null,
    fillWidth: size.fillWidth,
    fillHeight: size.fillHeight,
  })
}

/** Chapter thumbnail (ChapterCard.kt): `Chapter` image with index + tag. */
export function getChapterImageUrl(
  baseUrl: string | null | undefined,
  itemId: string,
  chapterIndex: number,
  tag: string | null | undefined,
  fillHeight?: number | null,
) {
  return buildItemImageUrl(baseUrl, itemId, 'Chapter', { imageIndex: chapterIndex, tag: tag ?? null, fillHeight })
}

// ---------------------------------------------------------------------------------------------
// Device-pixel sizing

/** Requested sizes snap up to these device-pixel buckets so the browser cache gets reused across layouts. */
export const IMAGE_BUCKETS = [64, 96, 128, 160, 200, 240, 280, 320, 400, 480, 560, 640, 800, 960, 1280, 1600, 1920, 2560, 3840] as const

export function bucketPx(px: number): number {
  for (const b of IMAGE_BUCKETS) if (px <= b) return b
  return IMAGE_BUCKETS[IMAGE_BUCKETS.length - 1]
}

/**
 * Converts a layout size to the device-pixel bucket to request.
 * `unit: 'dp'` (default) = authored px/dp, multiplied by the interface scale; `'css'` = measured CSS pixels.
 */
export function imagePx(
  size: number | null | undefined,
  unit: 'dp' | 'css' = 'dp',
  scale = getScale(),
  dpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1,
): number | null {
  if (!size || size <= 0) return null
  const css = unit === 'dp' ? size * scale : size
  return bucketPx(Math.ceil(css * dpr))
}

export interface ImageSizeOptions {
  width?: number | null
  height?: number | null
  /** 'dp' (default): authored sizes; 'css': measured element size */
  unit?: 'dp' | 'css'
  useSeriesForPrimary?: boolean
}

function currentBaseUrl(): string | null {
  return useSessionStore.getState().current?.api.basePath ?? null
}

/** Image URL for the current server with dp/css sizes converted to bucketed device pixels. */
export function itemImageUrl(
  item: ImageItem | null | undefined,
  imageType: ImageType,
  opts: ImageSizeOptions = {},
): string | null {
  return getItemImageUrl(currentBaseUrl(), item, imageType, {
    fillWidth: imagePx(opts.width, opts.unit),
    fillHeight: imagePx(opts.height, opts.unit),
    useSeriesForPrimary: opts.useSeriesForPrimary,
  })
}

function subscribeDpr(cb: () => void) {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {}
  const mq = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`)
  mq.addEventListener('change', cb)
  return () => mq.removeEventListener('change', cb)
}
const getDpr = () => (typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1)

/** React version of itemImageUrl that follows interface-scale, devicePixelRatio and server changes. */
export function useItemImageUrl(
  item: ImageItem | null | undefined,
  imageType: ImageType,
  opts: ImageSizeOptions = {},
): string | null {
  const dp = useDp()
  const dpr = useSyncExternalStore(subscribeDpr, getDpr, () => 1)
  const baseUrl = useSessionStore((s) => s.current?.api.basePath ?? null)
  const scale = dp(1)
  return getItemImageUrl(baseUrl, item, imageType, {
    fillWidth: imagePx(opts.width, opts.unit, scale, dpr),
    fillHeight: imagePx(opts.height, opts.unit, scale, dpr),
    useSeriesForPrimary: opts.useSeriesForPrimary,
  })
}

/** Avatar URL for a user on the current server. */
export function useUserImageUrl(userId: string | null | undefined, tag?: string | null): string | null {
  const baseUrl = useSessionStore((s) => s.current?.api.basePath ?? null)
  return userId ? getUserImageUrl(baseUrl, userId, tag) : null
}
