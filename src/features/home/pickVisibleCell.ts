type Rect = { top: number; bottom: number }

type Cell = { getAttribute(name: string): string | null; getBoundingClientRect(): Rect }

const windowViewport = (): Rect => ({ top: 0, bottom: window.innerHeight })

/** The box lies wholly inside the viewport (1 px of rounding allowed). */
export function fullyInView(r: Rect, viewport: Rect): boolean {
  return r.bottom > r.top && r.top >= viewport.top - 1 && r.bottom <= viewport.bottom + 1
}

const index = (c: Cell) => Number(c.getAttribute('data-grid-index'))

/**
 * The grid cell to focus without scrolling: the one at `preferred` when it is fully in view, else the first
 * fully visible cell (by grid index), else none. `viewport` defaults to the window.
 */
export function pickVisibleCell<T extends Cell>(cells: readonly T[], preferred: number, viewport: Rect = windowViewport()): T | undefined {
  const visible = cells.filter((c) => fullyInView(c.getBoundingClientRect(), viewport)).sort((a, b) => index(a) - index(b))
  return visible.find((c) => index(c) === preferred) ?? visible[0]
}

/**
 * The first cell (by grid index) with any part in the viewport: for a window too short to show a whole cell, or a
 * restored scroll that cuts every row. The caller brings it into view.
 */
export function firstPartlyVisible<T extends Cell>(cells: readonly T[], viewport: Rect = windowViewport()): T | undefined {
  return cells
    .filter((c) => {
      const r = c.getBoundingClientRect()
      return r.bottom > r.top && r.bottom > viewport.top && r.top < viewport.bottom
    })
    .sort((a, b) => index(a) - index(b))[0]
}
