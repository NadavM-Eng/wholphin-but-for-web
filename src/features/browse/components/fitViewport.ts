import { useLayoutEffect, type RefObject } from 'react'

/**
 * CSS height that reaches from `top` (document px) to the bottom of the window, less what a fixed bar at the
 * bottom edge reserves (`--page-bottom-reserve`, set by the music mini player). The page has its own scroller
 * that does not chain to the document, so anything under the bar could never be scrolled into view.
 */
export const heightBelow = (top: number, min = 0) => `max(${min}px, calc(${Math.floor(window.innerHeight - top)}px - var(--page-bottom-reserve, 0px)))`

/** Sizes `ref` to the space left below its top edge (the shell adds a top bar on phones). */
export function useFitViewport(ref: RefObject<HTMLElement | null>, active = true) {
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const fit = () => {
      el.style.height = heightBelow(el.getBoundingClientRect().top + window.scrollY)
    }
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [ref, active])
}
