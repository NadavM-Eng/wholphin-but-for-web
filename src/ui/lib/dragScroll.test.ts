import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DRAG_SLOP_PX, installDragScroll } from './dragScroll'

function pointer(type: string, target: Element, x: number, extra: Record<string, unknown> = {}) {
  const e = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, button: 0 })
  Object.assign(e, { pointerType: 'mouse', pointerId: 1, ...extra })
  target.dispatchEvent(e)
  return e
}

describe('mouse drag-scroll of a row', () => {
  let row: HTMLElement
  let card: HTMLElement
  let undo: () => void
  let clicks: number
  const size = (scrollWidth: number, clientWidth: number) => {
    Object.defineProperty(row, 'scrollWidth', { configurable: true, value: scrollWidth })
    Object.defineProperty(row, 'clientWidth', { configurable: true, value: clientWidth })
  }
  beforeEach(() => {
    document.body.innerHTML = '<div id="row"><a id="card" href="#">card</a></div>'
    row = document.getElementById('row')!
    card = document.getElementById('card')!
    size(2000, 800)
    clicks = 0
    card.addEventListener('click', (e) => {
      clicks++
      e.preventDefault()
    })
    undo = installDragScroll(row)
  })
  afterEach(() => {
    undo()
    document.body.innerHTML = ''
  })

  it('a press that pulls sideways scrolls the row and does not open the card', () => {
    pointer('pointerdown', card, 500)
    pointer('pointermove', card, 500 - (DRAG_SLOP_PX - 1))
    expect(row.scrollLeft).toBe(0)
    expect(row.hasAttribute('data-dragging')).toBe(false)
    pointer('pointermove', card, 380)
    expect(row.scrollLeft).toBe(120)
    expect(row.hasAttribute('data-dragging')).toBe(true)
    pointer('pointermove', card, 440)
    expect(row.scrollLeft).toBe(60)
    pointer('pointerup', card, 440)
    expect(row.hasAttribute('data-dragging')).toBe(false)
    const click = pointer('click', card, 440)
    expect(click.defaultPrevented).toBe(true)
    expect(clicks).toBe(0)
    // the next click is an ordinary one
    pointer('click', card, 440)
    expect(clicks).toBe(1)
  })

  it('a press that stays within the slop is a click', () => {
    pointer('pointerdown', card, 500)
    pointer('pointermove', card, 503)
    pointer('pointerup', card, 503)
    pointer('click', card, 503)
    expect(clicks).toBe(1)
    expect(row.scrollLeft).toBe(0)
  })

  it('a finger, another mouse button and a row that does not overflow are left alone', () => {
    pointer('pointerdown', card, 500, { pointerType: 'touch' })
    pointer('pointermove', card, 300, { pointerType: 'touch' })
    expect(row.scrollLeft).toBe(0)
    pointer('pointerup', card, 300, { pointerType: 'touch' })
    const right = new MouseEvent('pointerdown', { bubbles: true, clientX: 500, button: 2 })
    Object.assign(right, { pointerType: 'mouse', pointerId: 1 })
    card.dispatchEvent(right)
    pointer('pointermove', card, 300)
    expect(row.scrollLeft).toBe(0)
    pointer('pointerup', card, 300)
    size(800, 800)
    pointer('pointerdown', card, 500)
    pointer('pointermove', card, 300)
    pointer('pointerup', card, 300)
    pointer('click', card, 300)
    expect(row.scrollLeft).toBe(0)
    expect(clicks).toBe(1)
  })

  it('the browser may not pick the card up as a drag-and-drop item while the row can be dragged', () => {
    pointer('pointerdown', card, 500)
    const drag = new Event('dragstart', { bubbles: true, cancelable: true })
    card.dispatchEvent(drag)
    expect(drag.defaultPrevented).toBe(true)
    pointer('pointerup', card, 500)
    const later = new Event('dragstart', { bubbles: true, cancelable: true })
    card.dispatchEvent(later)
    expect(later.defaultPrevented).toBe(false)
  })

  it('a drag that ends without a click (cancelled, or released outside the window) does not swallow the next click', () => {
    pointer('pointerdown', card, 500)
    pointer('pointermove', card, 300)
    pointer('pointercancel', card, 300)
    pointer('click', card, 300)
    expect(clicks).toBe(1)
    pointer('pointerdown', card, 500)
    pointer('pointermove', card, 300)
    pointer('pointerup', card, 300)
    // no click came; a new press starts over
    pointer('pointerdown', card, 500)
    pointer('pointerup', card, 500)
    pointer('click', card, 500)
    expect(clicks).toBe(2)
  })
})
