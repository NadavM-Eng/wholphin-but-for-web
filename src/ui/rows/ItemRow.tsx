import { useVirtualizer } from '@tanstack/react-virtual'
import clsx from 'clsx'
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { useDp } from '../../theme/scale'
import { MaterialIcon } from '../icons/MaterialIcon'
import { installDragScroll } from '../lib/dragScroll'
import styles from './ItemRow.module.css'
import { loadScroll, saveScroll } from './scrollMemory'

export type ItemRowProps = {
  /** Row title (titleLarge, onBackground, 8dp start padding). */
  title?: string
  count: number
  renderItem: (index: number) => ReactNode
  /** Item width in dp (or per index), used to size the virtual list before items are measured. */
  itemWidth: number | ((index: number) => number)
  getItemKey?: (index: number) => string | number
  /** Gap between items and the horizontal content padding, dp (upstream `viewOptions.spacing`, 16). */
  gap?: number
  /** Horizontal content padding in dp when it differs from the gap (PersonRow.kt: 8dp padding, 16dp spacing). */
  contentPadding?: number
  /** Rows longer than this are virtualized. */
  virtualizeAbove?: number
  /** Remember the horizontal scroll offset under this key (restored on remount, e.g. Back). */
  restoreKey?: string
  /** Accessible names for the pointer-only scroll arrows. */
  previousLabel?: string
  nextLabel?: string
  /** Extra content at the end of the title line. */
  titleEnd?: ReactNode
  className?: string
}

/**
 * Upstream `ItemRow` (`ui/cards/ItemRow.kt`): title above a horizontal list, 8dp apart; item gap and
 * horizontal content padding 16dp, vertical 8dp. On the web the list scrolls natively (wheel/trackpad,
 * touch swipe, keyboard focus) and by dragging it with the mouse, shows previous/next arrows on hover with a
 * fine pointer, snaps on touch screens, and virtualizes long rows. Extra vertical padding leaves room for the 1.1x focused card.
 */
