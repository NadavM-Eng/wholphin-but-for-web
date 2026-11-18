import { useSyncExternalStore } from 'react'
import { usePrefsStore } from '../../stores/preferences'
import type { VisibilityContext } from './prefModel'

const HDR_QUERY = '(dynamic-range: high)'

function subscribeHdr(cb: () => void) {
  if (typeof matchMedia === 'undefined') return () => {}
  const mq = matchMedia(HDR_QUERY)
  mq.addEventListener('change', cb)
  return () => mq.removeEventListener('change', cb)
}

const hdrSnapshot = () => (typeof matchMedia === 'undefined' ? false : matchMedia(HDR_QUERY).matches)

/** The display currently reports HDR (re-renders when the window moves to another screen). */
export function useHdrDisplay(): boolean {
  return useSyncExternalStore(subscribeHdr, hdrSnapshot, () => false)
}

/** Inputs of the row visibility rules, re-evaluated on every preference change like upstream. */
export function useVisibilityContext(hdrPage = false): VisibilityContext {
  const prefs = usePrefsStore((s) => s.values)
  const hdrDisplay = useHdrDisplay()
  // BuildConfig.DISCOVER_ENABLED: the web build always offers the Seerr integration row.
  return { prefs, discover: true, hdrDisplay, hdrPage }
}
