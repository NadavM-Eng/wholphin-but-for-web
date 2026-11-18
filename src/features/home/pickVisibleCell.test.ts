import { describe, expect, it } from 'vitest'
import { firstPartlyVisible, fullyInView, pickVisibleCell } from './pickVisibleCell'

const cell = (index: number, top: number, bottom: number) => ({
  index,
  getAttribute: (n: string) => (n === 'data-grid-index' ? String(index) : null),
  getBoundingClientRect: () => ({ top, bottom }),
})
const view = { top: 0, bottom: 700 }

describe('pickVisibleCell', () => {
  it('takes the preferred cell when it is in view', () => {
    const cells = [cell(0, 100, 300), cell(6, 320, 520)]
    expect(pickVisibleCell(cells, 6, view)?.index).toBe(6)
  })

  it('falls back to the first fully visible cell by index', () => {
    const cells = [cell(12, 500, 760), cell(7, 300, 480), cell(1, -100, 90), cell(6, 300, 480)]
    expect(pickVisibleCell(cells, 12, view)?.index).toBe(6)
  })

  it('returns nothing when no cell is fully visible', () => {
    expect(pickVisibleCell([cell(0, -50, 150), cell(1, 0, 0)], 0, view)).toBeUndefined()
  })
})

describe('firstPartlyVisible', () => {
  it('takes the first cell by index with any part in view', () => {
    const cells = [cell(7, 400, 760), cell(6, 400, 760), cell(0, -60, 150), cell(1, -60, 150)]
    expect(firstPartlyVisible(cells, view)?.index).toBe(0)
  })

  it('skips cells wholly outside the viewport and empty boxes', () => {
    expect(firstPartlyVisible([cell(0, -300, -10), cell(1, 0, 0), cell(12, 720, 900), cell(6, 650, 900)], view)?.index).toBe(6)
    expect(firstPartlyVisible([cell(0, -300, -10)], view)).toBeUndefined()
  })
})

describe('fullyInView', () => {
  it('allows a pixel of rounding at both edges', () => {
    expect(fullyInView({ top: -0.5, bottom: 700.5 }, view)).toBe(true)
    expect(fullyInView({ top: -54, bottom: 158 }, view)).toBe(false)
    expect(fullyInView({ top: 600, bottom: 760 }, view)).toBe(false)
  })
})