export function ItemRow({
  title,
  count,
  renderItem,
  itemWidth,
  getItemKey,
  gap = 16,
  contentPadding,
  virtualizeAbove = 30,
  restoreKey,
  previousLabel = 'Previous',
  nextLabel = 'Next',
  titleEnd,
  className,
}: ItemRowProps) {
  const scroller = useRef<HTMLDivElement>(null)
  const dp = useDp()
  const [edges, setEdges] = useState({ start: true, end: true })
  const [rtl, setRtl] = useState(false)
  const virtual = count > virtualizeAbove
  const pad = contentPadding ?? gap
  const widthOf = useCallback((i: number) => (typeof itemWidth === 'number' ? itemWidth : itemWidth(i)), [itemWidth])

  useLayoutEffect(() => {
    if (scroller.current) setRtl(getComputedStyle(scroller.current).direction === 'rtl')
  }, [])

  const virtualizer = useVirtualizer({
    count: virtual ? count : 0,
    horizontal: true,
    isRtl: rtl,
    getScrollElement: () => scroller.current,
    estimateSize: (i) => dp(widthOf(i)),
    gap: dp(gap),
    paddingStart: dp(pad),
    paddingEnd: dp(pad),
    overscan: 4,
    getItemKey: getItemKey ? (i) => getItemKey(i) : undefined,
    initialOffset: () => (restoreKey ? (loadScroll(restoreKey) ?? 0) : 0),
  })

  const updateEdges = useCallback(() => {
    const el = scroller.current
    if (!el) return
    const pos = Math.abs(el.scrollLeft)
    const max = el.scrollWidth - el.clientWidth
    const start = pos <= 1
    const end = pos >= max - 1
    setEdges((prev) => (prev.start === start && prev.end === end ? prev : { start, end }))
  }, [])

  // Restore (non-virtual rows; the virtualizer restores via initialOffset) and keep edges in sync.
  useLayoutEffect(() => {
    const el = scroller.current
    if (!el) return
    if (restoreKey && !virtual) {
      const saved = loadScroll(restoreKey)
      if (saved != null) el.scrollLeft = getComputedStyle(el).direction === 'rtl' ? -saved : saved
    }
    updateEdges()
    // only on mount / key change
  }, [restoreKey, virtual, updateEdges])

  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const onScroll = () => {
      updateEdges()
      if (restoreKey) saveScroll(restoreKey, Math.abs(el.scrollLeft))
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    // next frame, not inside the observer callback (Safari: ResizeObserver loop error, see CardGrid)
    let raf = 0
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(updateEdges)
    })
    ro.observe(el)
    const stopDrag = installDragScroll(el)
    return () => {
      cancelAnimationFrame(raf)
      el.removeEventListener('scroll', onScroll)
      ro.disconnect()
      stopDrag()
    }
  }, [restoreKey, updateEdges])

  const page = (dir: 1 | -1) => {
    const el = scroller.current
    if (!el) return
    const smooth = !matchMedia('(prefers-reduced-motion: reduce)').matches
    const sign = getComputedStyle(el).direction === 'rtl' ? -1 : 1
    el.scrollBy({ left: dir * sign * el.clientWidth * 0.8, behavior: smooth ? 'smooth' : 'auto' })
  }

  let items: ReactNode
  if (virtual) {
    const vItems = virtualizer.getVirtualItems()
    const first = vItems[0]
    const last = vItems[vItems.length - 1]
    const padStart = dp(pad)
    const leading = first ? first.start - padStart : 0
    const trailing = last ? virtualizer.getTotalSize() - last.end - dp(pad) : 0
    items = (
      <div className={styles.track} style={{ paddingInline: `${padStart}px` }}>
        <div style={{ flex: 'none', width: `${Math.max(0, leading - (first && first.index > 0 ? dp(gap) : 0))}px` }} />
        {vItems.map((v, n) => (
          <div
            key={v.key}
            data-index={v.index}
            ref={virtualizer.measureElement}
            className={styles.item}
            style={{ marginInlineStart: n > 0 || v.index > 0 ? `${dp(gap)}px` : undefined }}
          >
            {renderItem(v.index)}
          </div>
        ))}
        <div style={{ flex: 'none', width: `${Math.max(0, trailing)}px` }} />
      </div>
    )
  } else {
    items = (
      <div className={styles.track} style={{ gap: `${dp(gap)}px`, paddingInline: `${dp(pad)}px` }}>
        {Array.from({ length: count }, (_, i) => (
          <div key={getItemKey ? getItemKey(i) : i} className={styles.item}>
            {renderItem(i)}
          </div>
        ))}
      </div>
    )
  }

  return (
    <section className={clsx(styles.row, className)} aria-label={title}>
      {(title || titleEnd) && (
        <div className={styles.header}>
          {title && <h2 className={styles.title}>{title}</h2>}
          {titleEnd}
        </div>
      )}
      <div className={styles.viewport}>
        {/* focusRestorer(firstFocus): arrow keys entering the row land on the card focused there last, else the first */}
        <div ref={scroller} className={styles.scroller} data-focus-enter="restore" style={{ scrollPaddingInline: `${dp(pad)}px` }}>
          {items}
        </div>
        {!edges.start && (
          <button
            type="button"
            tabIndex={-1}
            aria-label={previousLabel}
            className={clsx(styles.arrow, styles.prev)}
            onClick={() => page(-1)}
          >
            <MaterialIcon name="chevron_left" size={28} className={styles.arrowIcon} />
          </button>
        )}
        {!edges.end && (
          <button
            type="button"
            tabIndex={-1}
            aria-label={nextLabel}
            className={clsx(styles.arrow, styles.next)}
            onClick={() => page(1)}
          >
            <MaterialIcon name="chevron_right" size={28} className={styles.arrowIcon} />
          </button>
        )}
      </div>
    </section>
  )
}
