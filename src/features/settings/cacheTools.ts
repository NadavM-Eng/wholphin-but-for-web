// Web stand-in for upstream's Coil image cache tools (PreferencesContent.kt:372-416). The browser's HTTP cache
// cannot be inspected or cleared from a page; what a page can manage is Cache Storage (service worker caches)
// and its own storage quota, so that is what "Clear image cache" reports and clears.
import { MEGA_BIT } from '../../lib/format'

export interface CacheUsage {
  /** bytes used by this origin (Cache Storage, IndexedDB, ...), or null when unknown */
  usage: number | null
  quota: number | null
}

export async function getCacheUsage(): Promise<CacheUsage> {
  try {
    const est = await navigator.storage?.estimate?.()
    return { usage: est?.usage ?? null, quota: est?.quota ?? null }
  } catch {
    return { usage: null, quota: null }
  }
}

/** "Disk: {n}mb" (upstream adds the Coil memory cache, which has no web equivalent). */
export function cacheSummary(u: CacheUsage): string {
  return `Disk: ${u.usage == null ? '?' : Math.floor(u.usage / MEGA_BIT)}mb`
}

/** Deletes every Cache Storage cache of this origin. Returns how many were removed. */
export async function clearCacheStorage(): Promise<number> {
  if (typeof caches === 'undefined') return 0
  const keys = await caches.keys()
  await Promise.all(keys.map((k) => caches.delete(k)))
  return keys.length
}
