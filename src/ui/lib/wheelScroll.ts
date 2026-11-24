// Mouse-wheel scrolling of a horizontal row: a wheel turns up and down, the row runs sideways. For rows where the
// wheel is meant to move the row itself (the episode strip: owner request). The TV has no wheel.

/** How far one unit of wheel travel moves the row: a notch (100 CSS px in Chromium) is about one episode card. */
export const WHEEL_GAIN = 2

/** Lines to pixels for wheels that report lines (Firefox). */
const LINE_PX = 40

/** A wheel event's parts this module reads. */
export type WheelLike = Pick<WheelEvent, 'deltaX' | 'deltaY' | 'deltaMode' | 'ctrlKey' | 'shiftKey'>

/**
 * True for the notch of a mouse wheel turned up or down. Not for the fine steps of a trackpad (it pans sideways by
 * itself, and its up-and-down swipes stay the page's), not with Shift (the browser scrolls sideways itself) and not
 * with Ctrl (zoom).
 */
export function isMouseWheelNotch(e: WheelLike): boolean {
  if (e.ctrlKey || e.shiftKey) return false
  if (Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return false
  return e.deltaMode !== 0 || Math.abs(e.deltaY) >= 50
}

/**
 * Where the row should be after this wheel event, as a distance from its start (0 .. `max`), or null when the
 * event is not for the row: not a mouse wheel notch, or the row is already at the end the wheel turns towards
 * (the page then scrolls as usual).
 */
export function wheelTarget(e: WheelLike, from: number, max: number, page: number): number | null {
  if (max <= 1 || !isMouseWheelNotch(e)) return null
  const px = e.deltaMode === 1 ? e.deltaY * LINE_PX : e.deltaMode === 2 ? e.deltaY * page : e.deltaY
  const to = Math.min(max, Math.max(0, from + px * WHEEL_GAIN))
  return Math.abs(to - from) < 1 ? null : to
}

/**
 * Lets the mouse wheel move `el` sideways (down = towards the end, in both writing directions). The row glides to
 * its target unless the person asked for reduced motion; quick notches add up. At either end the wheel is left to
 * the page. Returns the undo.
 */
export function installWheelScroll(el: HTMLElement): () => void {
  // the place the row is gliding to, while it glides: the next notch counts from there, not from where it is now
  let target: number | null = null
  let settle: ReturnType<typeof setTimeout> | undefined
  const onWheel = (e: WheelEvent) => {
    const max = el.scrollWidth - el.clientWidth
    const to = wheelTarget(e, target ?? Math.abs(el.scrollLeft), max, el.clientWidth)
    if (to == null) return
    e.preventDefault()
    target = to
    // scrollLeft runs 0 .. negative in a right-to-left row
    const rtl = getComputedStyle(el).direction === 'rtl'
    const smooth = typeof matchMedia !== 'function' || !matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollTo({ left: rtl ? -to : to, behavior: smooth ? 'smooth' : 'auto' })
    clearTimeout(settle)
    settle = setTimeout(() => (target = null), 250)
  }
  // not passive: the page must not scroll for a notch the row takes
  el.addEventListener('wheel', onWheel, { passive: false })
  return () => {
    el.removeEventListener('wheel', onWheel)
    clearTimeout(settle)
  }
}
