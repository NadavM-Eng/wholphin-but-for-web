import { describe, expect, it } from 'vitest'
import { delayedShare, overviewScrollTop } from './overviewScroll'

// The TV canvas: 540dp window, the column's viewport 16dp inside it (508dp), scroll range 363dp.
const TV = { viewTop: 16, viewHeight: 508, max: 363 }

describe('delayedShare (DelayedNestedScrollConnection yDelay .33)', () => {
  it('moves 67% per frame and everything over a whole animation', () => {
    expect(delayedShare(1)).toBeCloseTo(0.67, 6)
    expect(delayedShare(2)).toBeCloseTo(0.8911, 6)
    expect(delayedShare(Infinity)).toBe(1)
  })
})

describe('overviewScrollTop', () => {
  it('14-series-overview-page-2: Down onto the Play button, one frame, lands about 165dp down', () => {
    // the Play button's layout box (40dp, without the focus scale) at 414.7dp in the unscrolled page
    expect(overviewScrollTop({ ...TV, current: 0, itemTop: 414.7, itemHeight: 40, frames: 1 })).toBeCloseTo(165, 1)
  })

  it('14-series-overview-page-3: Down onto the first Cast & Crew card, two frames, lands about 325dp down', () => {
    // the card's circle at 512.5dp in the content, seen from the page-2 position
    const from = 165
    expect(overviewScrollTop({ ...TV, current: from, itemTop: 512.5 - from, itemHeight: 108, frames: 2 })).toBeCloseTo(324.6, 0)
  })

  it('14-series-overview-page-4: the guest star row runs into the end of the scroll range', () => {
    const from = 324.6
    expect(overviewScrollTop({ ...TV, current: from, itemTop: 725 - from, itemHeight: 108, frames: 2 })).toBe(363)
  })

  it('with animations the column ends on the pivot of its own viewport', () => {
    expect(overviewScrollTop({ ...TV, current: 0, itemTop: 512.5, itemHeight: 108, frames: Infinity })).toBeCloseTo(512.5 - 16 - 0.3 * 508, 6)
  })

  it('moves up the same way and stops at the start', () => {
    expect(overviewScrollTop({ ...TV, current: 363, itemTop: 512.5 - 363, itemHeight: 108, frames: 2 })).toBeCloseTo(363 + 0.8911 * (512.5 - 363 - 16 - 152.4), 6)
    expect(overviewScrollTop({ ...TV, current: 40, itemTop: 100, itemHeight: 40, frames: 2 })).toBe(0)
  })

  it('aligns an item that does not fit below the pivot to the viewport end', () => {
    // 400dp item: 355.6dp below the pivot is not enough, its end goes to the viewport end
    expect(overviewScrollTop({ ...TV, max: 2000, current: 0, itemTop: 616, itemHeight: 400, frames: Infinity })).toBeCloseTo(616 - 16 - 108, 6)
  })

  it('keeps the item whole inside the viewport after a long partial move (web addition)', () => {
    // a phone-sized viewport and an item 1500 down: 89% of the way would leave it below the window
    const r = overviewScrollTop({ current: 0, itemTop: 1500, itemHeight: 120, viewTop: 16, viewHeight: 600, max: 5000, frames: 2 })
    const after = 1500 - r
    expect(after).toBeGreaterThanOrEqual(16)
    expect(after + 120).toBeLessThanOrEqual(16 + 600 + 1e-6)
  })
})
