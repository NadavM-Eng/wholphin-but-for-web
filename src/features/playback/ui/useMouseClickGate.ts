// Delays a mouse click's play/pause by a moment so a double click (fullscreen) never leaves the video paused.
import { useEffect, useRef } from 'react'

/** A single click acts after this wait; a second click inside it makes the pair a double click. */
export const CLICK_WAIT_MS = 250
/** The longest system double-click time that is still honoured when undoing a click that already acted. */
const DOUBLE_CLICK_MAX_MS = 1000

/** A click event's pointer type; an empty type (synthetic click) counts as mouse, touch and pen are handled elsewhere. */
export const isMouseClick = (pointerType: string | undefined) => !pointerType || pointerType === 'mouse'

export interface ClickGateDeps {
  isPaused: () => boolean
  togglePlay: () => void
}

/** The decision logic, free of React: feed it clicks and double clicks, it calls `togglePlay` at the right time. */
export function createClickGate({ isPaused, togglePlay }: ClickGateDeps) {
  let timer: ReturnType<typeof setTimeout> | null = null
  // paused state before the last click that acted, and when it acted
  let acted: { wasPaused: boolean; at: number } | null = null

  const clearTimer = () => {
    if (timer) clearTimeout(timer)
    timer = null
  }
  return {
    /** A mouse click. Touch and pen clicks must not be passed in. */
    click() {
      if (acted && Date.now() - acted.at > DOUBLE_CLICK_MAX_MS) acted = null
      if (timer) {
        // second click inside the wait: a fast double click, nothing happens to the play state
        clearTimer()
        acted = null
        return
      }
      timer = setTimeout(() => {
        timer = null
        acted = { wasPaused: isPaused(), at: Date.now() }
        togglePlay()
      }, CLICK_WAIT_MS)
    },
    /** The browser's double click: the play state goes back to what it was before the first click. */
    doubleClick() {
      clearTimer()
      if (acted && isPaused() !== acted.wasPaused) togglePlay()
      acted = null
    },
    dispose() {
      clearTimer()
      acted = null
    },
  }
}

export function useMouseClickGate(deps: ClickGateDeps) {
  const latest = useRef(deps)
  useEffect(() => {
    latest.current = deps
  })
  const gate = useRef<ReturnType<typeof createClickGate>>(null)
  if (!gate.current) gate.current = createClickGate({ isPaused: () => latest.current.isPaused(), togglePlay: () => latest.current.togglePlay() })
  useEffect(() => {
    const g = gate.current
    return () => g?.dispose()
  }, [])
  return gate.current
}
