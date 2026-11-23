import { act, cleanup, render } from '@testing-library/react'
import { useState } from 'react'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { setUserScale } from '../../theme/scale'
import { TOUCH_SLOP_DP } from '../lib/touchIntent'
import { Slider } from './Slider'

// jsdom lays nothing out and has no pointer capture: the rail is 200px wide from x = 100, and capture is a set
const RAIL = { left: 100, width: 200 }
const captured = new Set<number>()
const proto = HTMLElement.prototype as unknown as Record<string, unknown>
let rects: ReturnType<typeof vi.spyOn>
beforeAll(() => {
  rects = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => new DOMRect(RAIL.left, 50, RAIL.width, 6))
  proto.setPointerCapture = (id: number) => void captured.add(id)
  proto.hasPointerCapture = (id: number) => captured.has(id)
})
afterAll(() => {
  rects.mockRestore()
  delete proto.setPointerCapture
  delete proto.hasPointerCapture
})
afterEach(() => {
  cleanup()
  captured.clear()
  setUserScale(1)
  document.documentElement.removeAttribute('dir')
})

const changes: number[] = []
function Harness({ start = 20 }: { start?: number }) {
  const [value, setValue] = useState(start)
  return (
    <Slider
      label="Size"
      value={value}
      min={0}
      max={100}
      onChange={(v) => {
        changes.push(v)
        setValue(v)
      }}
    />
  )
}

function setup(start?: number) {
  changes.length = 0
  render(<Harness start={start} />)
  const slider = document.querySelector<HTMLElement>('[role="slider"]')!
  const value = () => Number(slider.getAttribute('aria-valuenow'))
  /** x of a value on the rail */
  const at = (v: number) => RAIL.left + (RAIL.width * v) / 100
  const pointer = (type: string, pointerType: string, x: number, y = 53, pointerId = pointerType === 'mouse' ? 1 : 7) => {
    const e = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 })
    Object.assign(e, { pointerType, pointerId, isPrimary: true })
    act(() => void slider.dispatchEvent(e))
    if (type === 'pointerup' || type === 'pointercancel') captured.delete(pointerId)
  }
  return { slider, value, at, pointer }
}

