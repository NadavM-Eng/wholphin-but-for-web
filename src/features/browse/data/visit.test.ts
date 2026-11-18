import { describe, expect, it } from 'vitest'
import { movieRecommendedRows, recommendedRowDeps, tvRecommendedRows } from './recommended'
import { staleBefore } from './visit'

describe('staleBefore', () => {
  const q = (dataUpdatedAt: number) => ({ state: { dataUpdatedAt } }) as Parameters<ReturnType<typeof staleBefore>>[0]
  it('marks pages fetched before the visit stale, later ones fresh', () => {
    const st = staleBefore(1000)
    expect(st(q(999))).toBe(0)
    expect(st(q(1000))).toBe(Infinity)
    expect(st(q(5000))).toBe(Infinity)
  })
  it('never marks anything stale for a POP-first visit (start 0)', () => {
    expect(staleBefore(0)(q(1))).toBe(Infinity)
  })
})

describe('recommendedRowDeps', () => {
  it('refetches resume / next up on played and next-up changes, item rows on played', () => {
    const tv = tvRecommendedRows('p', 'u', false)
    expect(recommendedRowDeps(tv[0])).toEqual(['played', 'nextUp', 'deleted'])
    expect(recommendedRowDeps(tv[1])).toEqual(['played', 'nextUp', 'deleted'])
    const top = movieRecommendedRows('p', 'u').find((r) => r.titleKey === 'top_unwatched')!
    expect(recommendedRowDeps(top)).toEqual(['played', 'deleted'])
  })
})
