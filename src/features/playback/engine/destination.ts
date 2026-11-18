// Route parameters (src/app/nav.ts `nav.play` / `nav.playList`) -> PlaybackDestination.
import type { ItemSortBy } from '@jellyfin/sdk/lib/generated-client/models'
import { parseQueueFilter } from './queue'
import type { PlaybackDestination } from './types'

const flag = (v: string | null) => v === '1' || v === 'true'

export function destinationFromRoute(kind: 'item' | 'list', itemId: string, search: URLSearchParams): PlaybackDestination {
  if (kind === 'item') {
    const t = Number(search.get('t') ?? 0)
    return {
      kind: 'item',
      itemId,
      positionMs: Number.isFinite(t) && t > 0 ? t : 0,
      forceTranscode: flag(search.get('transcode')),
      shuffle: flag(search.get('shuffle')),
    }
  }
  const index = Number(search.get('index') ?? 0)
  const sort = search.get('sort')
  return {
    kind: 'list',
    itemId,
    startIndex: Number.isFinite(index) && index > 0 ? index : 0,
    shuffle: flag(search.get('shuffle')),
    recursive: flag(search.get('recursive')),
    sort: sort ? { sort: sort as ItemSortBy, direction: search.get('order') === 'desc' ? 'Descending' : 'Ascending' } : null,
    filter: parseQueueFilter(search.get('filter')),
  }
}

const sameId = (a: string | null, b: string | null) => a != null && b != null && a.replace(/-/g, '').toLowerCase() === b.replace(/-/g, '').toLowerCase()

/**
 * Web only: the `/play/:itemId` address follows the queue. When the media entry that was playing is the one the
 * address names and the queue moves on (Next Up, Next, Previous), returns the id the address should name now, so a
 * reload or a shared link continues that episode; null when the address stays.
 */
export function routeFollowTarget(wasPlaying: string | null, nowPlaying: string | null, routeId: string): string | null {
  if (!nowPlaying || !sameId(wasPlaying, routeId) || sameId(nowPlaying, routeId)) return null
  return nowPlaying
}