describe.each(['touch', 'pen'])('Slider under a %s (a pointer that scrolls the page by dragging)', (type) => {
  it('a finger that lands on it changes nothing', () => {
    const { value, at, pointer } = setup()
    pointer('pointerdown', type, at(80))
    expect(value()).toBe(20)
    expect(changes).toEqual([])
    expect(captured.size).toBe(0)
  })

  it('moving up or down changes nothing, also when the browser never takes the gesture (nothing to scroll)', () => {
    const { value, at, pointer } = setup()
    pointer('pointerdown', type, at(80), 53)
    for (let y = 53; y >= -167; y -= 20) pointer('pointermove', type, at(80) + (53 - y) / 10, y)
    // a late sideways turn of a gesture that began as a scroll is still not the slider's
    pointer('pointermove', type, at(80) - 150, -167)
    pointer('pointerup', type, at(80) - 150, -167)
    expect(value()).toBe(20)
    expect(changes).toEqual([])
    expect(captured.size).toBe(0)
  })

  it('a slightly diagonal scroll changes nothing', () => {
    const { value, at, pointer } = setup()
    pointer('pointerdown', type, at(80), 53)
    for (let i = 1; i <= 11; i++) pointer('pointermove', type, at(80) - 6 * i, 53 - 20 * i)
    pointer('pointerup', type, at(80) - 66, -167)
    expect(value()).toBe(20)
    expect(changes).toEqual([])
  })

  it('pointercancel (the browser pans the page) changes nothing', () => {
    const { value, at, pointer } = setup()
    pointer('pointerdown', type, at(80), 53)
    pointer('pointermove', type, at(80) + 2, 45)
    pointer('pointercancel', type, 0, 0)
    // what the cancelled pointer does afterwards is not a tap
    pointer('pointerup', type, at(80), 53)
    expect(value()).toBe(20)
    expect(changes).toEqual([])
  })

  it('a sideways drag past the slop takes the slider: it captures the pointer and the value follows the finger', () => {
    const { value, at, pointer } = setup()
    pointer('pointerdown', type, at(50))
    pointer('pointermove', type, at(50) + TOUCH_SLOP_DP)
    expect(value()).toBe(20)
    expect(captured.size).toBe(0)
    // absolute: the thumb jumps under the finger
    pointer('pointermove', type, at(50) + TOUCH_SLOP_DP + 1, 55)
    expect(captured.has(7)).toBe(true)
    expect(value()).toBe(Math.round(((TOUCH_SLOP_DP + 1) / RAIL.width) * 100) + 50)
    pointer('pointermove', type, at(90), 120)
    expect(value()).toBe(90)
    pointer('pointermove', type, at(35), 10)
    expect(value()).toBe(35)
    pointer('pointerup', type, at(35), 10)
    expect(value()).toBe(35)
    // the release ends it
    pointer('pointermove', type, at(70))
    expect(value()).toBe(35)
  })

  it('a drag the browser takes back restores the value it started from', () => {
    const { value, at, pointer } = setup()
    pointer('pointerdown', type, at(50))
    pointer('pointermove', type, at(70))
    expect(value()).toBe(70)
    pointer('pointercancel', type, 0, 0)
    expect(value()).toBe(20)
  })

  it('a tap sets the value at that point, on release', () => {
    const { value, at, pointer } = setup()
    pointer('pointerdown', type, at(60))
    pointer('pointermove', type, at(60) + 3, 50)
    expect(value()).toBe(20)
    pointer('pointerup', type, at(60) + 2, 51)
    expect(value()).toBe(61)
    expect(changes).toEqual([61])
  })

  it('the slop grows with the interface scale', () => {
    setUserScale(2)
    const { value, at, pointer } = setup()
    pointer('pointerdown', type, at(50))
    pointer('pointermove', type, at(50) + TOUCH_SLOP_DP * 2)
    expect(value()).toBe(20)
    pointer('pointermove', type, at(50) + TOUCH_SLOP_DP * 2 + 1)
    expect(value()).not.toBe(20)
  })

  it('right to left: the drag and the tap are mirrored', () => {
    document.documentElement.setAttribute('dir', 'rtl')
    const { slider, value, at, pointer } = setup()
    slider.style.direction = 'rtl'
    ;(slider.firstElementChild as HTMLElement).style.direction = 'rtl'
    pointer('pointerdown', type, at(50))
    pointer('pointermove', type, at(90))
    expect(value()).toBe(10)
    pointer('pointerup', type, at(90))
    pointer('pointerdown', type, at(25))
    pointer('pointerup', type, at(25))
    expect(value()).toBe(75)
  })

  it('a disabled slider ignores the tap and the drag', () => {
    changes.length = 0
    render(<Slider label="Size" value={20} min={0} max={100} disabled onChange={(v) => changes.push(v)} />)
    const slider = document.querySelector<HTMLElement>('[role="slider"]')!
    const send = (t: string, x: number) => {
      const e = new MouseEvent(t, { bubbles: true, cancelable: true, clientX: x, clientY: 53, button: 0 })
      Object.assign(e, { pointerType: type, pointerId: 7, isPrimary: true })
      act(() => void slider.dispatchEvent(e))
    }
    send('pointerdown', 150)
    send('pointermove', 250)
    send('pointerup', 250)
    expect(changes).toEqual([])
  })
})

describe('Slider under the mouse (unchanged)', () => {
  // the browser's own answers to a press: with the page's selection over the slider (a double click on it, select
  // all) it dragged the selection away, the pointer events ended and the cursor showed "not allowed"
  it('while the mouse is down on it, no drag-and-drop and no text selection begins, on the slider or beside it', () => {
    const { slider, at, pointer } = setup()
    const beside = document.body.appendChild(document.createElement('p'))
    const refused = (type: string, on: Element) => !on.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }))
    const parts = [slider, ...slider.querySelectorAll('*'), beside]
    expect(parts.length).toBe(6)
    pointer('pointerdown', 'mouse', at(60))
    pointer('pointermove', 'mouse', at(70))
    for (const part of parts) {
      expect(refused('dragstart', part), `dragstart on ${part.className || part.tagName}`).toBe(true)
      expect(refused('selectstart', part), `selectstart on ${part.className || part.tagName}`).toBe(true)
    }
    pointer('pointerup', 'mouse', at(70))
    // released: the page is the browser's again
    for (const part of parts) {
      expect(refused('dragstart', part)).toBe(false)
      expect(refused('selectstart', part)).toBe(false)
    }
    // and the press itself always was: it is what moves focus to the slider
    expect(refused('mousedown', slider)).toBe(false)
    beside.remove()
  })

  it('a press sets the value at once and captures the pointer; the drag follows', () => {
    const { value, at, pointer } = setup()
    pointer('pointerdown', 'mouse', at(80))
    expect(value()).toBe(80)
    expect(captured.has(1)).toBe(true)
    // no slop, and up-and-down travel is of no account
    pointer('pointermove', 'mouse', at(81), 300)
    expect(value()).toBe(81)
    pointer('pointermove', 'mouse', at(40), 300)
    expect(value()).toBe(40)
    pointer('pointerup', 'mouse', at(40), 300)
    // a hover without a press does nothing
    pointer('pointermove', 'mouse', at(10))
    expect(value()).toBe(40)
  })

  it('a secondary button does nothing', () => {
    const { slider, value } = setup()
    const e = new MouseEvent('pointerdown', { bubbles: true, clientX: 250, clientY: 53, button: 2 })
    Object.assign(e, { pointerType: 'mouse', pointerId: 1, isPrimary: true })
    act(() => void slider.dispatchEvent(e))
    expect(value()).toBe(20)
  })
})

