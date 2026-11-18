import { useVirtualizer, useWindowVirtualizer, type Virtualizer } from '@tanstack/react-virtual'
import clsx from 'clsx'
import { useImperativeHandle, useLayoutEffect, useRef, useState, type ReactNode, type Ref, type RefObject } from 'react'
import { useDp } from '../../theme/scale'
import { cardWidth, columnCount, rowCount, rowOfIndex, type GridColumns } from '../lib/gridMath'
import styles from './CardGrid.module.css'
import { loadScroll, saveScroll } from './scrollMemory'

export type CardGridHandle = {
  /** Scroll so item `index` is in view (alphabet jump) and, by default, focus its card. */
  scrollToIndex: (index: number, opts?: { focus?: boolean }) => void
}

export type CardGridProps = {
  count: number
  /** Render one cell; `cardWidthPx` is the column width in CSS px. */
  renderItem: (index: number, cardWidthPx: number) => ReactNode
  getItemKey?: (index: number) => string | number
  /**
   * `{ kind: 'fixed', columns }` = the view-options column count (upstream; default 6 posters, 4 wide);
   * `{ kind: 'auto', minCardWidth }` (dp) = as many columns as fit, reflowing with the window.
   */
  columns: GridColumns
  /** Gap between cards, dp (16 posters, 24 wide). */
  gap?: number
  /** Row height estimate in CSS px from the card width (rows are measured after render). */
  estimateRowHeight?: (cardWidthPx: number) => number
  /** Scroll container; default the window (page scroll). */
  getScrollElement?: () => HTMLElement | null
  /** Remember the vertical scroll offset under this key. */
  restoreKey?: string
  /** Content when count is 0 (upstream: "No results" centered). */
  empty?: ReactNode
  ref?: Ref<CardGridHandle>
  className?: string
}

/**
 * Upstream `CardGrid` (`ui/detail/CardGrid.kt`): a vertical grid with 16dp content padding top/bottom,
 * card width = (width - gap x (cols - 1)) / cols. Virtualized by row; rows are placed with `top`
 * (not transforms) so a focused, scaled card can paint over the next row.
 */
export function CardGrid(props: CardGridProps) {
  return props.getScrollElement ? <ElementGrid {...props} /> : <WindowGrid {...props} />
}

type Layout = { columns: number; cardWidthPx: number; rows: number; gapPx: number; padPx: number }

function useGridLayout(props: CardGridProps) {
  const container = useRef<HTMLDivElement>(null)
  const dp = useDp()
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const el = container.current
    if (!el) return
    setWidth(el.clientWidth)
    // Deferred to the next frame and skipped when unchanged: a state update inside the observer callback
    // re-lays the grid synchronously, which Safari reports as "ResizeObserver loop completed with
    // undelivered notifications".
    let raf = 0
    const ro = new ResizeObserver((entries) => {
      const w = entries[0].contentRect.width
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => setWidth((prev) => (prev === w ? prev : w)))
    })
    ro.observe(el)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [])
  const gapPx = dp(props.gap ?? 16)
  const cols = props.columns.kind === 'auto' ? { ...props.columns, minCardWidth: dp(props.columns.minCardWidth) } : props.columns
  const columns = columnCount(width, cols, gapPx)
  const layout: Layout = {
    columns,
    cardWidthPx: Math.ceil(cardWidth(width, columns, gapPx)),
    rows: rowCount(props.count, columns),
    gapPx,
    padPx: dp(16),
  }
  const estimate = () =>
    props.estimateRowHeight ? props.estimateRowHeight(layout.cardWidthPx) : layout.cardWidthPx * 1.5 + dp(52)
  return { container, layout, estimate }
}

