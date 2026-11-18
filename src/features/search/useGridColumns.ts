import { useSyncExternalStore } from 'react'
import type { GridColumns } from '../../ui'

const WIDE_QUERY = '(min-width: 900px)'
function subscribeWide(cb: () => void) {
  const mq = matchMedia(WIDE_QUERY)
  mq.addEventListener('change', cb)
  return () => mq.removeEventListener('change', cb)
}

/** CardGrid defaults (columns 6, spacing 16dp); narrow windows reflow instead of squeezing six posters. */
export function useGridColumns(): GridColumns {
  const wide = useSyncExternalStore(subscribeWide, () => matchMedia(WIDE_QUERY).matches, () => true)
  return wide ? { kind: 'fixed', columns: 6 } : { kind: 'auto', minCardWidth: 104 }
}