// `onDragValue`: for a value that re-lays out the page (the interface scale). `drags` is what the slider reports
// while a pointer is down, `changes` what it applies.
const drags: Array<number | null> = []
function ReleaseHarness({ start = 20, rtl = false }: { start?: number; rtl?: boolean }) {
  const [value, setValue] = useState(start)
  const [dragged, setDragged] = useState<number | null>(null)
  return (
    <div style={rtl ? { direction: 'rtl' } : undefined}>
      <Slider
        label="Size"
        value={value}
        min={0}
        max={100}
        valueText={`${dragged ?? value}%`}
        onChange={(v) => {
          changes.push(v)
          setValue(v)
        }}
        onDragValue={(v) => {
          drags.push(v)
          setDragged(v)
        }}
      />
    </div>
  )
}

function setupRelease(props: { start?: number; rtl?: boolean } = {}) {
  changes.length = 0
  drags.length = 0
  render(<ReleaseHarness {...props} />)
  const slider = document.querySelector<HTMLElement>('[role="slider"]')!
  const value = () => Number(slider.getAttribute('aria-valuenow'))
  const thumb = () => (slider.querySelector('span:last-child') as HTMLElement).style.insetInlineStart
  const at = (v: number) => RAIL.left + (RAIL.width * v) / 100
  const pointer = (type: string, pointerType: string, x: number, y = 53, pointerId = pointerType === 'mouse' ? 1 : 7) => {
    const e = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 })
    Object.assign(e, { pointerType, pointerId, isPrimary: true })
    act(() => void slider.dispatchEvent(e))
    if (type === 'pointerup' || type === 'pointercancel') {
      // the browser releases the capture after the event and says so
      if (captured.delete(pointerId)) act(() => void slider.dispatchEvent(new MouseEvent('lostpointercapture', { bubbles: true })))
    }
  }
  const key = (k: string) => act(() => void slider.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })))
  return { slider, value, thumb, at, pointer, key }
}

