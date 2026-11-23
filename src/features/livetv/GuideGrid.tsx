import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  type Ref,
} from 'react'
import { flushSync } from 'react-dom'
import { isHoverPointer, useHoverIntent } from '../common/hoverIntent'
import { useTranslate } from '../common/useTranslate'
import { focusDrawerEntry, isKeyboardModality, mayTakeInitialFocus } from '../../app/shell/shellFocus'
import { useDp } from '../../theme/scale'
import { CircularProgress, observeResize } from '../../ui'
import { keepPressToControl } from '../../ui/lib/touchIntent'
import { ChannelCell } from './ChannelCell'
import styles from './GuideGrid.module.css'
import {
  GUIDE_DIMENSIONS as D,
  guideHours,
  hoursBetween,
  programAtHour,
  programSubtitle,
  timelineLabel,
  timelineSpan,
  verticalTarget,
  type FetchedPrograms,
  type TvChannel,
  type TvProgram,
} from './guideModel'
import { ProgramCell } from './ProgramCell'

/** Focused cell: a program of row `row`, or the row's channel cell (`programId` null). */
export type GuidePosition = { row: number; programId: string | null }

export type GuideGridHandle = {
  /** Scroll back to the start of the guide (now) and focus the first program when the keyboard is in use. */
  jumpToNow: () => void
  /**
   * Keyboard focus back into the first row from the buttons above it: the program focused there last, else the
   * one at the start of the visible guide (or its channel cell, when that was focused). False when there is
   * nothing to focus.
   */
  focusFirstRow: () => boolean
}

type Props = {
  channels: readonly TvChannel[]
  programs: FetchedPrograms
  guideTimes: readonly number[]
  colorCode: boolean
  refreshing: boolean
  /** history-entry key: scroll and focus are kept per entry and restored on Back */
  restoreKey: string
  /** the program / channel whose dialog is open: it keeps its focused look behind the dialog, as on the TV */
  heldProgramId?: string | null
  heldChannelId?: string | null
  onClickProgram: (program: TvProgram) => void
  onClickChannel: (index: number, channel: TvChannel) => void
  /** a cell got focus (`keyboard` = keyboard focus, which also drives the header and the tab row) */
  onFocusCell: (pos: GuidePosition, program: TvProgram | null, keyboard: boolean) => void
  /** the mouse is over a program (header follows hover, as hover = focus on the web) */
  onHoverProgram: (program: TvProgram | null) => void
  /** the row at the middle of the viewport after a scroll (pointer users page the guide by scrolling) */
  onScrollRow: (row: number) => void
  /** Up was pressed on the first row; return true when focus was moved (else the global navigator decides) */
  onExitUp?: () => boolean
  ref?: Ref<GuideGridHandle>
}

type View = { left: number; top: number; width: number; height: number }

/** Rows / hours rendered outside the viewport. */
const OVERSCAN_ROWS = 3
const OVERSCAN_HOURS = 1
/** Pointer travel before a mouse press becomes a drag-scroll instead of a click. */
const DRAG_SLOP_PX = 6
const NOW_TICK_MS = 15_000

type Saved = { left: number; top: number; focus: GuidePosition | null }
const savedViews = new Map<string, Saved>()

/**
 * The TV guide grid: port of the `ProgramGuide` layout (eu.wewox.programguide, used by TvGuideGrid.kt) with
 * upstream's dimensions. One scroll box in both directions; the timeline row sticks to the top, the channel
 * column to the start, the top-left corner to both. Programs are placed by fractional hours from the guide start
 * (240dp per hour, 64dp rows) and only the visible window (plus the focused cell) is rendered. The "now" line is
 * drawn above the programs and below the channels and the timeline, full height, and advances while open.
 *
 * Input: arrow keys move program by program like the D-pad (left of the first program = the channel; up from the
 * first row and left of a channel leave the grid), focus moves centre the cell (`animateToProgram(Center)`), Back
 * (Escape) jumps to the row's first program and then to the top (TvGuideGrid.kt:345-365); the mouse wheel,
 * drag and touch pan scroll the box.
 */
