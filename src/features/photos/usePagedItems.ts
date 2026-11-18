// Random-access paged list (upstream ApiRequestPager, W/util/ApiRequestPager.kt): page 0 brings the total count,
// `size` is the total at once and other pages load when an index of theirs is read. Pages go through TanStack
// Query (keys under `qk(...)`), so going Back reuses them.
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { itemQueryMeta } from '../common/itemCache'

export const PAGE_SIZE = 100

const EMPTY: ReadonlyMap<number, BaseItemDto[]> = new Map()

export interface Page {
  items: BaseItemDto[]
  total: number
}

export type FetchPage = (startIndex: number, limit: number, signal: AbortSignal) => Promise<Page>

export interface PagedItems {
  status: 'pending' | 'error' | 'success'
  error: Error | null
  total: number
  /** The item at `index`, or undefined while its page loads (reading it starts the load). */
  get: (index: number) => BaseItemDto | undefined
  /** Resolves the item at `index`, loading its page if needed. */
  fetch: (index: number) => Promise<BaseItemDto | undefined>
  /** All items of page `n` (PAGE_SIZE per page). */
  page: (n: number) => Promise<BaseItemDto[]>
}

export function usePagedItems(queryKey: readonly unknown[], fetchPage: FetchPage, enabled = true): PagedItems {
  const qc = useQueryClient()
  const keyStr = JSON.stringify(queryKey)
  const fetchRef = useRef(fetchPage)
  useEffect(() => {
    fetchRef.current = fetchPage
  })
  const pageKey = useCallback((n: number): unknown[] => [...(JSON.parse(keyStr) as unknown[]), 'page', n], [keyStr])

  const first = useQuery({
    queryKey: pageKey(0),
    enabled,
    meta: itemQueryMeta('played', 'favorite', 'deleted'),
    queryFn: ({ signal }) => fetchRef.current(0, PAGE_SIZE, signal),
  })

  // later pages: kept in component state, filled from the query cache
  const [pages, setPages] = useState<{ key: string; map: Map<number, BaseItemDto[]> }>(() => ({ key: keyStr, map: new Map() }))
  const loading = useRef(new Set<string>())
  const current = useMemo(() => (pages.key === keyStr ? pages.map : EMPTY), [pages, keyStr])

  const loadPage = useCallback(
    (n: number): Promise<BaseItemDto[]> => {
      const id = `${keyStr}#${n}`
      return qc
        .fetchQuery({
          queryKey: pageKey(n),
          meta: itemQueryMeta('played', 'favorite', 'deleted'),
          queryFn: ({ signal }) => fetchRef.current(n * PAGE_SIZE, PAGE_SIZE, signal),
          staleTime: 5 * 60_000,
        })
        .then((p) => {
          setPages((s) => {
            const map = new Map(s.key === keyStr ? s.map : [])
            map.set(n, p.items)
            return { key: keyStr, map }
          })
          return p.items
        })
        .finally(() => loading.current.delete(id))
    },
    [qc, keyStr, pageKey],
  )

  const total = first.data?.total ?? 0
  const get = useCallback(
    (index: number): BaseItemDto | undefined => {
      if (index < 0 || index >= total) return undefined
      const n = Math.floor(index / PAGE_SIZE)
      if (n === 0) return first.data?.items[index]
      const page = current.get(n)
      if (page) return page[index - n * PAGE_SIZE]
      const id = `${keyStr}#${n}`
      if (!loading.current.has(id)) {
        loading.current.add(id)
        // schedule outside render
        queueMicrotask(() => void loadPage(n).catch(() => undefined))
      }
      return undefined
    },
    [total, first.data, current, keyStr, loadPage],
  )

  const fetch = useCallback(
    async (index: number): Promise<BaseItemDto | undefined> => {
      if (index < 0) return undefined
      const n = Math.floor(index / PAGE_SIZE)
      if (n === 0) {
        const p: Page = first.data ?? (await qc.fetchQuery<Page>({ queryKey: pageKey(0), queryFn: ({ signal }) => fetchRef.current(0, PAGE_SIZE, signal) }))
        return p.items[index]
      }
      const page = current.get(n) ?? (await loadPage(n))
      return page[index - n * PAGE_SIZE]
    },
    [first.data, current, qc, pageKey, loadPage],
  )

  const page = useCallback(
    async (n: number): Promise<BaseItemDto[]> => {
      if (n === 0) {
        const p: Page = first.data ?? (await qc.fetchQuery<Page>({ queryKey: pageKey(0), queryFn: ({ signal }) => fetchRef.current(0, PAGE_SIZE, signal) }))
        return p.items
      }
      return current.get(n) ?? loadPage(n)
    },
    [first.data, current, qc, pageKey, loadPage],
  )

  return useMemo(
    () => ({
      status: first.isPending ? 'pending' : first.isError ? 'error' : 'success',
      error: first.error,
      total,
      get,
      fetch,
      page,
    }),
    [first.isPending, first.isError, first.error, total, get, fetch, page],
  )
}
