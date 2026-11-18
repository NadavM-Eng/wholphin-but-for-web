import clsx from 'clsx'
import { useLayoutEffect, useRef, type MouseEvent } from 'react'
import styles from './TabRow.module.css'

export type TabItem = {
  key: string
  label: string
  /** Optional link target so tabs can be opened in a new browser tab. */
  href?: string
}

export type TabRowProps = {
  tabs: TabItem[]
  selectedKey: string | null
  onSelect: (key: string) => void
  label?: string
  className?: string
}

/**
 * Upstream `TabRow` (`ui/components/TabRow.kt`): 16sp labels (bodyLarge letter spacing) with 16dp side
 * padding, a 2dp indicator 4dp under the text, no padding around the row. Indicator: `border`, full tab width on the focused tab while the row has focus;
 * otherwise `onSurface` at 25% width under the selected tab. Labels are onSurface while the row has focus
 * or the tab is selected, else @.5. The selected tab is scrolled to ~1/3.5 of the row.
 */
export function TabRow({ tabs, selectedKey, onSelect, label, className }: TabRowProps) {
  const row = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const r = row.current
    if (!r || selectedKey == null) return
    const el = r.querySelector<HTMLElement>(`[data-tab-key="${CSS.escape(selectedKey)}"]`)
    if (!el) return
    const rtl = getComputedStyle(r).direction === 'rtl'
    const offset = r.clientWidth / 3.5
    // RTL: offsetLeft is measured from the row's left edge with the content overflowing to the left (negative
    // offsets), so the distance from the start (right) edge is clientWidth - right edge.
    const start = rtl ? r.clientWidth - (el.offsetLeft + el.offsetWidth) : el.offsetLeft
    const target = Math.max(0, start - offset)
    const smooth = !matchMedia('(prefers-reduced-motion: reduce)').matches
    r.scrollTo({ left: rtl ? -target : target, behavior: smooth ? 'smooth' : 'auto' })
  }, [selectedKey])

  return (
    // TabRow.kt onEnter: Up/Down into the row focus the selected tab, Left/Right the tab at the edge entered
    <div ref={row} role="tablist" aria-label={label} data-focus-enter="tabs" className={clsx(styles.row, className)}>
      {tabs.map((t) => {
        const selected = t.key === selectedKey
        const props = {
          role: 'tab',
          'aria-selected': selected,
          'data-focusable': true,
          'data-tab-key': t.key,
          className: clsx(styles.tab, selected && styles.selected),
          onClick: (e: MouseEvent) => {
            if (t.href && (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1)) return
            e.preventDefault()
            onSelect(t.key)
          },
        }
        const body = (
          <>
            <span className={styles.text}>{t.label}</span>
            <span className={styles.indicator} />
          </>
        )
        return t.href ? (
          <a key={t.key} {...props} href={t.href}>
            {body}
          </a>
        ) : (
          <button key={t.key} type="button" {...props}>
            {body}
          </button>
        )
      })}
    </div>
  )
}
