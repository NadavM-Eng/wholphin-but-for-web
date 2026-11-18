import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react'

/** Hold time before a touch press counts as a long-press (Android's default long-press timeout is 400-500 ms). */
export const LONG_PRESS_MS = 500
/** Finger travel (CSS px) that turns the press into a scroll / swipe instead. */
const MOVE_TOLERANCE = 10
/** A native `contextmenu` this soon after our long-press is the same gesture (Android Chrome sends both). */
const SAME_GESTURE_MS = 800
/** How long after the release the click it produces may still arrive. */
const RELEASE_CLICK_MS = 500

export type LongPressHandlers = {
  onPointerDown: (e: ReactPointerEvent<HTMLElement>) => void
  onPointerMove: (e: ReactPointerEvent<HTMLElement>) => void
  onPointerUp: () => void
  onPointerCancel: () => void
  /** Wraps the element's own contextmenu handler so one gesture never opens the menu twice. */
  wrapContextMenu: <E extends ReactMouseEvent<HTMLElement>>(handler?: (e: E) => void) => ((e: E) => void) | undefined
}

/** Swallows the next click anywhere in the page (capture phase) if it comes within RELEASE_CLICK_MS. */
function swallowNextClick() {
  const swallow = (e: MouseEvent) => {
    e.preventDefault()
    e.stopImmediatePropagation()
    done()
  }
  const done = () => {
    window.clearTimeout(timer)
    window.removeEventListener('click', swallow, true)
  }
  window.addEventListener('click', swallow, true)
  const timer = window.setTimeout(done, RELEASE_CLICK_MS)
}

/**
 * Touch long-press (the TV app's long-press menu on phones and tablets). iOS Safari fires no `contextmenu`
 * for touch, so this times a touch pointer itself: held about 500 ms without moving or scrolling fires
 * `onLongPress`. The click that follows the release is swallowed wherever it lands: Chromium sends it to
 * the element now under the finger, which is an item of the menu that just opened (upstream disables the
 * menu for a second after a long-press for the same reason, `waitToLoad`). Mouse and pen presses are
 * ignored (they have right-click). The native callout / text selection is suppressed in CSS
 * (`-webkit-touch-callout: none; user-select: none` on the card surface).
 */
export function useLongPress(onLongPress: ((target: HTMLElement) => void) | undefined): LongPressHandlers {
  const timer = useRef<number | undefined>(undefined)
  const start = useRef<{ x: number; y: number } | null>(null)
  const firedAt = useRef(0)
  /** fired and still held: the release must not click */
  const armed = useRef(false)
  const callback = useRef(onLongPress)
  useEffect(() => {
    callback.current = onLongPress
  })

  // one stable function: it is also the scroll listener, which must be removed by identity
  const [cancel] = useState(() => {
    const fn = () => {
      window.clearTimeout(timer.current)
      timer.current = undefined
      start.current = null
      window.removeEventListener('scroll', fn, true)
    }
    return fn
  })
  useEffect(() => cancel, [cancel])

  return {
    onPointerDown: (e) => {
      cancel()
      armed.current = false
      if (e.pointerType !== 'touch' || !e.isPrimary || !callback.current) return
      const target = e.currentTarget
      start.current = { x: e.clientX, y: e.clientY }
      // any scroll (the row or the page under the finger) ends the press
      window.addEventListener('scroll', cancel, { capture: true, passive: true })
      timer.current = window.setTimeout(() => {
        cancel()
        if (!target.isConnected) return
        armed.current = true
        // before firedAt is set: the callback may dispatch a contextmenu event of its own (CardFrame)
        callback.current?.(target)
        firedAt.current = performance.now()
      }, LONG_PRESS_MS)
    },
    onPointerMove: (e) => {
      const s = start.current
      if (!s || e.pointerType !== 'touch') return
      if (Math.hypot(e.clientX - s.x, e.clientY - s.y) > MOVE_TOLERANCE) cancel()
    },
    // touch pointers are captured implicitly by the pressed element, so the release arrives here
    onPointerUp: () => {
      cancel()
      if (!armed.current) return
      armed.current = false
      swallowNextClick()
    },
    onPointerCancel: () => {
      cancel()
      armed.current = false
    },
    wrapContextMenu: (handler) => {
      if (!handler) return undefined
      return (e) => {
        // Android: the native long-press menu event arrives too; ours already opened the menu (or will not
        // need to: the native one wins and our timer stops)
        if (performance.now() - firedAt.current < SAME_GESTURE_MS) {
          e.preventDefault()
          return
        }
        cancel()
        handler(e)
      }
    },
  }
}
