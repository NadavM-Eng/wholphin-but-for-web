// Web column count for library grids. Upstream uses a fixed count (view options; 6 posters, 4 wide, 4 for
// genre/studio tiles) on a fixed 960dp TV canvas. The web treats that count as the count at the
// TV-equivalent grid width and keeps the card width close to its TV size as the window changes.

/**
 * Width of the library grid on the TV in dp: 960dp canvas minus the collapsed nav drawer, the grid's
 * start padding and the alphabet column (measured on refshots/out/08-library-grid-dialogs-grid.png:
 * cards span x = 144..1820 px at 2 px/dp).
 */
export const TV_GRID_WIDTH_DP = 838

/** Card width (dp) a grid of `columns` with `spacing` has on the TV. */
export function tvCardWidthDp(columns: number, spacing: number): number {
  const c = Math.max(1, columns)
  return Math.max(1, (TV_GRID_WIDTH_DP - spacing * (c - 1)) / c)
}

/**
 * Columns for a grid `widthDp` wide (in dp at the current interface scale) so cards stay about the TV
 * card width. At the TV width this returns `columns` exactly; never fewer than 1 (a 1-column choice
 * stays 1 column) and never more than 4x the choice.
 */
export function webColumns(widthDp: number, columns: number, spacing: number): number {
  const c = Math.max(1, Math.floor(columns))
  if (!(widthDp > 0)) return c
  const target = tvCardWidthDp(c, spacing)
  const n = Math.round((widthDp + spacing) / (target + spacing))
  return Math.min(c * 4, Math.max(1, n))
}

/**
 * Width in CSS px that the cards of a grid's scroll box share: its client width without the inline padding
 * (that padding is only room for the focused card's scale, cancelled by a negative margin).
 */
export function gridContentWidthPx(el: HTMLElement): number {
  const cs = getComputedStyle(el)
  return Math.max(0, el.clientWidth - (parseFloat(cs.paddingInlineStart) || 0) - (parseFloat(cs.paddingInlineEnd) || 0))
}

/** Remote paging jump `jump1` (CardGrid.kt:150-161): columns x 6 / 15 / 50 / 500 rows by list size (PageUp / PageDown on the web). */
export function jumpStep(total: number, columns: number): number {
  if (total >= 25_000) return columns * 500
  if (total >= 7_000) return columns * 50
  if (total >= 2_000) return columns * 15
  return columns * 6
}
