export type Span = { top: number; bottom: number }

/**
 * Which of a FullPage's focusable elements an arrow key on the page itself hands focus to: the element the
 * reader is looking at, never one scrolled out of view. Fully visible elements win (the topmost one, or the
 * bottommost for Up); else the one that shows the most of itself. -1 when nothing is in view.
 */
export function pickInView(items: readonly Span[], view: Span, up: boolean): number {
  let best = -1
  let bestShown = 0
  items.forEach((r, i) => {
    const shown = Math.min(r.bottom, view.bottom) - Math.max(r.top, view.top)
    if (shown <= 0) return
    const full = r.top >= view.top && r.bottom <= view.bottom
    const score = full ? Number.POSITIVE_INFINITY : shown
    // items arrive in document order: for Up a later fully visible item replaces an earlier one
    if (score > bestShown || (up && full && score === bestShown)) {
      best = i
      bestShown = score
    }
  })
  return best
}
