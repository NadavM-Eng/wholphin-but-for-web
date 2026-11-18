import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models'
import { create } from 'zustand'

/**
 * Backdrop requests (upstream W/services/BackdropService.kt). Pages call submitBackdrop(item) when an
 * item gains focus/hover or a detail page opens, and clearBackdrop() when nothing should show.
 * The shell (src/app/shell) owns everything after the request: the 500 ms settle delay, choosing the
 * image, color extraction and drawing. These exports are the contract; keep their signatures.
 */
export interface BackdropUrlSource {
  /** stable id of what is shown, e.g. `discover_<id>` (BackdropService.submit(DiscoverItem)) */
  key: string
  imageUrl: string | null
}

interface BackdropRequestState {
  /** The item most recently requested, or null for "no backdrop". */
  item: BaseItemDto | null
  /** Set instead of `item` for a backdrop that is not a Jellyfin item (submitBackdropUrl). */
  source?: BackdropUrlSource | null
  /** Increments on every request so identical consecutive items still re-trigger. */
  seq: number
}

export const useBackdropRequest = create<BackdropRequestState>(() => ({ item: null, seq: 0 }))

export function submitBackdrop(item: BaseItemDto | null | undefined): void {
  useBackdropRequest.setState((s) => ({ item: item ?? null, source: null, seq: s.seq + 1 }))
}

/**
 * BackdropService.submit(itemId, imageUrl) / submit(DiscoverItem): a backdrop given by URL, for things that
 * are not Jellyfin items (Seerr results: key `discover_<id>`, url = the item's backdrop URL).
 */
export function submitBackdropUrl(key: string, imageUrl: string | null): void {
  useBackdropRequest.setState((s) => ({ item: null, source: { key, imageUrl }, seq: s.seq + 1 }))
}

export function clearBackdrop(): void {
  submitBackdrop(null)
}
