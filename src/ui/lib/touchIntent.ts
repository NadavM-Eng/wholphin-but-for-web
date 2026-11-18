// A finger (or pen) that lands on a draggable control inside a scrolling page: is it scrolling the page past the
// control, or does it mean the control? The TV has no touch; this is the web's answer for sliders and handles.

/**
 * Finger travel, in dp, before a touch on a draggable control is read as a gesture (Android's touch slop is 8dp,
 * iOS uses about 10pt). Not smaller than the browsers' own slop, so the browser has normally decided whether it
 * pans the page before the control reacts. Convert with `dp()` from src/theme/scale.
 */
export const TOUCH_SLOP_DP = 10

/**
 * `undecided`: still inside the slop (a release here is a tap). `side`: a deliberate sideways drag, further
 * sideways than up or down. `scroll`: the finger went up or down, which is the page's (with `touch-action: pan-y`
 * the browser pans and sends pointercancel; where nothing can scroll no cancel comes, and the control still stays
 * out of it).
 */
export type TouchIntent = 'undecided' | 'side' | 'scroll'

/** Reads the travel of a touch since it went down (`dx`, `dy` in CSS pixels, any sign) against `slop` pixels. */
export function touchIntent(dx: number, dy: number, slop: number): TouchIntent {
  const ax = Math.abs(dx)
  const ay = Math.abs(dy)
  if (ax > slop && ax > ay) return 'side'
  if (ay > slop && ay >= ax) return 'scroll'
  return 'undecided'
}

/** True for the pointers that pan a page by dragging on it (a mouse does not). */
export const pansByDragging = (pointerType: string) => pointerType === 'touch' || pointerType === 'pen'
