// Mouse drag-scroll for a horizontally scrolling row: press, pull sideways, release. The TV has no pointer; on
// the web a row also scrolls with the wheel, a trackpad, a finger and its arrow buttons (ItemRow).

/** Pointer travel before a mouse press becomes a drag instead of a click (CSS pixels, like the guide's). */
export const DRAG_SLOP_PX = 6

/**
 * Lets the mouse drag `el` sideways. Mouse only: a finger and a pen pan natively. A press that moved less than
 * the slop stays a click; after a drag the click that ends the press is swallowed, so the card under the
 * pointer is not opened. Cards are links, which the browser would otherwise pick up as a drag-and-drop item
 * after a few pixels (ending the pointer events): that is cancelled while the row can scroll.
 * Returns the undo.
 */
export function installDragScroll(el: HTMLElement): () => void {
  let press: { x: number; left: number; id: number; active: boolean } | null = null
  let swallowClick = false

  const canScroll = () => el.scrollWidth > el.clientWidth + 1
  const onDown = (e: PointerEvent) => {
    // a press starts a new gesture: a click that never came (released outside the window) is not owed any more
    swallowClick = false
    press = e.pointerType === 'mouse' && e.button === 0 && canScroll() ? { x: e.clientX, left: el.scrollLeft, id: e.pointerId, active: false } : null
  }
  const onMove = (e: PointerEvent) => {
    const p = press
    if (!p || p.id !== e.pointerId) return
    const dx = e.clientX - p.x
    if (!p.active) {
      if (Math.abs(dx) < DRAG_SLOP_PX) return
      p.active = true
      el.setAttribute('data-dragging', '')
      // keeps the drag going when the pointer leaves the row
      el.setPointerCapture?.(e.pointerId)
    }
    // scrollLeft runs the other way in right-to-left rows (0 .. negative); the same subtraction serves both
    el.scrollLeft = p.left - dx
  }
  const onEnd = (e: PointerEvent) => {
    const p = press
    if (!p || p.id !== e.pointerId) return
    press = null
    if (!p.active) return
    el.removeAttribute('data-dragging')
    swallowClick = e.type === 'pointerup'
  }
  const onClick = (e: MouseEvent) => {
    if (!swallowClick) return
    swallowClick = false
    e.preventDefault()
    e.stopPropagation()
  }
  const onDragStart = (e: DragEvent) => {
    if (press) e.preventDefault()
  }

  el.addEventListener('pointerdown', onDown)
  el.addEventListener('pointermove', onMove)
  el.addEventListener('pointerup', onEnd)
  el.addEventListener('pointercancel', onEnd)
  el.addEventListener('click', onClick, true)
  el.addEventListener('dragstart', onDragStart)
  return () => {
    el.removeEventListener('pointerdown', onDown)
    el.removeEventListener('pointermove', onMove)
    el.removeEventListener('pointerup', onEnd)
    el.removeEventListener('pointercancel', onEnd)
    el.removeEventListener('click', onClick, true)
    el.removeEventListener('dragstart', onDragStart)
    el.removeAttribute('data-dragging')
  }
}
