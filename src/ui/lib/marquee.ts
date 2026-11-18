/**
 * Geometry for the card title marquee: upstream `Modifier.enableMarquee` (`ui/Extensions.kt:192`) =
 * Compose `basicMarquee(initialDelayMillis = 250, velocity = 40.dp)` with the library defaults
 * iterations = 3, repeatDelayMillis = 1200, spacing = 1/3 of the container width.
 */
export const MARQUEE = {
  initialDelayMs: 250,
  repeatDelayMs: 1200,
  iterations: 3,
  velocityDpPerSec: 40,
  spacingFraction: 1 / 3,
  /** web only: an overflow up to this many dp counts as fitting (font metric differences), see planMarquee */
  fitToleranceDp: 1.5,
} as const

export type MarqueePlan = {
  /** Gap between the text and its repeated copy, in CSS px. */
  gapPx: number
  /** Distance travelled per iteration (text width + gap), in CSS px. */
  distancePx: number
  /** One iteration: travel time plus the repeat pause. */
  iterationMs: number
  /** Share of the iteration spent moving (0-100), the rest is the pause. */
  movePercent: number
}

/** True when the text does not fit; sub-pixel rounding is not overflow. */
export function isOverflowing(textWidth: number, containerWidth: number): boolean {
  return containerWidth > 0 && textWidth - containerWidth > 0.5
}

/**
 * @param textWidth   scrollWidth of the single-line text, CSS px
 * @param containerWidth clientWidth of the clipping box, CSS px
 * @param pxPerDp     CSS px per dp at the current interface scale (`dp(1)`)
 */
export function planMarquee(textWidth: number, containerWidth: number, pxPerDp: number): MarqueePlan | null {
  // The web font's advance widths run up to about 1% wider than the TV's Roboto: a title that just fits its card
  // on the TV (refshots 07-library-music-artists, "The Glass Orchard" in a 118dp box) overflows here by about a
  // dp and would scroll. An overflow that small is not scrolled.
  if (!isOverflowing(textWidth, containerWidth) || textWidth - containerWidth <= MARQUEE.fitToleranceDp * pxPerDp) return null
  const gapPx = containerWidth * MARQUEE.spacingFraction
  const distancePx = textWidth + gapPx
  const moveMs = (distancePx / (MARQUEE.velocityDpPerSec * pxPerDp)) * 1000
  const iterationMs = moveMs + MARQUEE.repeatDelayMs
  return { gapPx, distancePx, iterationMs, movePercent: (moveMs / iterationMs) * 100 }
}