export function GuideGrid({
  channels,
  programs,
  guideTimes,
  colorCode,
  refreshing,
  restoreKey,
  heldProgramId,
  heldChannelId,
  onClickProgram,
  onClickChannel,
  onFocusCell,
  onHoverProgram,
  onScrollRow,
  onExitUp,
  ref,
}: Props) {
  const { t, locale } = useTranslate()
  const dp = useDp()
  const hourW = dp(D.timelineHourWidth)
  const rowH = dp(D.channelHeight)
  const chW = dp(D.channelWidth)
  const tlH = dp(D.timelineHeight)
  const lineW = dp(D.currentTimeWidth)

  const box = useRef<HTMLDivElement>(null)
  const [view, setView] = useState<View>({ left: 0, top: 0, width: 0, height: 0 })
  const [focus, setFocus] = useState<GuidePosition | null>(() => savedViews.get(restoreKey)?.focus ?? null)
  const [now, setNow] = useState(() => Date.now())

  const guideStart = guideTimes[0] ?? 0
  const hours = guideHours(guideTimes)
  const contentW = chW + hours * hourW
  const contentH = tlH + channels.length * rowH

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), NOW_TICK_MS)
    return () => clearInterval(id)
  }, [])

  // Mouse hover takes the header only after the shared intent delay; keyboard focus is immediate.
  const hover = useHoverIntent<string>()

  // ---- scroll tracking --------------------------------------------------------------------------------------
  const frame = useRef(0)
  const readView = useCallback(() => {
    const el = box.current
    if (!el) return
    setView((v) =>
      v.left === el.scrollLeft && v.top === el.scrollTop && v.width === el.clientWidth && v.height === el.clientHeight
        ? v
        : { left: el.scrollLeft, top: el.scrollTop, width: el.clientWidth, height: el.clientHeight },
    )
  }, [])
  const scrollRowTimer = useRef(0)
  const onScroll = () => {
    cancelAnimationFrame(frame.current)
    frame.current = requestAnimationFrame(readView)
    const el = box.current
    if (el) {
      const saved = savedViews.get(restoreKey)
      savedViews.set(restoreKey, { left: el.scrollLeft, top: el.scrollTop, focus: saved?.focus ?? null })
    }
    window.clearTimeout(scrollRowTimer.current)
    scrollRowTimer.current = window.setTimeout(() => {
      const e = box.current
      if (!e || channels.length === 0) return
      const mid = Math.floor((e.scrollTop + (e.clientHeight - tlH) / 2) / rowH)
      onScrollRow(Math.max(0, Math.min(channels.length - 1, mid)))
    }, 150)
  }
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    readView()
    const stopObserving = observeResize(el, readView)
    return () => {
      stopObserving()
      cancelAnimationFrame(frame.current)
      window.clearTimeout(scrollRowTimer.current)
    }
  }, [readView])

  // Restore the scroll offset of this history entry once the content has its size.
  const restored = useRef(false)
  useLayoutEffect(() => {
    if (restored.current || channels.length === 0) return
    restored.current = true
    const saved = savedViews.get(restoreKey)
    const el = box.current
    if (saved && el) {
      el.scrollTo({ left: saved.left, top: saved.top })
      readView()
    }
  }, [channels.length, restoreKey, readView])

  // ---- geometry ---------------------------------------------------------------------------------------------
  const listOf = useCallback((row: number) => programs.byChannel.get(channels[row]?.id ?? '') ?? [], [programs, channels])
  const spanOf = (p: TvProgram) => ({ start: p.startHours, end: p.startHours + Math.abs(p.endHours - p.startHours) })

  const scrollToCell = (row: number, p: TvProgram | null) => {
    const el = box.current
    if (!el) return
    const smooth = !matchMedia('(prefers-reduced-motion: reduce)').matches
    // ProgramGuideState.animateToProgram / animateToChannel with centre alignment inside the area that is not
    // covered by the sticky channel column / timeline row
    const top = tlH + row * rowH + rowH / 2 - tlH - (el.clientHeight - tlH) / 2
    let left = el.scrollLeft
    if (p) {
      const s = spanOf(p)
      left = s.start * hourW + ((s.end - s.start) * hourW) / 2 - (el.clientWidth - chW) / 2
    }
    el.scrollTo({
      left: Math.max(0, Math.min(left, el.scrollWidth - el.clientWidth)),
      top: Math.max(0, Math.min(top, el.scrollHeight - el.clientHeight)),
      behavior: smooth ? 'smooth' : 'auto',
    })
  }

  const focusCell = (pos: GuidePosition) => {
    // render the target now (the focused cell is always rendered, even off screen) so that a held arrow key
    // moves from the cell it just reached
    flushSync(() => setFocus(pos))
    const p = pos.programId ? (listOf(pos.row).find((x) => x.id === pos.programId) ?? null) : null
    const sel = pos.programId ? `[data-focus-key="lt-program:${CSS.escape(pos.programId)}"]` : `[data-channel][data-row="${pos.row}"]`
    box.current?.querySelector<HTMLElement>(sel)?.focus({ preventScroll: true })
    scrollToCell(pos.row, p)
  }

  useImperativeHandle(ref, () => ({
    jumpToNow() {
      const first = listOf(0)[0]
      if (isKeyboardModality() && first) {
        focusCell({ row: 0, programId: first.id })
      } else {
        box.current?.scrollTo({ left: 0, top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
      }
    },
    focusFirstRow() {
      if (channels.length === 0) return false
      if (focus?.row === 0 && focus.programId == null) {
        focusCell({ row: 0, programId: null })
        return true
      }
      const list = listOf(0)
      if (list.length === 0) return false
      const last = focus?.row === 0 && focus.programId ? list.find((p) => p.id === focus.programId) : undefined
      focusCell({ row: 0, programId: (last ?? list[programAtHour(list, view.left / hourW)]).id })
      return true
    },
  }))

  // TvGuideGrid.kt LaunchedEffect(Unit) { focusRequester.tryRequestFocus() }: once the first row's programs are
  // there, keyboard focus moves to the first program. Only when focus is still at the page entry (the body or
  // this page's tab row, where the shell's entry focus lands while the guide loads), never on a touch-only
  // device and never over a focus restored on Back. Like Home, a mouse arrival also gets it (the focus look
  // stays hidden while data-pointer is set), so a keyboard user who opened /livetv directly starts in the guide.
  const entryFocused = useRef(false)
  const firstProgramId = listOf(0)[0]?.id ?? null
  useEffect(() => {
    if (entryFocused.current || firstProgramId == null) return
    entryFocused.current = true
    if (savedViews.get(restoreKey)?.focus || matchMedia('(hover: none)').matches) return
    const atEntry = mayTakeInitialFocus() || document.activeElement?.closest('[role="tablist"]') != null
    if (!atEntry) return
    box.current?.querySelector<HTMLElement>(`[data-focus-key="lt-program:${CSS.escape(firstProgramId)}"]`)?.focus({ preventScroll: true })
  }, [firstProgramId, restoreKey])

  const handleFocus = (pos: GuidePosition, program: TvProgram | null) => {
    setFocus(pos)
    const keyboard = isKeyboardModality()
    savedViews.set(restoreKey, { left: box.current?.scrollLeft ?? 0, top: box.current?.scrollTop ?? 0, focus: pos })
    onFocusCell(pos, program, keyboard)
  }

  // ---- keyboard ---------------------------------------------------------------------------------------------
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
    const target = e.target as HTMLElement
    const rowAttr = target.closest<HTMLElement>('[data-row]')?.dataset.row
    if (rowAttr == null) return
    const row = Number(rowAttr)
    const isChannel = target.hasAttribute('data-channel')
    const list = listOf(row)
    const col = isChannel ? -1 : Number(target.dataset.col ?? -1)
    const current = col >= 0 ? list[col] : null
    const go = (pos: GuidePosition) => {
      e.preventDefault()
      focusCell(pos)
    }
    const toRow = (r: number) => {
      const l = listOf(r)
      if (isChannel || !current || l.length === 0) return go({ row: r, programId: isChannel || l.length === 0 ? null : l[programAtHour(l, view.left / hourW)].id })
      const i = verticalTarget(l, spanOf(current))
      return go({ row: r, programId: l[i]?.id ?? null })
    }
    switch (e.key) {
      case 'ArrowRight':
        if (isChannel) {
          if (list.length) go({ row, programId: list[programAtHour(list, view.left / hourW)].id })
        } else if (col < list.length - 1) go({ row, programId: list[col + 1].id })
        else e.preventDefault()
        return
      case 'ArrowLeft':
        if (isChannel) {
          // Leaves the grid for the drawer. The guide is left-to-right in every language (time runs to the
          // right), so in a right-to-left interface its left edge is still where it is left: the shell's own
          // rule (Right from the page's start edge) can never apply inside it, and the drawer was out of reach.
          if (document.documentElement.dir === 'rtl' && focusDrawerEntry()) e.preventDefault()
          return
        }
        if (col > 0) go({ row, programId: list[col - 1].id })
        else go({ row, programId: null })
        return
      case 'ArrowDown':
        if (row < channels.length - 1) toRow(row + 1)
        else e.preventDefault()
        return
      case 'ArrowUp':
        if (row > 0) toRow(row - 1)
        else if (onExitUp?.()) e.preventDefault()
        return // row 0: up to the view-options button / tabs
      case 'Escape':
      case 'GoBack':
      case 'XF86Back': {
        // BackHandler(column > 0): the row's first program; BackHandler(row > 0): the first program of the guide
        if (col > 0 && list[0]) {
          go({ row, programId: list[0].id })
        } else if (row > 0) {
          const first = listOf(0)[0]
          go({ row: 0, programId: first?.id ?? null })
        }
        return
      }
    }
  }

  // ---- mouse drag-scroll ------------------------------------------------------------------------------------
  const drag = useRef<{ x: number; y: number; left: number; top: number; active: boolean; id: number } | null>(null)
  const suppressClick = useRef(false)
  // the press belongs to the guide: no text selection, and no drag-and-drop of a selection that covers a cell
  useEffect(() => (box.current ? keepPressToControl(box.current) : undefined), [])
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse' || e.button !== 0 || !box.current) return
    drag.current = { x: e.clientX, y: e.clientY, left: box.current.scrollLeft, top: box.current.scrollTop, active: false, id: e.pointerId }
  }
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    const el = box.current
    if (!d || !el || d.id !== e.pointerId) return
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    if (!d.active) {
      if (Math.hypot(dx, dy) < DRAG_SLOP_PX) return
      d.active = true
      el.setPointerCapture(e.pointerId)
    }
    el.scrollLeft = d.left - dx
    el.scrollTop = d.top - dy
  }
  const endDrag = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    if (d.active) suppressClick.current = true
    drag.current = null
  }
  const onClickCapture = (e: MouseEvent) => {
    if (suppressClick.current) {
      suppressClick.current = false
      e.preventDefault()
      e.stopPropagation()
    }
  }

  // ---- visible window ---------------------------------------------------------------------------------------
  const firstRow = Math.max(0, Math.floor(view.top / rowH) - OVERSCAN_ROWS)
  const lastRow = Math.min(channels.length - 1, Math.ceil((view.top + view.height) / rowH) + OVERSCAN_ROWS)
  const h0 = view.left / hourW - OVERSCAN_HOURS
  const h1 = (view.left + Math.max(0, view.width - chW)) / hourW + OVERSCAN_HOURS
  const tabbableId = focus?.programId ?? (focus ? null : firstProgramId)
  const tabbableChannelRow = focus && focus.programId == null ? focus.row : -1

  const programCells: ReactNode[] = []
  const channelCells: ReactNode[] = []
  const rows = new Set<number>()
  for (let r = firstRow; r <= lastRow; r++) rows.add(r)
  if (focus && focus.row < channels.length) rows.add(focus.row)
  for (const r of rows) {
    const list = listOf(r)
    const ch = channels[r]
    if (!ch) continue
    channelCells.push(
      <ChannelCell
        key={`c:${ch.id}`}
        channel={ch}
        row={r}
        tabbable={tabbableChannelRow === r}
        held={ch.id === heldChannelId}
        style={{ top: r * rowH, left: 0, width: chW, height: rowH }}
        onClick={() => onClickChannel(r, ch)}
        // upstream: a focused channel is position (row, 0), so the header shows the row's first program
        onFocus={() => handleFocus({ row: r, programId: null }, listOf(r)[0] ?? null)}
      />,
    )
    const inWindow = r >= firstRow && r <= lastRow
    const start = inWindow && list.length ? programAtHour(list, Math.max(0, h0)) : list.length
    const render = (i: number) => {
      const p = list[i]
      const s = spanOf(p)
      programCells.push(
        <ProgramCell
          key={`p:${p.id}`}
          program={p}
          subtitle={programSubtitle(p, t)}
          startedBeforeGuide={p.start < guideStart}
          colorCode={colorCode}
          row={r}
          column={i}
          tabbable={p.id === tabbableId}
          held={p.id === heldProgramId}
          isDefault={r === 0 && i === 0}
          style={{ left: chW + s.start * hourW, top: tlH + r * rowH, width: (s.end - s.start) * hourW, height: rowH }}
          onClick={() => onClickProgram(p)}
          onFocus={() => handleFocus({ row: r, programId: p.id }, p)}
          onPointerEnter={(e) => isHoverPointer(e) && hover.over(p.id, () => onHoverProgram(p))}
        />,
      )
    }
    let rendered = false
    for (let i = start; i < list.length && list[i].startHours < h1; i++) {
      render(i)
      if (list[i].id === focus?.programId) rendered = true
    }
    if (focus?.row === r && focus.programId && !rendered) {
      const i = list.findIndex((p) => p.id === focus.programId)
      if (i >= 0) render(i)
    }
    // the default (first) program stays in the DOM so the shell can always find it
    if (r === 0 && list.length && start > 0 && focus?.programId !== list[0].id) render(0)
  }

  const timelineCells: ReactNode[] = []
  for (let i = 0; i < guideTimes.length; i++) {
    const { startHour, endHour } = timelineSpan(guideTimes, i)
    if (endHour < h0 || startHour > h1) continue
    timelineCells.push(
      <div
        key={guideTimes[i]}
        className={styles.time}
        style={{ left: chW + startHour * hourW, width: (endHour - startHour) * hourW, height: tlH }}
      >
        <span className={styles.timeInner}>{timelineLabel(guideTimes[i], guideStart, locale)}</span>
      </div>,
    )
  }

  const nowX = chW + hoursBetween(guideStart, now) * hourW

  return (
    <div className={styles.wrap}>
      <div
        ref={box}
        className={styles.box}
        onScroll={onScroll}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClickCapture={onClickCapture}
        onPointerLeave={(e) => {
          hover.leave()
          if (isHoverPointer(e)) onHoverProgram(null)
        }}
        role="grid"
        aria-label={t('tv_guide')}
        aria-rowcount={channels.length}
      >
        <div className={styles.content} style={{ width: contentW, height: contentH }}>
          <div className={styles.timeline} style={{ width: contentW, height: tlH }}>
            {timelineCells}
            <div className={styles.corner} style={{ width: chW, height: tlH }} />
          </div>
          <div className={styles.layer}>{programCells}</div>
          {nowX >= chW && (
            <div
              className={styles.now}
              aria-hidden
              style={{ left: nowX, width: lineW, height: contentH }}
            />
          )}
          <div className={styles.channels} style={{ width: chW, height: contentH - tlH }}>
            {channelCells}
          </div>
        </div>
      </div>
      {refreshing && (
        <div className={styles.refreshing}>
          <CircularProgress size={32} label={t('loading')} />
        </div>
      )}
    </div>
  )
}
