import { describe, expect, it } from 'vitest'
import { pickInView } from './fullPageFocus'

const view = { top: 100, bottom: 500 }

describe('pickInView', () => {
  it('picks the topmost fully visible element, or the bottommost for Up', () => {
    const items = [
      { top: 0, bottom: 40 }, // scrolled away under the header
      { top: 90, bottom: 140 }, // half hidden
      { top: 150, bottom: 200 },
      { top: 300, bottom: 350 },
      { top: 480, bottom: 530 }, // cut at the bottom
      { top: 900, bottom: 950 },
    ]
    expect(pickInView(items, view, false)).toBe(2)
    expect(pickInView(items, view, true)).toBe(3)
  })

  it('falls back to the element that shows most of itself, and -1 when nothing is in view', () => {
    expect(pickInView([{ top: 50, bottom: 120 }, { top: 450, bottom: 600 }], view, false)).toBe(1)
    expect(pickInView([{ top: 0, bottom: 100 }, { top: 500, bottom: 600 }], view, false)).toBe(-1)
    expect(pickInView([], view, true)).toBe(-1)
  })
})
