import { useSessionStore } from '../stores/session'

export type QueryKeyPart = string | number | boolean | null | undefined | Record<string, unknown> | readonly unknown[]

/**
 * Query key scoped to the current server and user: `[serverId, userId, ...parts]`.
 * Every Jellyfin query must use it so switching user never shows another user's cache.
 */
export function qk(...parts: QueryKeyPart[]): readonly unknown[] {
  const cur = useSessionStore.getState().current
  return [cur?.server.id ?? null, cur?.user.id ?? null, ...parts]
}

/**
 * `GET /Items/{id}` of one item. Every feature that loads a single item uses this key, so the item route and the
 * page it dispatches to (music, photos, Live TV, browse) share one cache entry.
 */
export function itemKey(id: string | null | undefined): readonly unknown[] {
  return qk('item', id ?? '')
}

/** Prefix that matches every query of the current user (for broad invalidation). */
export function qkUser(): readonly unknown[] {
  return qk()
}
