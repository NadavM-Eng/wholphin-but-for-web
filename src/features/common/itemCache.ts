// Cache plumbing shared by every feature that shows items.
//
// Dependency tags: a query that lists items whose membership or order depends on user data declares it
// in `meta: itemQueryMeta('played', 'favorite')`. After a mutation, `invalidateItemDeps(['played'])`
// refetches only those queries (active ones; inactive ones are marked stale). Field changes of a single
// item (favorite heart, watched badge, progress) are patched in place in every cached response by
// `patchItemInCaches`, so no refetch is needed just to redraw a card.
import type { BaseItemDto, UserItemDataDto } from '@jellyfin/sdk/lib/generated-client/models'
import type { Query, QueryClient } from '@tanstack/react-query'
import { sameId } from '../../lib/ids'
import { useSessionStore } from '../../stores/session'

/** What a mutation changed. */
export type ItemDep = 'played' | 'favorite' | 'deleted' | 'nextUp'

const META_KEY = 'itemDeps'

/** `meta` for a query that must refetch when items change in these ways. */
export function itemQueryMeta(...deps: ItemDep[]): Record<string, unknown> {
  return { [META_KEY]: deps }
}

function depsOf(q: Query): readonly unknown[] {
  const v = q.meta?.[META_KEY]
  return Array.isArray(v) ? v : []
}

function isCurrentUser(q: Query): boolean {
  const cur = useSessionStore.getState().current
  const key = q.queryKey
  return !cur || (key[0] === cur.server.id && key[1] === cur.user.id)
}

/** Invalidates the current user's queries tagged with any of `deps`. */
export function invalidateItemDeps(qc: QueryClient, deps: readonly ItemDep[]): Promise<void> {
  return qc.invalidateQueries({ predicate: (q) => isCurrentUser(q) && depsOf(q).some((d) => deps.includes(d as ItemDep)) })
}

const MAX_DEPTH = 6

function isItem(v: unknown): v is BaseItemDto {
  return typeof v === 'object' && v != null && 'Id' in v && 'Type' in v
}

/** Returns `data` with every BaseItemDto whose Id is `itemId` replaced by `fn(item)`; same reference if none. */
export function mapItemsDeep(data: unknown, itemId: string, fn: (item: BaseItemDto) => BaseItemDto | null, depth = 0): unknown {
  if (depth > MAX_DEPTH || data == null || typeof data !== 'object') return data
  if (Array.isArray(data)) {
    let changed = false
    const out: unknown[] = []
    for (const v of data) {
      if (isItem(v) && sameId(v.Id, itemId)) {
        const next = fn(v)
        changed = true
        if (next) out.push(next)
        continue
      }
      const next = mapItemsDeep(v, itemId, fn, depth + 1)
      if (next !== v) changed = true
      out.push(next)
    }
    return changed ? out : data
  }
  if (isItem(data) && sameId(data.Id, itemId)) return fn(data) ?? data
  if (Object.getPrototypeOf(data) !== Object.prototype) return data
  let changed = false
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(data)) {
    const next = mapItemsDeep(v, itemId, fn, depth + 1)
    if (next !== v) changed = true
    out[k] = next
  }
  return changed ? out : data
}

/** Applies `fn` to every cached copy of the item (all queries of the current user). */
export function patchItemInCaches(qc: QueryClient, itemId: string, fn: (item: BaseItemDto) => BaseItemDto): void {
  for (const q of qc.getQueryCache().getAll()) {
    if (!isCurrentUser(q) || q.state.data === undefined) continue
    const next = mapItemsDeep(q.state.data, itemId, fn)
    if (next !== q.state.data) qc.setQueryData(q.queryKey, next)
  }
}

/**
 * Drops every cached copy of the item from lists (upstream removes the card locally after a delete).
 * With `onlyTagged`, only lists tagged with that dependency lose it (e.g. 'nextUp' for "Remove from next up").
 */
export function removeItemFromCaches(qc: QueryClient, itemId: string, onlyTagged?: ItemDep): void {
  for (const q of qc.getQueryCache().getAll()) {
    if (!isCurrentUser(q) || q.state.data === undefined) continue
    if (onlyTagged && !depsOf(q).includes(onlyTagged)) continue
    // Only list members are removed; a single-item query keeps its data until refetched.
    if (isItem(q.state.data)) continue
    const next = mapItemsDeep(q.state.data, itemId, () => null)
    if (next !== q.state.data) qc.setQueryData(q.queryKey, next)
  }
}

/** Merges a server `UserItemDataDto` (or a partial one) into an item. */
export function withUserData(item: BaseItemDto, data: Partial<UserItemDataDto>): BaseItemDto {
  return { ...item, UserData: { ...item.UserData, ...data } as UserItemDataDto }
}
