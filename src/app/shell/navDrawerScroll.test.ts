import { describe, expect, it } from 'vitest'
import { pivotScrollTop } from '../../ui/lib/bringIntoView'

// The TV drawer list: 472dp viewport (540 - 64dp profile - 4dp gap), 56dp items every 60dp, 12 items.
const VIEW = 472
const CONTENT = 12 * 60 - 4

describe('the drawer list on the pivot rule (pivotScrollTop)', () => {
  it('leaves the list alone while the pivot is not reached', () => {
    expect(pivotScrollTop(0, 56, VIEW, CONTENT)).toBe(0) // Search
    expect(pivotScrollTop(60, 56, VIEW, CONTENT)).toBe(0) // Home
    expect(pivotScrollTop(120, 56, VIEW, CONTENT)).toBe(0) // Favorites: 120 < 141.6
  })

  it('puts the focused item 30% down the viewport (refshots 03-nav-drawer-library-focused: 98.4dp)', () => {
    expect(pivotScrollTop(240, 56, VIEW, CONTENT)).toBeCloseTo(98.4, 5) // Collections, the 5th item
    expect(pivotScrollTop(180, 56, VIEW, CONTENT)).toBeCloseTo(38.4, 5)
  })

  it('stops at the end of the list', () => {
    expect(pivotScrollTop(11 * 60, 56, VIEW, CONTENT)).toBe(CONTENT - VIEW) // Settings
  })

  it('does not scroll a list that fits', () => {
    expect(pivotScrollTop(300, 56, 800, 700)).toBe(0)
  })

  it('aligns an item taller than the space below the pivot to the trailing edge', () => {
    // viewport 100, pivot 30, 70 left below it; an 80 item goes to the bottom edge (offset 20 in the viewport)
    expect(pivotScrollTop(500, 80, 100, 2000)).toBe(480)
  })
})
