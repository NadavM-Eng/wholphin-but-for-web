// Jellyfin DisplayPreferences access (W/services/DisplayPreferencesService.kt) and the
// "removed from next up" map kept in it (W/services/LatestNextUpService.kt).
import type { Api } from '@jellyfin/sdk'
import type { BaseItemDto, DisplayPreferencesDto } from '@jellyfin/sdk/lib/generated-client/models'
import { getDisplayPreferenceApi } from '@jellyfin/sdk/lib/utils/api/display-preference-api'
import { queryClient } from '../../api/queryClient'
import { qk } from '../../api/queryKeys'
import { normalizeId } from '../../lib/ids'

/**
 * Client name the preferences are stored under. Upstream uses "Wholphin" (release builds), so the web
 * port reads and writes the same document: home settings and removed-from-next-up entries saved by the
 * TV app show up here and vice versa.
 */
export const DISPLAY_PREFS_CLIENT = 'Wholphin'
export const DEFAULT_DISPLAY_PREFS_ID = 'default'

export async function getDisplayPreferences(
  api: Api,
  userId: string,
  id = DEFAULT_DISPLAY_PREFS_ID,
  client = DISPLAY_PREFS_CLIENT,
  signal?: AbortSignal,
): Promise<DisplayPreferencesDto> {
  const res = await getDisplayPreferenceApi(api).getDisplayPreferences({ displayPreferencesId: id, userId, client }, { signal })
  return res.data
}

/** Cache key of the shared "default"/"Wholphin" document (home settings + removed-from-next-up). */
export const wholphinDisplayPrefsKey = () => qk('displayPreferences', DEFAULT_DISPLAY_PREFS_ID, DISPLAY_PREFS_CLIENT)

/**
 * The Wholphin "default" document through one short-lived query, so a Home load (home settings source
 * resolution + the Next Up filter of every next-up row) requests it once instead of once per reader.
 * Writes below update this cache entry.
 */
export function getWholphinDisplayPreferences(api: Api, userId: string): Promise<DisplayPreferencesDto> {
  return queryClient.fetchQuery({
    queryKey: wholphinDisplayPrefsKey(),
    staleTime: 10_000,
    queryFn: ({ signal }) => getDisplayPreferences(api, userId, DEFAULT_DISPLAY_PREFS_ID, DISPLAY_PREFS_CLIENT, signal),
  })
}

let lock: Promise<unknown> = Promise.resolve()

/**
 * Read-modify-write of `CustomPrefs` under a global lock. Upstream always reads id "default" but writes
 * the given id (DisplayPreferencesService.kt:41); this reads the same id it writes.
 */
export function updateDisplayPreferences(
  api: Api,
  userId: string,
  mutate: (prefs: Record<string, string | null>) => void,
  id = DEFAULT_DISPLAY_PREFS_ID,
  client = DISPLAY_PREFS_CLIENT,
): Promise<void> {
  const run = lock.then(async () => {
    const current = await getDisplayPreferences(api, userId, id, client)
    const prefs: Record<string, string | null> = { ...(current.CustomPrefs ?? {}) }
    mutate(prefs)
    const next: DisplayPreferencesDto = { ...current, CustomPrefs: prefs }
    await getDisplayPreferenceApi(api).updateDisplayPreferences({
      displayPreferencesId: id,
      userId,
      client,
      displayPreferencesDto: next,
    })
    if (id === DEFAULT_DISPLAY_PREFS_ID && client === DISPLAY_PREFS_CLIENT) queryClient.setQueryData(wholphinDisplayPrefsKey(), next)
  })
  lock = run.catch(() => undefined)
  return run
}

// ---------------------------------------------------------------------------------------------
// Removed from next up

export const REMOVED_NEXT_UP_KEY = 'removeNextUp'

/** seriesId (normalized, 32 hex) -> removal time as a zoneless local date-time ("2026-11-17T12:34:56.789"). */
export type RemovedNextUp = Record<string, string>

/** Parses `{"value": {"<uuid>": "<LocalDateTime>"}}`; anything malformed reads as empty. */
export function parseRemovedNextUp(json: string | null | undefined): RemovedNextUp {
  if (!json) return {}
  try {
    const parsed = JSON.parse(json) as { value?: Record<string, unknown> }
    const out: RemovedNextUp = {}
    for (const [k, v] of Object.entries(parsed.value ?? {})) {
      const id = normalizeId(k)
      if (id && typeof v === 'string') out[id] = v
    }
    return out
  } catch {
    return {}
  }
}

/** UUID with dashes, as kotlinx/Jellyfin's UUIDSerializer writes map keys. */
export function dashedId(id: string): string {
  const n = normalizeId(id)
  return n.length === 32 ? `${n.slice(0, 8)}-${n.slice(8, 12)}-${n.slice(12, 16)}-${n.slice(16, 20)}-${n.slice(20)}` : id
}

export function serializeRemovedNextUp(map: RemovedNextUp): string {
  const value: Record<string, string> = {}
  for (const [k, v] of Object.entries(map)) value[dashedId(k)] = v
  return JSON.stringify({ value })
}

/** `LocalDateTime.now()` in ISO_LOCAL_DATE_TIME form (device zone, no offset). */
export function localDateTimeNow(now = new Date()): string {
  const p = (n: number, w = 2) => String(n).padStart(w, '0')
  return (
    `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}` +
    `T${p(now.getHours())}:${p(now.getMinutes())}:${p(now.getSeconds())}.${p(now.getMilliseconds(), 3)}`
  )
}

/** A zoneless local date-time parses as local time; a server timestamp with Z/offset as that instant. */
function instant(s: string | null | undefined): number | null {
  if (!s) return null
  const ms = Date.parse(s)
  return Number.isNaN(ms) ? null : ms
}

/**
 * `getNextUp` filter (LatestNextUpService.kt:109-124): drop an episode of a removed series unless it was
 * played after the removal (no last-played date => stays hidden).
 */
export function keepInNextUp(item: BaseItemDto, removed: RemovedNextUp): boolean {
  const seriesId = normalizeId(item.SeriesId)
  if (!seriesId || !(seriesId in removed)) return true
  const played = instant(item.UserData?.LastPlayedDate)
  const removedAt = instant(removed[seriesId])
  if (played == null) return false
  return removedAt == null || played > removedAt
}

export async function getRemovedNextUp(api: Api, userId: string): Promise<RemovedNextUp> {
  const prefs = await getWholphinDisplayPreferences(api, userId)
  return parseRemovedNextUp(prefs.CustomPrefs?.[REMOVED_NEXT_UP_KEY])
}

/** Adds `seriesId -> now` to the map (the caller also marks the episode unplayed). */
export function addRemovedNextUp(api: Api, userId: string, seriesId: string): Promise<void> {
  return updateDisplayPreferences(api, userId, (prefs) => {
    const map = parseRemovedNextUp(prefs[REMOVED_NEXT_UP_KEY])
    map[normalizeId(seriesId)] = localDateTimeNow()
    prefs[REMOVED_NEXT_UP_KEY] = serializeRemovedNextUp(map)
  })
}

/** `allowSeriesRemovedFromNextUp`: deletes the entry (Home settings > "View series removed from next up"). */
export function allowRemovedNextUp(api: Api, userId: string, seriesId: string): Promise<void> {
  return updateDisplayPreferences(api, userId, (prefs) => {
    const map = parseRemovedNextUp(prefs[REMOVED_NEXT_UP_KEY])
    delete map[normalizeId(seriesId)]
    prefs[REMOVED_NEXT_UP_KEY] = serializeRemovedNextUp(map)
  })
}
