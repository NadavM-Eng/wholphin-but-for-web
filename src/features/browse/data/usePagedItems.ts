// Sparse paged list (W/util/RequestPager.kt + ApiRequestPager.kt): page 0 is fetched with the total count,
// the list reports `total` slots at once and later pages load when their slots are rendered. Each page is
// its own TanStack query, so item patches (favorite/watched) reach it and Back finds it in the cache.
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models'
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { itemQueryMeta, type ItemDep } from '../../common/itemCache'
import { staleBefore, useVisitStart } from './visit'

export type Page = { items: BaseItemDto[]; total: number | null }

export type PageFetcher = (startIndex: number, limit: number, withTotal: boolean, signal: AbortSignal) => Promise<Page>

/** Upstream keeps 8 pages in its Guava cache; pages outside it are refetched (here: read from the query cache). */
const LIVE_PAGES = 8
/** Pages stay cached this long after the grid unmounts (Back within the session reuses them). */
const GC_MS = 30 * 60_000

export type PagedItems = {
  status: 'pending' | 'error' | 'success'
  error: unknown
  /** Slot count (server total), 0 while loading. */
  total: number
  /** The item at `index`, or undefined while its page loads (also requests that page). */
  get: (index: number) => BaseItemDto | undefined
  /** Peek without requesting the page. */
  peek: (index: number) => BaseItemDto | undefined
  /** Loads the page holding `index` (Random button) and resolves with the item. */
  fetchAt: (index: number) => Promise<BaseItemDto | undefined>
  /** The query key prefix of every page. */
  keyPrefix: readonly unknown[]
}

export function usePagedItems(opts: {
  /** Identifies the request (sort, filter, parent...): `qk(...)`-based. */
  key: readonly unknown[]
  fetchPage: PageFetcher
  pageSize?: number
  enabled?: boolean
  deps?: ItemDep[]
}): PagedItems {
  const { key, fetchPage, pageSize = 100, enabled = true, deps = ['deleted'] } = opts
  // Back reuses the cached pages; a new visit refetches pages cached before it (upstream: new view model).
  const staleTime = staleBefore(useVisitStart())
  const qc = useQueryClient()
  const keyStr = JSON.stringify(key)
  const fetchRef = useRef(fetchPage)
  useEffect(() => {
    fetchRef.current = fetchPage
  })
  const meta = itemQueryMeta(...deps)

  const pageKey = useCallback((p: number) => [...(JSON.parse(keyStr) as unknown[]), 'page', pageSize, p] as const, [keyStr, pageSize])

  const first = useQuery({
    queryKey: pageKey(0),
    enabled,
    staleTime,
    gcTime: GC_MS,
    meta,
    queryFn: ({ signal }) => fetchRef.current(0, pageSize, true, signal),
  })
  const total = first.data ? (first.data.total ?? first.data.items.length) : 0

  // Pages wanted by the rendered slots, most recent last.
  const [wanted, setWanted] = useState<number[]>([])
  const pending = useRef(new Set<number>())
  const scheduled = useRef(false)
  useEffect(() => {
    setWanted([])
    pending.current.clear()
  }, [keyStr])

  const request = useCallback((page: number) => {
    if (page <= 0 || pending.current.has(page)) return
    pending.current.add(page)
    if (scheduled.current) return
    scheduled.current = true
    // called while rendering the grid: update state afterwards
    queueMicrotask(() => {
      scheduled.current = false
      const add = [...pending.current]
      pending.current.clear()
      setWanted((cur) => {
        const next = cur.filter((p) => !add.includes(p)).concat(add)
        return next.length > LIVE_PAGES ? next.slice(next.length - LIVE_PAGES) : next
      })
    })
  }, [])

  const pages = useQueries({
    queries: wanted.map((p) => ({
      queryKey: pageKey(p),
      enabled: enabled && !!first.data,
      staleTime,
      gcTime: GC_MS,
      meta,
      queryFn: ({ signal }: { signal: AbortSignal }) => fetchRef.current(p * pageSize, pageSize, false, signal),
    })),
  })

  // Rebuilt every render (cheap); the grid re-renders whenever a page arrives.
  const byPage = new Map<number, BaseItemDto[]>()
  if (first.data) byPage.set(0, first.data.items)
  wanted.forEach((p, i) => {
    const d = pages[i]?.data
    if (d) byPage.set(p, d.items)
  })

  const slot = (index: number) => {
    const p = Math.floor(index / pageSize)
    return { p, i: index - p * pageSize }
  }

  const peek = (index: number) => {
    const { p, i } = slot(index)
    return (byPage.get(p) ?? qc.getQueryData<Page>(pageKey(p))?.items)?.[i]
  }

  const get = (index: number) => {
    const { p, i } = slot(index)
    const live = byPage.get(p)
    if (live) return live[i]
    request(p)
    return qc.getQueryData<Page>(pageKey(p))?.items[i]
  }

  const fetchAt = async (index: number) => {
    const { p, i } = slot(index)
    const data = await qc.fetchQuery<Page>({
      queryKey: pageKey(p),
      staleTime,
      gcTime: GC_MS,
      meta,
      queryFn: ({ signal }) => fetchRef.current(p * pageSize, pageSize, p === 0, signal),
    })
    return data.items[i]
  }

  return {
    status: first.status,
    error: first.error,
    total,
    get,
    peek,
    fetchAt,
    keyPrefix: useMemo(() => JSON.parse(keyStr) as unknown[], [keyStr]),
  }
}
