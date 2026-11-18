// Mouse hover as the TV "focused item" (header, backdrop, details pane): a card only takes over after the pointer
// rests on it for a moment, so sweeping the mouse across a row or grid does not flicker the header and backdrop.
// Keyboard focus and touch taps stay immediate. Shared by Home, the library grids, box sets, playlists and the
// series episode strip.
import { useEffect, useMemo } from 'react'
import { pointerHighlight } from '../../ui'

export const HOVER_INTENT_MS = 250

/** Mouse and pen hover; touch never hovers. */
export const isHoverPointer = (e: { pointerType: string }) => e.pointerType === 'mouse' || e.pointerType === 'pen'

export type HoverIntent<K> = {
  /** The pointer is over `key` (null = over nothing that counts): `fire` runs after the delay unless it moves on. */
  over: (key: K | null, fire: () => void) => void
  /** The pointer left: nothing fires. */
  leave: () => void
}

export function createHoverIntent<K>(delayMs = HOVER_INTENT_MS): HoverIntent<K> & { dispose: () => void } {
  let timer: ReturnType<typeof setTimeout> | undefined
  let current: K | null = null
  const leave = () => {
    current = null
    clearTimeout(timer)
  }
  return {
    over(key, fire) {
      if (key === current) return
      current = key
      clearTimeout(timer)
      if (key == null) return
      timer = setTimeout(() => {
        // Content moving under a resting cursor (scrolling, a page change) makes browsers send pointerover
        // without any pointer movement (Firefox always does). The hover counts only while the mouse owns the
        // highlight (<html data-pointer>, set by real movement): otherwise the keyboard's item keeps the header.
        if (!pointerHighlight()) {
          current = null
          return
        }
        fire()
      }, delayMs)
    },
    leave,
    dispose: leave,
  }
}

/** A hover-intent tracker for one component; pending callbacks are dropped on unmount. */
export function useHoverIntent<K>(delayMs = HOVER_INTENT_MS): HoverIntent<K> {
  const intent = useMemo(() => createHoverIntent<K>(delayMs), [delayMs])
  useEffect(() => () => intent.dispose(), [intent])
  return intent
}