function WindowGrid(props: CardGridProps) {
  const { container, layout, estimate } = useGridLayout(props)
  const [margin, setMargin] = useState(0)
  useLayoutEffect(() => {
    const el = container.current
    if (el) setMargin(el.getBoundingClientRect().top + window.scrollY)
  }, [container, layout.columns])
  const virtualizer = useWindowVirtualizer({
    count: layout.rows,
    estimateSize: estimate,
    gap: layout.gapPx,
    paddingStart: layout.padPx,
    paddingEnd: layout.padPx,
    overscan: 2,
    scrollMargin: margin,
    initialOffset: () => (props.restoreKey ? (loadScroll(props.restoreKey) ?? 0) : 0),
  })
  return <GridBody {...props} container={container} layout={layout} virtualizer={virtualizer} margin={margin} />
}

function ElementGrid(props: CardGridProps) {
  const { container, layout, estimate } = useGridLayout(props)
  const virtualizer = useVirtualizer({
    count: layout.rows,
    getScrollElement: props.getScrollElement!,
    estimateSize: estimate,
    gap: layout.gapPx,
    paddingStart: layout.padPx,
    paddingEnd: layout.padPx,
    overscan: 2,
    initialOffset: () => (props.restoreKey ? (loadScroll(props.restoreKey) ?? 0) : 0),
  })
  return <GridBody {...props} container={container} layout={layout} virtualizer={virtualizer} margin={0} />
}

function GridBody({
  count,
  renderItem,
  getItemKey,
  restoreKey,
  empty,
  ref,
  className,
  container,
  layout,
  virtualizer,
  margin,
}: CardGridProps & {
  container: RefObject<HTMLDivElement | null>
  layout: Layout
  virtualizer: Virtualizer<Window, Element> | Virtualizer<HTMLElement, Element>
  margin: number
}) {
  // Save the offset as the user scrolls.
  const offset = virtualizer.scrollOffset
  useLayoutEffect(() => {
    if (restoreKey && offset != null) saveScroll(restoreKey, offset)
  }, [restoreKey, offset])

  useImperativeHandle(
    ref,
    () => ({
      scrollToIndex(index, opts) {
        const row = rowOfIndex(index, layout.columns)
        virtualizer.scrollToIndex(row, { align: 'start' })
        if (opts?.focus === false) return
        // The row renders after the scroll; focus on the next frames.
        let tries = 0
        const tryFocus = () => {
          const cell = container.current?.querySelector<HTMLElement>(`[data-grid-index="${index}"]`)
          const target = cell?.querySelector<HTMLElement>('[data-card-surface], [data-focusable]')
          if (target) target.focus({ preventScroll: true })
          else if (tries++ < 10) requestAnimationFrame(tryFocus)
        }
        requestAnimationFrame(tryFocus)
      },
    }),
    [layout.columns, virtualizer, container],
  )

  if (count === 0) {
    return (
      <div ref={container} className={clsx(styles.grid, className)}>
        {empty && <div className={styles.empty}>{empty}</div>}
      </div>
    )
  }

  const rows = virtualizer.getVirtualItems()
  return (
    <div ref={container} className={clsx(styles.grid, className)} style={{ height: virtualizer.getTotalSize() }}>
      {layout.cardWidthPx > 0 &&
        rows.map((r) => {
          const startIdx = r.index * layout.columns
          const end = Math.min(count, startIdx + layout.columns)
          return (
            <div
              key={r.key}
              data-index={r.index}
              ref={virtualizer.measureElement}
              className={styles.row}
              style={{
                top: r.start - margin,
                gridTemplateColumns: `repeat(${layout.columns}, minmax(0, 1fr))`,
                columnGap: layout.gapPx,
              }}
            >
              {Array.from({ length: end - startIdx }, (_, k) => {
                const i = startIdx + k
                return (
                  <div key={getItemKey ? getItemKey(i) : i} data-grid-index={i} className={styles.cell}>
                    {renderItem(i, layout.cardWidthPx)}
                  </div>
                )
              })}
            </div>
          )
        })}
    </div>
  )
}
