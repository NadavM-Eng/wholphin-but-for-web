export type StarPrecision = 'full' | 'half'

/** New 0-100 rating after clicking star `i` (1-5); port of the click logic in upstream `StarRating` (`Rating.kt:236-268`). */
export function nextStarRating(i: number, rating100: number, precision: StarPrecision): number {
  if (precision === 'full') {
    return i === 1 && rating100 > 0 && rating100 <= 20 ? 0 : i * 20
  }
  if (rating100 > i * 20) return i * 20
  if (rating100 === i * 20) return i * 20 - 10
  if (rating100 === i * 20 - 10) return (i - 1) * 20
  if (i === 1 && rating100 === 0) return 20
  if (i === 1 && rating100 > 10) return 10
  if (i === 1 && rating100 <= 10) return 0
  return i * 20
}

/** Star that receives focus when entering the picker (upstream `onEnter`). */
export function starForRating(rating100: number): number {
  if (rating100 <= 20) return 1
  if (rating100 <= 40) return 2
  if (rating100 <= 60) return 3
  if (rating100 <= 80) return 4
  return 5
}
