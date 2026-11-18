import { describe, expect, it } from 'vitest'
import { nextStarRating, starForRating } from './starRating'

describe('star rating clicks', () => {
  it('full precision sets i*20, and star 1 toggles off a 1-star rating', () => {
    expect(nextStarRating(3, 0, 'full')).toBe(60)
    expect(nextStarRating(1, 20, 'full')).toBe(0)
    expect(nextStarRating(1, 0, 'full')).toBe(20)
  })

  it('half precision cycles full -> half -> previous', () => {
    expect(nextStarRating(3, 40, 'half')).toBe(60)
    expect(nextStarRating(3, 60, 'half')).toBe(50)
    expect(nextStarRating(3, 50, 'half')).toBe(40)
    expect(nextStarRating(3, 80, 'half')).toBe(60)
    expect(nextStarRating(1, 0, 'half')).toBe(20)
  })

  it('focus enters on the star covering the rating', () => {
    expect(starForRating(0)).toBe(1)
    expect(starForRating(50)).toBe(3)
    expect(starForRating(100)).toBe(5)
  })
})
