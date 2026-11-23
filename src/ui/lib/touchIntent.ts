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

/**
 * A press on a control that follows the pointer by itself (a slider, a seek bar) belongs to the control alone.
 * Left to the browser, the press also starts a text selection there (a double click on a slider selects the line
 * break or the word beside it), and a press on a control that the page's selection covers (that double click,
 * select all, a selection dragged over the row) drags the selection away instead: the pointer events end in a
 * pointercancel (WebKit: they just stop) and the cursor shows "not allowed".
 *
 * From the press to its release both are refused, on the whole page and not only on the control: the browser
 * looks up what to drag at the point of the press once the pointer has moved, and by then the control can have
 * moved from under that point (the value text beside a slider changes width with the value), so the drag would
 * begin on the selected text next to it; Firefox likewise begins a double click's selection on the word beside
 * the control. Focus on press stays the browser's own, which cancelling the press itself (mousedown /
 * pointerdown) would take away. `user-select: none` on the control would not do: the drag of a selection made
 * elsewhere remains, and WebKit lets a selection begin inside such an element.
 * Native listeners (React has no `onSelectStart`). Returns the undo.
 */
export function keepPressToControl(el: HTMLElement): () => void {
  const page = el.ownerDocument
  const view = page.defaultView
  const refuse = (e: Event) => e.preventDefault()
  const release = () => {
    for (const type of ['dragstart', 'selectstart']) page.removeEventListener(type, refuse, true)
    // a release outside the window may never be told: the next press anywhere ends it as well, and so does the
    // window losing focus
    for (const type of ['pointerup', 'pointercancel', 'pointerdown']) page.removeEventListener(type, release, true)
    view?.removeEventListener('blur', release)
  }
  const press = (e: PointerEvent) => {
    if (e.button !== 0) return
    for (const type of ['dragstart', 'selectstart']) page.addEventListener(type, refuse, true)
    for (const type of ['pointerup', 'pointercancel', 'pointerdown']) page.addEventListener(type, release, true)
    view?.addEventListener('blur', release)
  }
  el.addEventListener('pointerdown', press)
  return () => {
    el.removeEventListener('pointerdown', press)
    release()
  }
}
