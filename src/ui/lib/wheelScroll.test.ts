import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installWheelScroll, isMouseWheelNotch, WHEEL_GAIN, wheelTarget, type WheelLike } from './wheelScroll'

const wheel = (over: Partial<WheelLike>): WheelLike => ({ deltaX: 0, deltaY: 0, deltaMode: 0, ctrlKey: false, shiftKey: false, ...over })

describe('a mouse wheel over a horizontal row', () => {
  it('takes a notch turned up or down, and leaves trackpad steps, sideways turns, Shift and Ctrl alone', () => {
    expect(isMouseWheelNotch(wheel({ deltaY: 100 }))).toBe(true)
    expect(isMouseWheelNotch(wheel({ deltaY: -125 }))).toBe(true)
    // lines (Firefox)
    expect(isMouseWheelNotch(wheel({ deltaY: 3, deltaMode: 1 }))).toBe(true)
    // the fine steps of a trackpad
    expect(isMouseWheelNotch(wheel({ deltaY: 4 }))).toBe(false)
    expect(isMouseWheelNotch(wheel({ deltaY: 30 }))).toBe(false)
    // sideways already
    expect(isMouseWheelNotch(wheel({ deltaX: 120, deltaY: 100 }))).toBe(false)
    expect(isMouseWheelNotch(wheel({ deltaY: 100, shiftKey: true }))).toBe(false)
    expect(isMouseWheelNotch(wheel({ deltaY: 100, ctrlKey: true }))).toBe(false)
  })

  it('moves the row by the wheel travel times the gain, inside its ends', () => {
    expect(wheelTarget(wheel({ deltaY: 100 }), 0, 1200, 800)).toBe(100 * WHEEL_GAIN)
    expect(wheelTarget(wheel({ deltaY: -100 }), 500, 1200, 800)).toBe(500 - 100 * WHEEL_GAIN)
    expect(wheelTarget(wheel({ deltaY: 100 }), 1100, 1200, 800)).toBe(1200)
    expect(wheelTarget(wheel({ deltaY: 3, deltaMode: 1 }), 0, 1200, 800)).toBe(3 * 40 * WHEEL_GAIN)
    expect(wheelTarget(wheel({ deltaY: 1, deltaMode: 2 }), 0, 5000, 800)).toBe(800 * WHEEL_GAIN)
  })

  it('leaves the wheel to the page at the end it turns towards, and when the row cannot scroll', () => {
    expect(wheelTarget(wheel({ deltaY: 100 }), 1200, 1200, 800)).toBeNull()
    expect(wheelTarget(wheel({ deltaY: -100 }), 0, 1200, 800)).toBeNull()
    expect(wheelTarget(wheel({ deltaY: 100 }), 0, 0, 800)).toBeNull()
    expect(wheelTarget(wheel({ deltaY: 4 }), 300, 1200, 800)).toBeNull()
  })
})

describe('installWheelScroll', () => {
  let row: HTMLElement
  let undo: () => void
  let scrolled: Array<{ left: number; behavior?: string }>
  const fire = (deltaY: number) => {
    const e = new WheelEvent('wheel', { deltaY, bubbles: true, cancelable: true })
    row.dispatchEvent(e)
    return e
  }
  beforeEach(() => {
    vi.useFakeTimers()
    document.body.innerHTML = '<div id="row"></div>'
    row = document.getElementById('row')!
    Object.defineProperty(row, 'scrollWidth', { configurable: true, value: 2000 })
    Object.defineProperty(row, 'clientWidth', { configurable: true, value: 800 })
    scrolled = []
    row.scrollTo = ((o: { left: number; behavior?: string }) => {
      scrolled.push(o)
    }) as typeof row.scrollTo
    undo = installWheelScroll(row)
  })
  afterEach(() => {
    undo()
    vi.useRealTimers()
    document.body.innerHTML = ''
  })

  it('a notch moves the row and keeps the page still; quick notches add up while the row glides', () => {
    expect(fire(100).defaultPrevented).toBe(true)
    expect(fire(100).defaultPrevented).toBe(true)
    // the row itself has not moved yet (scrollLeft is still 0): the second notch counts from the first one's target
    expect(scrolled.map((s) => s.left)).toEqual([100 * WHEEL_GAIN, 200 * WHEEL_GAIN])
    // once it has settled, the next notch counts from where the row is
    vi.advanceTimersByTime(300)
    fire(100)
    expect(scrolled.at(-1)!.left).toBe(100 * WHEEL_GAIN)
  })

  it('at the start, a notch upwards is the page’s', () => {
    expect(fire(-100).defaultPrevented).toBe(false)
    expect(scrolled).toEqual([])
  })

  it('runs the other way in a right-to-left row', () => {
    row.style.direction = 'rtl'
    fire(100)
    expect(scrolled.at(-1)!.left).toBe(-100 * WHEEL_GAIN)
  })

  it('is gone after the undo', () => {
    undo()
    expect(fire(100).defaultPrevented).toBe(false)
  })
})
