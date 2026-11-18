import { PIVOT_PARENT_FRACTION } from '../../../ui/lib/bringIntoView'

// How far the series overview scrolls when an arrow key moves focus below its top group (and, in one case, into
// the button row). SeriesOverviewContent.kt:147-155 scrolls a Column that is padded 16dp at the top and bottom
// before `.verticalScroll`, so its viewport is the window less 16dp on each side, and it sits under a
// `.nestedScroll(rememberDelayedNestedScroll())` (DelayedNestedScrollConnection.kt): that parent takes 33% of every
// vertical scroll step as "consumed" in onPreScroll, so the column only moves 67% of each step of a
// bring-into-view animation. With animations on, the animation re-aims every frame and still ends on the pivot.
// With animations off (MotionDurationScale 0, which the reference run sets; reduced motion on the web), Compose's
// ContentInViewNode runs one jump frame plus one final frame, so the column moves 1 - 0.33^2 of the distance.
// Measured on the reference pictures: 14-series-overview-page-3 lands 159.6 of 179.1dp (0.891) and
// 14-series-overview-page-2, where the header's own bringIntoView request competes, one frame: 165 of 246.3dp (0.67).

/** DelayedNestedScrollConnection's default yDelay (rememberDelayedNestedScroll). */
export const OVERVIEW_Y_DELAY = 0.33

/** Share of the distance to the pivot the column covers in `frames` scroll frames (Infinity: an animation). */
export function delayedShare(frames: number): number {
  return 1 - OVERVIEW_Y_DELAY ** frames
}

export type OverviewScrollInput = {
  /** current scroll offset of the window */
  current: number
  /** the focused element's layout box, in window coordinates */
  itemTop: number
  itemHeight: number
  /** the scrolled column's viewport inside the window: from `viewTop`, `viewHeight` tall */
  viewTop: number
  viewHeight: number
  /** largest scroll offset */
  max: number
  /** scroll frames that move the column (1, 2, or Infinity for a whole animation) */
  frames: number
}

/**
 * The scroll offset the overview lands on: the distance of the PivotBringIntoViewSpec (leading edge at 30% of the
 * viewport, or the trailing edge at the viewport's end for an item that would not fit below the pivot), cut by the
 * delayed nested scroll, within the scroll range. Web addition: the item is kept fully inside the viewport, which
 * the partial move could otherwise leave cut off after a long jump in a small window.
 */
export function overviewScrollTop({ current, itemTop, itemHeight, viewTop, viewHeight, max, frames }: OverviewScrollInput): number {
  const pivot = PIVOT_PARENT_FRACTION * viewHeight
  const lead = itemHeight <= viewHeight && viewHeight - pivot < itemHeight ? viewHeight - itemHeight : pivot
  const offset = itemTop - viewTop
  let target = current + delayedShare(frames) * (offset - lead)
  if (itemHeight <= viewHeight) {
    const after = offset - (target - current)
    if (after + itemHeight > viewHeight) target += after + itemHeight - viewHeight
    else if (after < 0) target += after
  }
  return Math.min(Math.max(0, target), Math.max(0, max))
}