describe('Slider that applies at the release (onDragValue)', () => {
  it('a mouse drag is shown and reported but not applied; the release applies it once', () => {
    const { slider, value, thumb, at, pointer } = setupRelease()
    pointer('pointerdown', 'mouse', at(60))
    expect(captured.has(1)).toBe(true)
    pointer('pointermove', 'mouse', at(61), 300)
    pointer('pointermove', 'mouse', at(61), 310)
    pointer('pointermove', 'mouse', at(85), 300)
    // the thumb and the value for screen readers follow the pointer
    expect(value()).toBe(85)
    expect(thumb()).toBe('85%')
    expect(slider.getAttribute('aria-valuetext')).toBe('85%')
    expect(drags).toEqual([60, 61, 85])
    expect(changes).toEqual([])
    pointer('pointerup', 'mouse', at(85), 300)
    expect(changes).toEqual([85])
    expect(drags).toEqual([60, 61, 85, null])
    expect(value()).toBe(85)
    // the release ended it
    pointer('pointermove', 'mouse', at(10))
    expect(value()).toBe(85)
    expect(changes).toEqual([85])
  })

  it('a click on the track applies on the release, once', () => {
    const { value, at, pointer } = setupRelease()
    pointer('pointerdown', 'mouse', at(70))
    expect(value()).toBe(70)
    expect(changes).toEqual([])
    pointer('pointerup', 'mouse', at(70))
    expect(changes).toEqual([70])
    expect(drags).toEqual([70, null])
  })

  it('a drag that ends on the value the slider has applies nothing', () => {
    const { value, at, pointer } = setupRelease()
    pointer('pointerdown', 'mouse', at(60))
    pointer('pointermove', 'mouse', at(20))
    pointer('pointerup', 'mouse', at(20))
    expect(changes).toEqual([])
    expect(drags).toEqual([60, 20, null])
    expect(value()).toBe(20)
  })

  it('a cancelled mouse drag applies nothing and shows the applied value again', () => {
    const { value, thumb, at, pointer } = setupRelease()
    pointer('pointerdown', 'mouse', at(60))
    pointer('pointermove', 'mouse', at(90))
    expect(value()).toBe(90)
    pointer('pointercancel', 'mouse', 0, 0)
    expect(changes).toEqual([])
    expect(drags).toEqual([60, 90, null])
    expect(value()).toBe(20)
    expect(thumb()).toBe('20%')
    pointer('pointerup', 'mouse', at(90))
    expect(changes).toEqual([])
  })

  it('a capture that is lost without a release or a cancel applies nothing', () => {
    const { slider, value, at, pointer } = setupRelease()
    pointer('pointerdown', 'mouse', at(60))
    pointer('pointermove', 'mouse', at(90))
    captured.clear()
    act(() => void slider.dispatchEvent(new MouseEvent('lostpointercapture', { bubbles: true })))
    expect(value()).toBe(20)
    expect(changes).toEqual([])
    expect(drags).toEqual([60, 90, null])
  })

  it.each(['touch', 'pen'])('a %s drag past the slop is shown and reported, and applied once when it lifts', (type) => {
    const { value, thumb, at, pointer } = setupRelease()
    pointer('pointerdown', type, at(50))
    pointer('pointermove', type, at(50) + TOUCH_SLOP_DP)
    expect(drags).toEqual([])
    pointer('pointermove', type, at(70), 55)
    pointer('pointermove', type, at(90), 120)
    pointer('pointermove', type, at(35), 10)
    expect(value()).toBe(35)
    expect(thumb()).toBe('35%')
    expect(drags).toEqual([70, 90, 35])
    expect(changes).toEqual([])
    pointer('pointerup', type, at(35), 10)
    expect(changes).toEqual([35])
    expect(drags).toEqual([70, 90, 35, null])
    expect(value()).toBe(35)
  })

  it.each(['touch', 'pen'])('a %s drag the browser takes back applies nothing', (type) => {
    const { value, at, pointer } = setupRelease()
    pointer('pointerdown', type, at(50))
    pointer('pointermove', type, at(70))
    expect(value()).toBe(70)
    pointer('pointercancel', type, 0, 0)
    expect(value()).toBe(20)
    expect(changes).toEqual([])
    expect(drags).toEqual([70, null])
    // what the cancelled pointer does afterwards is not a tap
    pointer('pointerup', type, at(70))
    expect(changes).toEqual([])
  })

  it.each(['touch', 'pen'])('a %s tap applies on the release, once; a scroll that starts on it nothing', (type) => {
    const { value, at, pointer } = setupRelease()
    pointer('pointerdown', type, at(80), 53)
    for (let y = 53; y >= -167; y -= 20) pointer('pointermove', type, at(80), y)
    pointer('pointerup', type, at(80), -167)
    expect(changes).toEqual([])
    expect(drags).toEqual([])
    pointer('pointerdown', type, at(60))
    expect(value()).toBe(20)
    pointer('pointerup', type, at(60) + 2, 51)
    expect(changes).toEqual([61])
    expect(drags).toEqual([])
    expect(value()).toBe(61)
  })

  it('right to left: the pending value is mirrored like the applied one', () => {
    const { slider, value, at, pointer } = setupRelease({ rtl: true })
    ;(slider.firstElementChild as HTMLElement).style.direction = 'rtl'
    pointer('pointerdown', 'mouse', at(90))
    expect(value()).toBe(10)
    pointer('pointermove', 'mouse', at(25))
    expect(value()).toBe(75)
    expect(changes).toEqual([])
    pointer('pointerup', 'mouse', at(25))
    expect(changes).toEqual([75])
  })

  it('keys apply every step at once, as on the TV', () => {
    const { value, key } = setupRelease()
    key('ArrowRight')
    key('ArrowRight')
    key('End')
    key('Home')
    expect(changes).toEqual([21, 22, 100, 0])
    expect(drags).toEqual([])
    expect(value()).toBe(0)
  })
})

describe('Slider keyboard (unchanged)', () => {
  it('arrows step, Home and End jump', () => {
    const { slider, value } = setup()
    const key = (k: string) => act(() => void slider.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })))
    key('ArrowRight')
    expect(value()).toBe(21)
    key('ArrowLeft')
    key('ArrowLeft')
    expect(value()).toBe(19)
    key('End')
    expect(value()).toBe(100)
    key('Home')
    expect(value()).toBe(0)
  })
})
