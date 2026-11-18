import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import clsx from 'clsx'
import { withCount } from '../../../i18n'
import type { Translate } from '../../../lib/format'
import { dp } from '../../../theme/scale'
import { Button, FaIcon, ListItem, MaterialIcon } from '../../../ui'
import { TOUCH_SLOP_DP, pansByDragging } from '../../../ui/lib/touchIntent'
import { HOME_SETTINGS_SOURCE_LABEL, type HomeSettingsSource } from '../model/homeSettings'
import type { EditorRow, MoveDirection } from './editorModel'
import styles from './HomeSettings.module.css'
import { SettingsListItem } from './SettingsListItem'

type Props = {
  t: Translate
  rows: readonly EditorRow[]
  source: HomeSettingsSource
  titleOf: (row: EditorRow) => string
  onAdd: () => void
  onSource: () => void
  onSettings: () => void
  onPresets: () => void
  onRow: (index: number, row: EditorRow) => void
  onMove: (direction: MoveDirection, index: number) => void
  onReorder: (from: number, to: number) => void
  onDelete: (index: number) => void
}

/**
 * How long a finger rests on a row's handle before it picks the row up; a scroll moves sooner. Long enough that a
 * finger which hesitates before it scrolls does not pick the row up, and shorter than the 500 ms long press
 * (src/ui/lib/useLongPress.ts) at which Android would offer its own menu.
 */
const HANDLE_HOLD_MS = 400

/**
 * `HomeSettingsRowList`: Add row, Source, Settings, Display presets, then "Home rows (N)" with one entry per
 * row (title + up / down / delete). Web: a drag handle reorders rows with a mouse or a finger; the up/down
 * buttons stay for the keyboard (as on the TV).
 *
 * The list scrolls, and reordering is an up-and-down drag like the scroll itself, so a finger (or pen) that
 * lands on a handle does nothing at first: moving scrolls the list (`touch-action: pan-y`), resting on the
 * handle for HANDLE_HOLD_MS picks the row up. The mouse picks it up on press.
 */
