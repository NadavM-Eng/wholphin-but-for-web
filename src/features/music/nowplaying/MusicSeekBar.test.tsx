import { act, cleanup, render } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { MusicSeekBar } from './MusicSeekBar'

// jsdom has no pointer capture
const proto = HTMLElement.prototype as unknown as Record<string, unknown>
beforeAll(() => {
  proto.setPointerCapture = () => {}
})
afterAll(() => {
  delete proto.setPointerCapture
})
afterEach(cleanup)

describe('the Now Playing seek bar under the mouse', () => {
  // with the page's selection over the bar (select all: the page has titles and lyrics) the browser dragged the
  // selection away instead: the pointer events ended in a pointercancel and the cursor showed "not allowed"
  it('while the mouse is down on it, no drag-and-drop and no text selection begins, on the bar or beside it', () => {
    render(<MusicSeekBar positionMs={5_000} durationMs={20_000} bufferedMs={10_000} onSeek={() => {}} onInteract={() => {}} stepBackMs={10_000} stepForwardMs={30_000} />)
    const bar = document.querySelector<HTMLElement>('[role="slider"]')!
    const beside = document.body.appendChild(document.createElement('p'))
    const refused = (type: string, on: Element) => !on.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }))
    const pointer = (type: string) => bar.dispatchEvent(Object.assign(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: 40 }), { pointerId: 1, pointerType: 'mouse' }))
    const parts = [bar, ...bar.querySelectorAll('*'), beside]
    expect(parts.length).toBe(6)
    act(() => void pointer('pointerdown'))
    for (const part of parts) {
      expect(refused('dragstart', part), `dragstart on ${part.className || part.tagName}`).toBe(true)
      expect(refused('selectstart', part), `selectstart on ${part.className || part.tagName}`).toBe(true)
    }
    act(() => void pointer('pointerup'))
    // released: the page is the browser's again
    for (const part of parts) {
      expect(refused('dragstart', part)).toBe(false)
      expect(refused('selectstart', part)).toBe(false)
    }
    // and the press itself always was: it is what moves focus to the bar
    expect(refused('mousedown', bar)).toBe(false)
    beside.remove()
  })
})
