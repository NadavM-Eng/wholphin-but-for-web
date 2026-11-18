// Suggestions (W/services/SuggestionService.kt, SuggestionsWorker.kt, SuggestionsCache). Upstream computes
// them in a background WorkManager job every 12 h and caches the ids; the web computes on demand, keeps
// the ids per (server, user, library, kind) in localStorage, serves the cached ids immediately and
// recomputes in the background once they are older than 12 h.
import type { Api } from '@jellyfin/sdk'
import type { BaseItemDto, BaseItemKind, CollectionType } from '@jellyfin/sdk/lib/generated-client/models'
import { getLibraryApi } from '@jellyfin/sdk/lib/utils/api/library-api'
import { normalizeId } from '../../lib/ids'
import { readJson, writeJson } from '../../lib/storage'

const REFRESH_MS = 12 * 60 * 60_000
const PREFIX = 'wholphin.suggestions.v1.'

/** `SuggestionsWorker.getTypeForCollection`: only movie and TV libraries have suggestions. */
export function suggestionKindFor(collectionType: CollectionType | null | undefined): BaseItemKind | null {
  if (collectionType === 'movies') return 'Movie'
  if (collectionType === 'tvshows') return 'Series'
  return null
}

type Cached = { ids: string[]; at: number }

const relevantId = (i: BaseItemDto) => normalizeId(i.SeriesId ?? i.Id) ?? ''

function shuffle<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

async function fetchItems(
  api: Api,
  p: {
    parentId: string
    userId: string
    kind: BaseItemKind
    sortBy: 'Random' | 'DatePlayed' | 'DateCreated'
    isPlayed: boolean
    limit: number
    sortOrder?: 'Descending'
    genreIds?: string[]
    excludeItemIds?: string[]
    genres?: boolean
  },
): Promise<BaseItemDto[]> {
  const res = await getLibraryApi(api).getItems({
    parentId: p.parentId,
    userId: p.userId,
    fields: p.genres ? ['Genres'] : [],
    includeItemTypes: [p.kind],
    genreIds: p.genreIds,
    recursive: true,
    isPlayed: p.isPlayed,
    excludeItemIds: p.excludeItemIds,
    sortBy: [p.sortBy],
    sortOrder: p.sortOrder ? [p.sortOrder] : undefined,
    limit: p.limit,
    enableTotalRecordCount: false,
    imageTypeLimit: 0,
  })
  return res.data.Items ?? []
}

/** `SuggestionsWorker.fetchSuggestions` (:214-306). Returns ids. */
export async function computeSuggestions(api: Api, userId: string, parentId: string, kind: BaseItemKind, n: number): Promise<string[]> {
  const historyKind: BaseItemKind = kind === 'Series' ? 'Episode' : kind
  const contextual = Math.max(1, Math.trunc(n * 0.4))
  const random = Math.max(1, Math.trunc(n * 0.3))
  const fresh = Math.max(1, Math.trunc(n * 0.3))

  const history = await fetchItems(api, { parentId, userId, kind: historyKind, sortBy: 'DatePlayed', isPlayed: true, limit: 20, genres: true })
  const seen = new Set<string>()
  const seeds = history.filter((i) => !seen.has(relevantId(i)) && !!seen.add(relevantId(i))).slice(0, 3)
  const genreIds = [...new Set(seeds.flatMap((s) => (s.GenreItems ?? []).map((g) => g.Id ?? '').filter(Boolean)))]
  const exclude = new Set(seeds.map(relevantId))

  const [ctx, rnd, frs] = await Promise.all([
    genreIds.length === 0
      ? Promise.resolve([])
      : fetchItems(api, { parentId, userId, kind, sortBy: 'Random', isPlayed: false, limit: contextual, genreIds, excludeItemIds: [...exclude] }),
    fetchItems(api, { parentId, userId, kind, sortBy: 'Random', isPlayed: false, limit: random }),
    fetchItems(api, { parentId, userId, kind, sortBy: 'DateCreated', sortOrder: 'Descending', isPlayed: false, limit: fresh }),
  ])
  const ids = new Set<string>()
  const merged: string[] = []
  for (const i of [...ctx, ...frs, ...rnd]) {
    const id = normalizeId(i.Id)
    if (!id || ids.has(id) || exclude.has(relevantId(i))) continue
    ids.add(id)
    merged.push(id)
  }
  return shuffle(merged).slice(0, n)
}

const keyOf = (serverId: string, userId: string, parentId: string, kind: BaseItemKind) =>
  `${PREFIX}${serverId}:${normalizeId(userId)}:${normalizeId(parentId)}:${kind}`

const inFlight = new Map<string, Promise<string[]>>()

function refresh(api: Api, key: string, userId: string, parentId: string, kind: BaseItemKind, n: number): Promise<string[]> {
  const running = inFlight.get(key)
  if (running) return running
  const p = computeSuggestions(api, userId, parentId, kind, n)
    .then((ids) => {
      writeJson(key, { ids, at: Date.now() } satisfies Cached)
      return ids
    })
    .finally(() => inFlight.delete(key))
  inFlight.set(key, p)
  return p
}

/**
 * Suggested items for a library. Cached ids are re-read with `GET /Items?ids=` (server order, stale ids
 * drop out, SH-11); any failure or no ids gives an empty list (upstream: the row is hidden, never an error).
 */
export async function getSuggestions(
  api: Api,
  p: { serverId: string; userId: string; parentId: string; kind: BaseItemKind; count: number },
  signal?: AbortSignal,
): Promise<BaseItemDto[]> {
  try {
    const key = keyOf(p.serverId, p.userId, p.parentId, p.kind)
    const cached = readJson<Cached>(key)
    let ids: string[]
    if (cached?.ids) {
      ids = cached.ids
      if (Date.now() - (cached.at ?? 0) > REFRESH_MS) void refresh(api, key, p.userId, p.parentId, p.kind, p.count).catch(() => {})
    } else {
      ids = await refresh(api, key, p.userId, p.parentId, p.kind, p.count)
    }
    if (ids.length === 0) return []
    const res = await getLibraryApi(api).getItems({ userId: p.userId, ids, fields: ['PrimaryImageAspectRatio', 'Overview'] }, { signal })
    return res.data.Items ?? []
  } catch {
    return []
  }
}
