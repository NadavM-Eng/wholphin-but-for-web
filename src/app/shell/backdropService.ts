// W/services/BackdropService.kt for the web: turns requests from ../backdrop (submitBackdrop/clearBackdrop)
// into the published backdrop state the renderer draws.
//
// Not a debounce: a request whose URL differs from the published one blanks the image IMMEDIATELY
// (keeping the old colours), waits a fixed 500 ms, extracts colours (dynamic style only) and then
// publishes only if no newer request replaced its item id in the meantime.
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models'
import { useEffect } from 'react'
import { create } from 'zustand'
import { itemImageUrl } from '../../api/images'
import { getPref } from '../../stores/preferences'
import { useSessionStore, userKey } from '../../stores/session'
import { clearBackdrop, useBackdropRequest, type BackdropUrlSource } from '../backdrop'
import type { BackdropColors } from './backdropColors'
import { extractBackdropColors } from './extractColors'

export interface BackdropResult {
  itemId: string | null
  imageUrl: string | null
  /** null = Color.Unspecified for all three: no colour layer */
  colors: BackdropColors | null
}

export const BACKDROP_NONE: BackdropResult = { itemId: null, imageUrl: null, colors: null }

/** BackdropService.kt: `delay(500)` before extracting/publishing. */
export const BACKDROP_DELAY_MS = 500

export const useBackdropResult = create<BackdropResult>()(() => BACKDROP_NONE)

/**
 * Number of submits still inside their 500 ms wait. The renderer exposes it as aria-busy so automated
 * checks (the screenshot crawler's settle) do not mistake the blank interval for the final picture.
 */
export const useBackdropPending = create<{ count: number }>()(() => ({ count: 0 }))
const pending = (d: number) => useBackdropPending.setState((s) => ({ count: Math.max(0, s.count + d) }))

/**
 * How a page-owned backdrop is drawn. The defaults are the arguments of upstream's only call of that overload
 * (NowPlayingPage.kt:173-180): enableTopScrim = false, useExistingImageAsPlaceholder = true,
 * crossfadeDuration = 1.5 s.
 */
export interface PageBackdropOptions {
  /** The 55% black scrim over the top quarter of the image (ApplicationContent's pages have it). */
  topScrim?: boolean
  /** Keep the image shown last on screen while the next one loads, then cross-fade (instead of blanking first). */
  keepPrevious?: boolean
  crossfadeMs?: number
}

const PAGE_BACKDROP_DEFAULTS: Required<PageBackdropOptions> = { topScrim: false, keepPrevious: true, crossfadeMs: 1500 }

/** A page-owned result shown instead of the published one (see usePageBackdrop). */
export const usePageBackdropStore = create<{ result: BackdropResult | null } & Required<PageBackdropOptions>>()(() => ({
  result: null,
  ...PAGE_BACKDROP_DEFAULTS,
}))

/**
 * Backdrop.kt's `Backdrop(backdrop: BackdropResult)` overload (NowPlayingPage.kt:173): while the calling
 * page is mounted and `result` is not null, the layout draws this result instead of the service's, with
 * `options` (default: as Now Playing upstream, see PageBackdropOptions).
 */
export function usePageBackdrop(result: BackdropResult | null, options?: PageBackdropOptions) {
  const topScrim = options?.topScrim ?? PAGE_BACKDROP_DEFAULTS.topScrim
  const keepPrevious = options?.keepPrevious ?? PAGE_BACKDROP_DEFAULTS.keepPrevious
  const crossfadeMs = options?.crossfadeMs ?? PAGE_BACKDROP_DEFAULTS.crossfadeMs
  useEffect(() => {
    usePageBackdropStore.setState({ result, topScrim, keepPrevious, crossfadeMs })
  }, [result, topScrim, keepPrevious, crossfadeMs])
  useEffect(() => () => usePageBackdropStore.setState({ result: null, ...PAGE_BACKDROP_DEFAULTS }), [])
}

/**
 * Image URL rules (BackdropService.submit + ImageUrlService): the item's Backdrop (series backdrop for
 * episodes/seasons), sized to the 70%-of-the-window box the renderer draws. Genre items upstream use an
 * `imageUrlOverride` that the web DTO does not carry, so they follow the same rule (usually no image).
 */
export function backdropUrlFor(item: BaseItemDto): string | null {
  const width = typeof window === 'undefined' ? 1280 : Math.max(320, window.innerWidth * 0.7)
  return itemImageUrl(item, 'Backdrop', { width, unit: 'css' })
}

/**
 * The image the colours are taken from: the backdrop as stored, upstream's exact request
 * (ImageUrlService.getItemImageUrl(item, BACKDROP): quality and tag, no size; the server then sends the
 * original file). The window-sized rendition drawn on screen is a different JPEG and the palette is sensitive
 * to that: on the test server it turned the top corners of "Tears of Steel" from (48,160,208) into
 * (8,128,176) and the bottom corner of "Agent 327" from (40,56,88) into (160,72,64). The TV colours
 * (refshots 03-nav-drawer-*, 33-themes-home-*) are the ones of the original.
 */
export function backdropColorSourceFor(item: BaseItemDto): string | null {
  return itemImageUrl(item, 'Backdrop')
}

const isDynamic = () => getPref('backdropStyle') !== 'BACKDROP_IMAGE_ONLY' && getPref('backdropStyle') !== 'BACKDROP_NONE'

async function submit(itemId: string, imageUrl: string | null, colorSource: string | null = imageUrl) {
  const cur = useBackdropResult.getState()
  if (cur.imageUrl === imageUrl && imageUrl != null) return
  useBackdropResult.setState({ itemId, imageUrl: null })
  pending(1)
  let colors: BackdropColors | null | undefined
  try {
    await new Promise((r) => setTimeout(r, BACKDROP_DELAY_MS))
    // undefined = no URL: keep the previous colours; null = failed/disabled: Unspecified
    colors = isDynamic() ? await extractBackdropColors(imageUrl ? colorSource : null) : null
  } finally {
    pending(-1)
  }
  const now = useBackdropResult.getState()
  if (now.itemId !== itemId) return
  useBackdropResult.setState({ itemId, imageUrl, colors: colors === undefined ? now.colors : colors })
}

let started = false

/** Starts listening to backdrop requests and session changes. Idempotent. */
export function startBackdropService() {
  if (started) return
  started = true
  let lastSeq = useBackdropRequest.getState().seq
  const handle = (item: BaseItemDto | null, source?: BackdropUrlSource | null) => {
    if (source) {
      void submit(source.key, source.imageUrl)
      return
    }
    if (!item?.Id) {
      useBackdropResult.setState(BACKDROP_NONE)
      return
    }
    void submit(item.Id, backdropUrlFor(item), backdropColorSourceFor(item))
  }
  if (lastSeq > 0) handle(useBackdropRequest.getState().item, useBackdropRequest.getState().source)
  useBackdropRequest.subscribe((s) => {
    if (s.seq === lastSeq) return
    lastSeq = s.seq
    handle(s.item, s.source)
  })
  // SetupDestination.AppContent clears the backdrop on entry: do it whenever the signed-in user changes.
  const who = () => {
    const c = useSessionStore.getState().current
    return c ? userKey(c.server.id, c.user.id) : null
  }
  let lastUser = who()
  useSessionStore.subscribe(() => {
    const u = who()
    if (u === lastUser) return
    lastUser = u
    clearBackdrop()
  })
}