export function RowListPage({ t, rows, source, titleOf, onAdd, onSource, onSettings, onPresets, onRow, onMove, onReorder, onDelete }: Props) {
  const list = useRef<HTMLDivElement>(null)
  const [dragId, setDragId] = useState<number | null>(null)
  const rowsRef = useRef(rows)
  useLayoutEffect(() => {
    rowsRef.current = rows
  })

  /** a finger holds a row (picked up, not yet released): the browser must not pan the list under it */
  const touchHeld = useRef(false)
  /** ends a finger's wait on a handle */
  const stopWait = useRef<(() => void) | null>(null)
  useEffect(() => () => stopWait.current?.(), [])

  // The handle's touch-action lets the list pan, and that cannot change during a gesture: once the row is picked
  // up the pan is refused per touchmove instead (a listener React cannot add: its own are passive).
  const handleRef = useCallback((el: HTMLSpanElement | null) => {
    if (!el) return
    const onTouchMove = (ev: TouchEvent) => {
      if (touchHeld.current && ev.cancelable) ev.preventDefault()
    }
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    return () => el.removeEventListener('touchmove', onTouchMove)
  }, [])

  const onHandleDown = (e: ReactPointerEvent<HTMLElement>, id: number) => {
    if (e.button !== 0) return
    if (!pansByDragging(e.pointerType)) {
      e.preventDefault()
      startDrag(id, false)
      return
    }
    if (!e.isPrimary) return
    stopWait.current?.()
    const { pointerId, clientX: x, clientY: y } = e
    const slop = dp(TOUCH_SLOP_DP)
    const stop = () => {
      window.clearTimeout(timer)
      window.removeEventListener('pointermove', onMoveEv)
      window.removeEventListener('pointerup', stop)
      window.removeEventListener('pointercancel', stop)
      stopWait.current = null
    }
    const onMoveEv = (ev: PointerEvent) => {
      if (ev.pointerId === pointerId && Math.hypot(ev.clientX - x, ev.clientY - y) > slop) stop()
    }
    const timer = window.setTimeout(() => {
      stop()
      startDrag(id, true)
    }, HANDLE_HOLD_MS)
    window.addEventListener('pointermove', onMoveEv)
    window.addEventListener('pointerup', stop)
    window.addEventListener('pointercancel', stop)
    stopWait.current = stop
  }

  const startDrag = (id: number, byTouch: boolean) => {
    touchHeld.current = byTouch
    setDragId(id)
    // no text selection while the finger / mouse sweeps over the list
    const prevSelect = document.body.style.userSelect
    document.body.style.userSelect = 'none'
    window.getSelection()?.removeAllRanges()
    const scroller = list.current
    const onMoveEv = (ev: PointerEvent) => {
      const entries = Array.from(scroller?.querySelectorAll<HTMLElement>('[data-row-entry]') ?? [])
      const from = rowsRef.current.findIndex((r) => r.id === id)
      if (from < 0) return
      let to = from
      for (let i = 0; i < entries.length; i++) {
        const r = entries[i].getBoundingClientRect()
        if (i < from && ev.clientY < r.top + r.height / 2) {
          to = i
          break
        }
        if (i > from && ev.clientY > r.top + r.height / 2) to = i
      }
      if (to !== from) onReorder(from, to)
      // keep dragging near the edges of the list: scroll it
      if (scroller) {
        const box = scroller.getBoundingClientRect()
        const edge = dp(32)
        if (ev.clientY < box.top + edge) scroller.scrollBy({ top: -dp(12) })
        else if (ev.clientY > box.bottom - edge) scroller.scrollBy({ top: dp(12) })
      }
    }
    const end = () => {
      touchHeld.current = false
      setDragId(null)
      document.body.style.userSelect = prevSelect
      window.removeEventListener('pointermove', onMoveEv)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
    }
    window.addEventListener('pointermove', onMoveEv)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
  }

  const deleteAt = (index: number, el: HTMLElement) => {
    // focus moves to the next entry (or the previous one for the last row), as upstream's moveFocus
    const entries = Array.from(list.current?.querySelectorAll<HTMLElement>('[data-row-entry]') ?? [])
    const target = entries[index + 1] ?? entries[index - 1]
    const col = Array.from(el.closest('[data-row-entry]')?.querySelectorAll('[data-focusable]') ?? []).indexOf(el)
    const next = target?.querySelectorAll<HTMLElement>('[data-focusable]')[Math.max(0, col)]
    next?.focus({ preventScroll: false })
    onDelete(index)
  }

  return (
    <>
      <h2 className={styles.title}>{t('customize_home')}</h2>
      <div ref={list} className={styles.listInset}>
        <SettingsListItem headline={t('add_row')} leading={<MaterialIcon name="add" />} onClick={onAdd} focusKey="add" />
        <SettingsListItem
          headline={t('web_source')}
          supporting={t(HOME_SETTINGS_SOURCE_LABEL[source])}
          leading={<FaIcon name="download" />}
          onClick={onSource}
          focusKey="source"
        />
        <SettingsListItem headline={t('settings')} leading={<MaterialIcon name="settings" />} onClick={onSettings} focusKey="settings" />
        <SettingsListItem
          headline={t('display_presets')}
          supporting={t('display_presets_description')}
          leading={<FaIcon name="sliders" />}
          onClick={onPresets}
          focusKey="presets"
        />
        <div className={styles.sectionTitle}>{withCount(t('home_rows'), rows.length)}</div>
        <hr className={styles.divider} />
        {rows.map((row, index) => (
          <div key={row.id} className={clsx(styles.rowEntry, dragId === row.id && styles.dragging)} data-row-entry data-hs-key={`row:${row.id}`}>
            <span
              ref={handleRef}
              className={styles.handle}
              aria-hidden
              title={t('web_drag_to_reorder')}
              onPointerDown={(e) => onHandleDown(e, row.id)}
              // Android sends a long-press menu event while the finger rests on a picked-up row
              onContextMenu={(e) => {
                if (touchHeld.current) e.preventDefault()
              }}
            >
              <MaterialIcon name="drag_indicator" size={16} />
            </span>
            <ListItem
              className={styles.rowTitle}
              headline={<span className={styles.rowTitleText}>{titleOf(row)}</span>}
              onClick={() => onRow(index, row)}
            />
            <span className={styles.rowButtons}>
              <Button className={styles.rowButton} label={t('web_move_up')} disabled={index === 0} onClick={() => onMove('UP', index)}>
                <FaIcon name="caret_up" />
              </Button>
              <Button
                className={styles.rowButton}
                label={t('web_move_down')}
                disabled={index === rows.length - 1}
                onClick={() => onMove('DOWN', index)}
              >
                <FaIcon name="caret_down" />
              </Button>
              <Button
                className={styles.rowButton}
                label={t('delete')}
                disabled={rows.length <= 1}
                onClick={(e) => deleteAt(index, e.currentTarget)}
              >
                <MaterialIcon name="delete" />
              </Button>
            </span>
          </div>
        ))}
      </div>
    </>
  )
}
