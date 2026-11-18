import { describe, expect, it } from 'vitest'
import { autoColumnCount, cardWidth, clampAspect, columnCount, rowCount, rowOfIndex } from './gridMath'
import { isOverflowing, MARQUEE, planMarquee } from './marquee'

describe('grid column math', () => {
  it('fixed columns follow the view options', () => {
    expect(columnCount(1000, { kind: 'fixed', columns: 6 }, 16)).toBe(6)
    expect(columnCount(1000, { kind: 'fixed', columns: 0 }, 16)).toBe(1)
  })

  it('auto-fit packs as many min-width cards as fit', () => {
    // 6 * 120 + 5 * 16 = 800 exactly
    expect(autoColumnCount(800, 120, 16)).toBe(6)
    expect(autoColumnCount(799, 120, 16)).toBe(5)
    expect(autoColumnCount(50, 120, 16)).toBe(1)
    expect(autoColumnCount(5000, 120, 16, 8)).toBe(8)
    expect(columnCount(800, { kind: 'auto', minCardWidth: 120 }, 16)).toBe(6)
  })

  it('card width splits the space after gaps', () => {
    expect(cardWidth(800, 6, 16)).toBeCloseTo(120)
    expect(cardWidth(100, 1, 16)).toBe(100)
  })

  it('rows and index mapping', () => {
    expect(rowCount(13, 6)).toBe(3)
    expect(rowCount(0, 6)).toBe(0)
    expect(rowOfIndex(12, 6)).toBe(2)
    expect(rowOfIndex(5, 6)).toBe(0)
  })

  it('clamps aspect ratios to 2/3 like AspectRatios.MIN', () => {
    expect(clampAspect(0.5)).toBeCloseTo(2 / 3)
    expect(clampAspect(16 / 9)).toBeCloseTo(16 / 9)
    expect(clampAspect(null)).toBeCloseTo(2 / 3)
  })
})

describe('marquee', () => {
  it('detects overflow with sub-pixel tolerance', () => {
    expect(isOverflowing(100, 100)).toBe(false)
    expect(isOverflowing(100.4, 100)).toBe(false)
    expect(isOverflowing(130, 100)).toBe(true)
    expect(isOverflowing(130, 0)).toBe(false)
  })

  it('does not plan a marquee for text that fits', () => {
    expect(planMarquee(80, 100, 1)).toBeNull()
  })

  it('does not scroll a text that overflows by a font-metric hair (1.5dp)', () => {
    expect(planMarquee(119.4, 118.3, 1)).toBeNull()
    expect(planMarquee(238.8, 236.6, 2)).toBeNull()
    expect(planMarquee(121, 118.3, 1)).not.toBeNull()
  })

  it('moves text + 1/3 container gap at 40dp/s, then pauses 1200ms', () => {
    const plan = planMarquee(200, 120, 2)!
    expect(plan.gapPx).toBeCloseTo(40)
    expect(plan.distancePx).toBeCloseTo(240)
    // 240px at 80px/s = 3000ms
    expect(plan.iterationMs).toBeCloseTo(3000 + MARQUEE.repeatDelayMs)
    expect(plan.movePercent).toBeCloseTo((3000 / 4200) * 100)
  })
})
