// `getGenreImageMap` (W/ui/components/GenreCardGrid.kt:170-246): one random item's backdrop per genre,
// cached in memory for 2 h, at most 8 (user, parent) entries.
import type { Api } from '@jellyfin/sdk'
import type { BaseItemKind } from '@jellyfin/sdk/lib/generated-client/models'
import { getLibraryApi } from '@jellyfin/sdk/lib/utils/api/library-api'
import { getItemImageUrl } from '../../api/images'
import { mapLimited } from './concurrency'

const TTL_MS = 2 * 60 * 60_000
const MAX_KEYS = 8
const cache = new Map<string, { at: number; map: Record<string, string | null> }>()

export type GenreImageRequest = {
  userId: string
  parentId: string
  genreIds: readonly string[]
  includeItemTypes?: BaseItemKind[] | null
  /** Device pixels for `fillWidth`, or null (home rows send none). */
  cardWidthPx?: number | null
  /** Upstream reads the cache only when refreshing; a first load always picks new random items. */
  useCache: boolean
}

export async function fetchGenreImages(api: Api, req: GenreImageRequest, signal?: AbortSignal): Promise<Record<string, string | null>> {
  const key = `${req.userId}:${req.parentId}`
  const hit = cache.get(key)
  if (req.useCache && hit && Date.now() - hit.at < TTL_MS && req.genreIds.every((g) => g in hit.map)) return hit.map
  const map: Record<string, string | null> = {}
  await mapLimited(req.genreIds, 4, async (genreId) => {
    const res = await getLibraryApi(api).getItems(
      {
        userId: req.userId,
        parentId: req.parentId,
        recursive: true,
        limit: 1,
        sortBy: ['Random'],
        fields: ['Genres'],
        imageTypes: ['Backdrop'],
        imageTypeLimit: 1,
        includeItemTypes: req.includeItemTypes ?? undefined,
        genreIds: [genreId],
        enableTotalRecordCount: false,
      },
      { signal },
    )
    const item = res.data.Items?.[0]
    // upstream passes seriesId = null, so an episode uses its own backdrop
    map[genreId] = item ? getItemImageUrl(api.basePath, { ...item, SeriesId: null }, 'Backdrop', { fillWidth: req.cardWidthPx }) : null
  })
  cache.delete(key)
  cache.set(key, { at: Date.now(), map })
  while (cache.size > MAX_KEYS) cache.delete(cache.keys().next().value as string)
  return map
}
