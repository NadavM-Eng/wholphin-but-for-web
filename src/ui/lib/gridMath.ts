/**
 * Column math for `CardGrid`. Upstream (`ui/detail/CardGrid.kt:330-345`) uses a fixed column count from
 * the view options and computes card width = ceil((width - spacing * (columns - 1)) / columns).
 * The web grid can also derive the count from a minimum card width so it reflows with the window.
 */

export type GridColumns =
  | { kind: 'fixed'; columns: number }
  | { kind: 'auto'; minCardWidth: number; maxColumns?: number }

/** Number of columns that fit `width` with `gap` between cards. Always >= 1. */
export function autoColumnCount(width: number, minCardWidth: number, gap: number, maxColumns = Infinity): number {
  if (width <= 0 || minCardWidth <= 0) return 1
  const n = Math.floor((width + gap) / (minCardWidth + gap))
  return Math.max(1, Math.min(n, maxColumns))
}

export function columnCount(width: number, cols: GridColumns, gap: number): number {
  return cols.kind === 'fixed'
    ? Math.max(1, Math.floor(cols.columns))
    : autoColumnCount(width, cols.minCardWidth, gap, cols.maxColumns)
}

/** Card width for `columns` columns in `width` (all in the same unit). Upstream rounds up in px. */
export function cardWidth(width: number, columns: number, gap: number): number {
  if (columns <= 0) return 0
  return Math.max(0, (width - gap * (columns - 1)) / columns)
}

export function rowCount(itemCount: number, columns: number): number {
  return columns > 0 ? Math.ceil(itemCount / columns) : 0
}

/** Row containing item `index`. */
export function rowOfIndex(index: number, columns: number): number {
  return Math.floor(index / Math.max(1, columns))
}

/** Clamp an aspect ratio to upstream's minimum (`AspectRatios.MIN` = 2/3). */
export function clampAspect(ratio: number | null | undefined): number {
  const r = ratio && Number.isFinite(ratio) && ratio > 0 ? ratio : 2 / 3
  return Math.max(r, 2 / 3)
}
