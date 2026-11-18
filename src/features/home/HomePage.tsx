import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models'
import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type FocusEvent, type KeyboardEvent } from 'react'
import { useLocation, useNavigate, useNavigationType } from 'react-router'
import { submitBackdrop } from '../../app/backdrop'
import { nav } from '../../app/nav'
import { focusDrawerEntry, mayTakeInitialFocus } from '../../app/shell/shellFocus'
import { useShellStore } from '../../app/shell/shellStore'
import { useScrollRestore } from '../../app/useScrollRestore'
import { usePrefs } from '../../stores/preferences'
import { CircularProgress, ErrorMessage, LoadingPage } from '../../ui'
import { useFitViewport } from '../browse/components/fitViewport'
import { useCardContext } from '../common/cardAdapters'
import { invalidateAllDatePlayed } from '../common/datePlayed'
import { isPlayKeyType } from '../common/itemKinds'
import { resumeMs } from '../common/itemMenu'
import { useLibraries } from '../common/libraries'
import { useItemContextMenu } from '../common/useItemContextMenu'
import { useTranslate } from '../common/useTranslate'
import { homeRowsKey, useHomeRows, useHomeSettings, type HomeRowState } from './data/useHomeData'
import { loadEntryState, saveEntryState } from './entryState'
import { POS_ATTR } from './homeCardLayout'
import { HomeHeader } from './HomeHeader'
import styles from './HomePage.module.css'
import { HomeRowView } from './HomeRowView'
import { parsePos, ROW_ATTR, useHomeFocus, type HomePos } from './useHomeFocus'

function itemAt(rows: HomeRowState[], pos: HomePos | null): BaseItemDto | null {
  if (!pos) return null
  return rows[pos.row]?.query.data?.items[pos.col] ?? null
}

/**
 * The position the header follows: `pos` while its row still has that column (the View more card is
 * column `items.length` and leaves the header empty, HomePage.kt:303-308), else the first card of the
 * first non-empty row (TV: initial focus).
 */
function headerPosition(rows: HomeRowState[], pos: HomePos | null): HomePos | null {
  const data = pos ? rows[pos.row]?.query.data : undefined
  if (pos && data && (pos.col < data.items.length || (pos.col === data.items.length && data.showViewMore))) return pos
  return firstPos(rows)
}

/**
 * The header shows the first card of the first non-empty row until the user picks one (TV: initial focus).
 * Upstream only shows Home once every row loaded; rows load progressively here, so a row that is still
 * loading above the first non-empty one blocks the pick (else launch focus lands on a later row).
 */
function firstPos(rows: HomeRowState[]): HomePos | null {
  for (const r of rows) {
    if (r.query.data === undefined && !r.query.isError) return null
    if ((r.query.data?.items.length ?? 0) > 0) return { row: r.index, col: 0 }
  }
  return null
}

type EntryState = { pos: HomePos | null; cols: Record<number, number> }

/** Focusable elements of one row element: its cards (by column), or the loading / error row. */
function rowTargets(rowEl: Element): HTMLElement[] {
  return Array.from(rowEl.querySelectorAll<HTMLElement>('[data-focusable]')).filter((el) => el.getClientRects().length > 0)
}

function colOf(el: Element | null): number | null {
  return parsePos(el?.closest(`[${POS_ATTR}]`)?.getAttribute(POS_ATTR))?.col ?? null
}

function focusCard(el: HTMLElement) {
  el.focus({ preventScroll: true })
  el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
}

/** `homeReload` value seen by the last Home mount (drawer "Home" while on Home = brand-new Home). */
let seenHomeReload: number | null = null

