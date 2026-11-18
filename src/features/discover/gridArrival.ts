/** What `DiscoverGrid` does next on its way to the start card (upstream `CardGrid(initialPosition = startIndex)`). */
export type GridArrivalStep = 'wait' | 'fetch' | 'arrive' | 'give-up'

export type GridArrivalState = {
  /** Already positioned (or restoring a remembered scroll offset on Back). */
  done: boolean
  isPending: boolean
  fetchError: boolean
  loaded: number
  start: number
  hasNextPage: boolean
  isFetchingNextPage: boolean
}

/**
 * Pages are loaded until `start` is in range, then the grid arrives there once: start 0 included, since
 * upstream `DiscoverRequestGrid` requests grid focus on every first load (`LaunchedEffect(Unit)`), genre cards
 * open it with `startIndex = 0`.
 */
export function gridArrivalStep(s: GridArrivalState): GridArrivalStep {
  if (s.done || s.isPending) return 'wait'
  // stop chasing `start` on a failed page; the inline Retry takes over
  if (s.fetchError) return 'give-up'
  if (s.loaded > s.start) return 'arrive'
  if (s.hasNextPage) return s.isFetchingNextPage ? 'wait' : 'fetch'
  return 'give-up'
}
