// A "visit" is one history entry reached by a new navigation (PUSH / REPLACE). Upstream builds a new view
// model for every new destination, so the grid is fetched again; Back (POP) returns to the kept view model.
// Grid pages are cached with an infinite staleTime for Back, and treated as stale when they were fetched
// before the current visit started.
import type { Query } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useLocation, useNavigationType } from 'react-router'

const starts = new Map<string, number>()
const MAX = 200

/**
 * Start time of the current history entry's visit: set when the entry is first shown by a new navigation,
 * kept for Back to it. 0 (nothing older is stale) for an entry first seen through POP (initial load or
 * reload, where the cache is empty anyway).
 */
export function useVisitStart(): number {
  const { key } = useLocation()
  const navType = useNavigationType()
  return useMemo(() => visitStart(key, navType === 'POP'), [key, navType])
}

/**
 * Key of the current visit: the history entry's `location.key`, except that a replace navigation keeps the key
 * it replaces. A replace keeps the history entry (a tab page writes its `?tab=` that way right after its first
 * render), so whatever is keyed by this is not re-created by it; PUSH and POP give a new key. Scroll memory is
 * still keyed by `location.key` itself, which is what Back comes back to.
 */
export function useVisitKey(): string {
  const { key } = useLocation()
  const navType = useNavigationType()
  const [state, setState] = useState({ visit: key, seen: key })
  if (state.seen === key) return state.visit
  const next = { visit: navType === 'REPLACE' ? state.visit : key, seen: key }
  setState(next)
  return next.visit
}

/** Idempotent per history entry: the first call records the start, later calls (Back) return it. */
function visitStart(key: string, pop: boolean): number {
  const known = starts.get(key)
  if (known !== undefined) return known
  const start = pop ? 0 : Date.now()
  starts.set(key, start)
  if (starts.size > MAX) starts.delete(starts.keys().next().value!)
  return start
}

/** `staleTime` for a cached grid page: stale once if it was fetched before the visit, then fresh. */
export function staleBefore(visitStart: number) {
  return (q: Pick<Query, 'state'>) => (q.state.dataUpdatedAt < visitStart ? 0 : Infinity)
}