/** Home (upstream `HomePage` + `HomeViewModel`). */
export default function HomePage() {
  const { t } = useTranslate()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const location = useLocation()
  const navType = useNavigationType()
  const settings = useHomeSettings()
  const libraries = useLibraries()
  const rows = useHomeRows(settings.data?.rows, libraries.data)
  const showLogo = usePrefs('showLogos')
  const toggles = usePrefs('displayToggles')
  const showClock = usePrefs('showClock')
  const clickToPlay = usePrefs('homeClickToPlay')
  const ctx = useCardContext()
  const menu = useItemContextMenu({ showGoTo: true, showStreamChoices: false })

  // ---- per-entry memory (TV rememberSaveable position) ----
  const entryKey = `home:${location.key}`
  const restoredEntry = useMemo(() => (navType === 'POP' ? loadEntryState<EntryState>(entryKey) : null), [entryKey, navType])
  const restored = restoredEntry?.pos ?? null
  const [pos, setPos] = useState<HomePos | null>(restored)
  // Column each row was last focused at (upstream ItemRow focusRestorer + rememberInt position).
  const [cols, setCols] = useState<Record<number, number>>(() => restoredEntry?.cols ?? {})
  useEffect(() => {
    if (pos) saveEntryState(entryKey, { pos, cols } satisfies EntryState)
  }, [entryKey, pos, cols])

  // A fresh visit (not Back) starts with a new date-played cache, like a new HomeViewModel.
  useEffect(() => {
    if (navType !== 'POP') invalidateAllDatePlayed()
  }, [navType])

  // Drawer "Home" while already on Home: upstream creates a new HomeViewModel (full loading page).
  const homeReload = useShellStore((s) => s.homeReload)
  useEffect(() => {
    if (seenHomeReload !== null && seenHomeReload !== homeReload) {
      invalidateAllDatePlayed()
      void qc.resetQueries({ queryKey: homeRowsKey() })
    }
    seenHomeReload = homeReload
  }, [homeReload, qc])

  // ---- refresh triggers: tab visible again (rows older than 5 s); return to Home is refetchOnMount ----
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') void qc.refetchQueries({ queryKey: homeRowsKey(), type: 'active', stale: true })
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [qc])

  // ---- header + backdrop ----
  const headerPos = headerPosition(rows, pos)
  const headerItem = itemAt(rows, headerPos)
  useEffect(() => {
    if (headerItem) submitBackdrop(headerItem)
  }, [headerItem])

  // ---- interaction tracking on the rows list ----
  const list = useRef<HTMLDivElement | null>(null)
  const scrollRestoreRef = useScrollRestore<HTMLDivElement>('home-rows')
  const setList = useCallback(
    (el: HTMLDivElement | null) => {
      list.current = el
      scrollRestoreRef(el)
    },
    [scrollRestoreRef],
  )
  const pageRef = useRef<HTMLDivElement | null>(null)
  // Rows render progressively once the first one settles (upstream waits for all of them).
  const ready =
    !!settings.data && !!libraries.data && (rows.length === 0 || rows.some((r) => r.query.data !== undefined || r.query.isError))
  const onPosition = useCallback((p: HomePos) => setPos((cur) => (cur && cur.row === p.row && cur.col === p.col ? cur : p)), [])
  useHomeFocus(list, onPosition, ready)
  useFitViewport(pageRef, ready)

  // ---- Back: refocus the remembered card once its row is there (rows restore their own scroll) ----
  const refocused = useRef(false)
  const restoredRowLoaded = restored ? rows[restored.row]?.query.data !== undefined : false
  useLayoutEffect(() => {
    if (refocused.current || !restored || !restoredRowLoaded) return
    refocused.current = true
    const el = list.current?.querySelector<HTMLElement>(`[${POS_ATTR}="${restored.row}:${restored.col}"]`)
    el?.focus({ preventScroll: true })
  }, [restored, restoredRowLoaded])

  // ---- a refetch that drops or moves the focused card (Continue watching after playback): refocus its slot ----
  // Upstream keeps the RowColumn and refocuses it after the rows refresh; a one-shot restore above cannot.
  const lastFocused = useRef<HTMLElement | null>(null)
  const dataSig = rows.map((r) => r.query.dataUpdatedAt).join(',')
  useLayoutEffect(() => {
    const prev = lastFocused.current
    if (!prev || prev.isConnected || !pos) return
    const active = document.activeElement
    if (active && active !== document.body) return
    const data = rows[pos.row]?.query.data
    const count = data ? data.items.length + (data.showViewMore ? 1 : 0) : 0
    const target =
      count > 0
        ? { row: pos.row, col: Math.min(pos.col, count - 1) }
        : firstPos(rows)
    if (!target) return
    const el = list.current?.querySelector<HTMLElement>(`[${POS_ATTR}="${target.row}:${target.col}"]`)
    if (el) el.focus({ preventScroll: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs when row data changes
  }, [dataSig])

  // ---- TV launch: the first card of the first non-empty row takes focus (HomePage.kt:317-336) ----
  const firstRowLoaded = firstPos(rows) !== null
  const autoFocused = useRef(false)
  useEffect(() => {
    if (autoFocused.current || restored || !firstRowLoaded) return
    autoFocused.current = true
    // Never steal focus (drawer, shell restore), and touch-only devices have no focus to show.
    if (matchMedia('(hover: none)').matches) return
    requestAnimationFrame(() => {
      if (!mayTakeInitialFocus()) return
      const el = list.current?.querySelector<HTMLElement>('[data-focus-default]')
      el?.focus({ preventScroll: true })
    })
  }, [restored, firstRowLoaded])

  const onRowFocus = (e: FocusEvent<HTMLDivElement>) => {
    const p = parsePos((e.target as HTMLElement).getAttribute(POS_ATTR))
    if (p) lastFocused.current = e.target as HTMLElement
    if (p) setCols((c) => (c[p.row] === p.col ? c : { ...c, [p.row]: p.col }))
  }

  /**
   * D-pad inside the rows (upstream LazyRow / focusRestorer): Left/Right stay in the row and stop at its
   * ends (Left on the first card goes to the drawer); Up/Down enter the adjacent row at the card last
   * focused there, else its first card.
   */
  const onArrowKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
    const target = e.target as HTMLElement
    const rowEl = target.closest<HTMLElement>(`[${ROW_ATTR}]`)
    if (!rowEl || !target.matches('[data-focusable]')) return
    const rtl = getComputedStyle(rowEl).direction === 'rtl'
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      const col = colOf(target)
      const step = (e.key === 'ArrowRight') !== rtl ? 1 : -1
      const next = col == null ? undefined : rowTargets(rowEl).find((el) => colOf(el) === col + step)
      if (next) focusCard(next)
      else if (step < 0 && (col ?? 0) <= 0 && !focusDrawerEntry()) return
      e.preventDefault()
      return
    }
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
    const allRows = Array.from(list.current?.querySelectorAll<HTMLElement>(`[${ROW_ATTR}]`) ?? [])
    const from = allRows.indexOf(rowEl)
    const dir = e.key === 'ArrowDown' ? 1 : -1
    for (let i = from + dir; i >= 0 && i < allRows.length; i += dir) {
      const targets = rowTargets(allRows[i])
      if (!targets.length) continue
      const want = cols[Number(allRows[i].getAttribute(ROW_ATTR))] ?? 0
      let pick = targets[0]
      for (const el of targets) {
        const c = colOf(el)
        if (c != null && c <= want) pick = el
      }
      focusCard(pick)
      e.preventDefault()
      return
    }
    // Last row: nothing below (upstream LazyColumn end), unless the music mini player shows under the page: its
    // window handler takes the key that nothing used (MiniPlayer.tsx). Above the first row the shell decides.
    if (dir > 0 && document.body.dataset.musicBar === undefined) e.preventDefault()
  }

  // ---- media Play key on a focused playable card ----
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key.startsWith('Arrow')) return onArrowKey(e)
    if (e.key !== 'MediaPlayPause' && e.key !== 'MediaPlay') return
    const p = parsePos((e.target as HTMLElement).closest(`[${POS_ATTR}]`)?.getAttribute(POS_ATTR))
    const item = itemAt(rows, p)
    if (item?.Id && isPlayKeyType(item.Type)) {
      e.preventDefault()
      void navigate(nav.play(item.Id, { t: resumeMs(item) }))
    }
  }

  if (settings.isError || libraries.isError) {
    const err = settings.error ?? libraries.error
    return (
      <div className={styles.page}>
        <ErrorMessage title={t('compose_error_message_title')} detail={err instanceof Error ? err.message : String(err)} />
      </div>
    )
  }
  if (!ready) {
    return (
      <div className={styles.page}>
        <LoadingPage label={t('loading')} />
      </div>
    )
  }

  const refreshing = rows.some((r) => r.query.isFetching && r.query.data !== undefined)
  const focusPos = pos ?? headerPos

  return (
    <div ref={pageRef} className={styles.page}>
      <HomeHeader item={headerItem} showLogo={showLogo} toggles={toggles} />
      <div ref={setList} className={styles.rows} onKeyDown={onKeyDown} onFocus={onRowFocus} data-focus-group data-home-rows>
        {rows.map((row) => (
          <div key={row.index} className={styles.row} {...{ [ROW_ATTR]: row.index }} data-focus-group>
            <HomeRowView
              row={row}
              libraries={libraries.data ?? []}
              t={t}
              ctx={ctx}
              menu={menu}
              clickToPlay={clickToPlay}
              restoreKey={`home:${location.key}:${row.index}`}
              focusColumn={focusPos?.row === row.index ? focusPos.col : -1}
              tabColumn={cols[row.index] ?? 0}
            />
          </div>
        ))}
      </div>
      {refreshing && (
        <div className={showClock ? styles.spinnerClock : styles.spinner}>
          <CircularProgress size={40} label={t('loading')} />
        </div>
      )}
      {menu.element}
    </div>
  )
}
