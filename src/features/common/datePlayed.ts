// Port of W/services/DatePlayedService.kt: the "logical last played" time of a next-up episode, used to
// sort the combined Continue Watching + Next Up row.
import type { Api } from '@jellyfin/sdk'
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models'
import { getShowApi } from '@jellyfin/sdk/lib/utils/api/show-api'
import { normalizeId } from '../../lib/ids'

const TTL_MS = 2 * 60 * 60_000
/** `AppPreference.HomePageItems.max` (cache maximum size). */
const MAX_ENTRIES = 50

type Entry = { seriesId: string; at: number; value: Promise<number> }
const cache = new Map<string, Entry>()

function status(err: unknown): number | null {
  const s = (err as { response?: { status?: unknown } } | null)?.response?.status
  return typeof s === 'number' ? s : null
}

const toMs = (iso: string | null | undefined): number | null => {
  if (!iso) return null
  const ms = Date.parse(iso)
  return Number.isNaN(ms) ? null : ms
}

/**
 * Latest of the previous episode's last-played time and this episode's premiere date
 * (`GET /Shows/{seriesId}/Episodes?adjacentTo={id}&limit=1`). `-Infinity` stands for `LocalDateTime.MIN`.
 * HTTP errors fall back to the premiere date; other errors reject (the caller treats them as null).
 */
async function compute(api: Api, userId: string, seriesId: string, item: BaseItemDto): Promise<number> {
  const premiere = toMs(item.PremiereDate) ?? -Infinity
  try {
    const res = await getShowApi(api).getEpisodes({ seriesId, userId, adjacentTo: item.Id ?? undefined, limit: 1 })
    const played = toMs(res.data.Items?.[0]?.UserData?.LastPlayedDate) ?? -Infinity
    return Math.max(played, premiere)
  } catch (err) {
    if (status(err) != null) return premiere
    throw err
  }
}

/** Cached (2 h) `getLastPlayed(item)`; null for items without a series. */
export function lastPlayedOf(api: Api, userId: string, item: BaseItemDto): Promise<number> | null {
  const seriesId = normalizeId(item.SeriesId)
  const itemId = normalizeId(item.Id)
  if (!seriesId || !itemId) return null
  const key = `${seriesId}:${itemId}`
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value
  const value = compute(api, userId, seriesId, item)
  value.catch(() => cache.delete(key))
  cache.set(key, { seriesId, at: Date.now(), value })
  while (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value as string)
  return value
}

/** `invalidate(item)`: forget everything cached for the item's series (or the series itself). */
export function invalidateDatePlayed(item: Pick<BaseItemDto, 'Id' | 'Type' | 'SeriesId'>): void {
  const seriesId = normalizeId(item.Type === 'Series' ? item.Id : item.SeriesId)
  if (!seriesId) return
  for (const [k, e] of cache) if (e.seriesId === seriesId) cache.delete(k)
}

export function invalidateAllDatePlayed(): void {
  cache.clear()
}
