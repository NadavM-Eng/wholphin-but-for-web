import type { BaseItemDto, ImageType } from '@jellyfin/sdk/lib/generated-client/models'
import { useCallback, useSyncExternalStore } from 'react'
import { getItemImageUrl, imagePx } from '../../api/images'
import { useSessionStore } from '../../stores/session'
import { useDp } from '../../theme/scale'

export type ImageRequestOptions = {
  /** Requested box in dp (authored sizes) ... */
  widthDp?: number | null
  heightDp?: number | null
  /** ... or in measured CSS pixels (grid cells). */
  widthCss?: number | null
  heightCss?: number | null
  /** `useSeriesForPrimary`: episodes/seasons use the series' image (default true, as upstream rows). */
  useSeries?: boolean
}

/** Builds an item image URL with upstream's selection rules and bucketed device-pixel sizes. */
export type ImageResolver = (item: BaseItemDto | null | undefined, type: ImageType, opts?: ImageRequestOptions) => string | null

function subscribeDpr(cb: () => void) {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {}
  const mq = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`)
  mq.addEventListener('change', cb)
  return () => mq.removeEventListener('change', cb)
}
const getDpr = () => (typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1)

/**
 * `ImageResolver` bound to the current server, interface scale and devicePixelRatio; components that
 * use it re-render when any of them changes. Like upstream, only `fillHeight`/`fillWidth` are sent
 * (no max sizes) with quality 96 and the image tag.
 */
export function useImageResolver(): ImageResolver {
  const dp = useDp()
  const scale = dp(1)
  const dpr = useSyncExternalStore(subscribeDpr, getDpr, () => 1)
  const baseUrl = useSessionStore((s) => s.current?.api.basePath ?? null)
  return useCallback<ImageResolver>(
    (item, type, opts = {}) => {
      const url = getItemImageUrl(baseUrl, item, type, {
        fillWidth: opts.widthCss != null ? imagePx(opts.widthCss, 'css', scale, dpr) : imagePx(opts.widthDp, 'dp', scale, dpr),
        fillHeight: opts.heightCss != null ? imagePx(opts.heightCss, 'css', scale, dpr) : imagePx(opts.heightDp, 'dp', scale, dpr),
        useSeriesForPrimary: opts.useSeries,
      })
      return url && knownMissing(item, url) ? null : url
    },
    [baseUrl, scale, dpr],
  )
}

/**
 * True when `url` asks for one of the item's own images that its payload says it does not have
 * (ImageTags present without that type). Upstream requests it anyway and shows the fallback on the
 * 404; skipping the request gives the same card without the failed request.
 */
function knownMissing(item: BaseItemDto | null | undefined, url: string): boolean {
  if (!item?.Id || !item.ImageTags) return false
  const m = /\/Items\/([^/]+)\/Images\/([^/?]+)\?/.exec(url)
  if (!m || m[1] !== item.Id || m[2] === 'Backdrop') return false
  return !(m[2] in item.ImageTags) && !/[?&]tag=/.test(url)
}
