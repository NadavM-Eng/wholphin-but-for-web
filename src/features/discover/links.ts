// Path builders for the Discover routes. They extend the nav.* base paths with Discover's own query
// parameters, so src/app/nav.ts stays untouched.
import { nav } from '../../app/nav'
import { toast } from '../../app/toast'
import {
  encodeFilter,
  jellyfinIdOf,
  jellyfinIdString,
  REQUEST_TYPE_SLUG,
  SEERR_PAGE_SIZE,
  type DiscoverFilter,
  type DiscoverItem,
  type DiscoverRequestType,
  type MediaInfo,
} from '../../api/seerr'

function withQuery(path: string, q: Record<string, string | number | null | undefined>): string {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(q)) if (v != null && v !== '') p.set(k, String(v))
  const s = p.toString()
  return s ? `${path}?${s}` : path
}

/** `Destination.DiscoveredItem(item, startIndex)`: the Seerr detail page (person name rides along for the title). */
export function discoveredItemHref(item: Pick<DiscoverItem, 'type' | 'id' | 'title'>, startIndex = 0): string {
  const base = nav.discoverItem(item.type, item.id)
  return item.type === 'person' ? withQuery(base, { name: item.title, start: startIndex || null }) : base
}

/** Jellyfin page for a library item (`Destination.MediaItem` with MOVIE / SERIES / PERSON). */
export function jellyfinHref(type: DiscoverItem['type'], jellyfinId: string): string {
  return type === 'tv' ? nav.series(jellyfinId) : nav.item(jellyfinId)
}

/** `DiscoverItem.destination`: the Jellyfin page when the title is in the library, else the Seerr page. */
export function itemDestinationHref(item: DiscoverItem): string {
  if (item.jellyfinItemId && item.type !== 'unknown') return jellyfinHref(item.type, item.jellyfinItemId)
  return discoveredItemHref(item)
}

/** `Destination.DiscoverMoreResult(type, startIndex = SEERR_PAGE_SIZE, initialFilter, titleOverride)`. */
export function discoverMoreHref(
  type: DiscoverRequestType,
  opts: {
    startIndex?: number
    filter?: DiscoverFilter
    title?: string | null
  } = {},
): string {
  const start = opts.startIndex ?? SEERR_PAGE_SIZE
  return withQuery(nav.discoverMore(REQUEST_TYPE_SLUG[type]), {
    start: start || null,
    f: opts.filter ? encodeFilter(opts.filter) : null,
    title: opts.title,
  })
}

/**
 * `goToButtonDiscover`: the Jellyfin path for "Go to", or null after the upstream error toast
 * ("No Jellyfin ID found" / "Unknown Jellyfin ID: x").
 */
export function goToJellyfinHref(
  mediaInfo: MediaInfo | null | undefined,
  type: 'movie' | 'tv',
  t: (k: string, o?: Record<string, unknown>) => string,
): string | null {
  const id = jellyfinIdOf(mediaInfo)
  if (id) return jellyfinHref(type, id)
  const raw = jellyfinIdString(mediaInfo)
  toast(raw ? t('web_seerr_unknown_jellyfin_id', { p1: raw }) : t('web_seerr_no_jellyfin_id'))
  return null
}
