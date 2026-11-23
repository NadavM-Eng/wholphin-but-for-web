import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useLocation, useNavigate, useNavigationType } from 'react-router'
import { qk } from '../../api/queryKeys'
import { useApi } from '../../api/session'
import { clearBackdrop } from '../../app/backdrop'
import { nav, type ItemGridState } from '../../app/nav'
import { useDp } from '../../theme/scale'
import { Button, CardGrid, ErrorMessage, GridCard, LoadingPage, observeResize, type CardGridHandle } from '../../ui'
import { gridCardProps, useCardContext } from '../common/cardAdapters'
import { isPlayKeyType } from '../common/itemKinds'
import { resumeMs } from '../common/itemMenu'
import { useLinkClick } from '../common/links'
import { useItemContextMenu } from '../common/useItemContextMenu'
import { useTranslate } from '../common/useTranslate'
import { aspectValue, contentScaleFit } from '../common/viewOptions'
import styles from './components/LibraryGrid.module.css'
import { FullHeightPage } from './components/TabbedPage'
import { fetchGridPage, isGridRequestKind, type GridQuery, type GridRequestParams } from './data/gridRequestKinds'
import { usePagedItems } from './data/usePagedItems'
import { gridContentWidthPx, webColumns } from './model/gridColumns'
import page from './ItemGridPage.module.css'

function readState(state: unknown): { s: ItemGridState; q: GridQuery; p: GridRequestParams } | null {
  const s = state as Partial<ItemGridState> | null
  if (!s || typeof s !== 'object' || typeof s.title !== 'string' || !isGridRequestKind(s.request)) return null
  const p = (s.params ?? {}) as Partial<GridRequestParams>
  if (!p.query || typeof p.query !== 'object') return null
  return { s: s as ItemGridState, q: { request: s.request, query: p.query } as GridQuery, p: p as GridRequestParams }
}

/**
 * `Destination.ItemGrid` (W/ui/components/ItemGrid.kt): a titled grid of any request ("View more"), paged by
 * 100, opening at `initialPosition` (the first item the row did not show). No sort, filter or letters.
 * The request arrives as location state; a fresh load of /grid without it shows a short notice instead.
 */
export default function ItemGridPage() {
  const location = useLocation()
  const parsed = useMemo(() => readState(location.state), [location.state])
  useEffect(() => clearBackdrop(), [])
  return <FullHeightPage>{parsed ? <Grid {...parsed} /> : <Missing />}</FullHeightPage>
}

function Missing() {
  const { t } = useTranslate()
  const navigate = useNavigate()
  return (
    <div className={page.missing}>
      <p className={page.missingText}>{t('web_grid_unavailable')}</p>
      <Button onClick={() => void navigate(nav.home())}>{t('web_go_home')}</Button>
    </div>
  )
}

function Grid({ s, q, p }: { s: ItemGridState; q: GridQuery; p: GridRequestParams }) {
  const { t } = useTranslate()
  const api = useApi()
  const navigate = useNavigate()
  const navType = useNavigationType()
  const location = useLocation()
  const ctx = useCardContext()
  const linkClick = useLinkClick()
  const dp = useDp()
  const menu = useItemContextMenu({ showGoTo: true, showStreamChoices: false })
  const paged = usePagedItems({
    key: qk('browse', 'itemGrid', q),
    fetchPage: (start, limit, withTotal, signal) => fetchGridPage(api, q, start, limit, withTotal, signal),
  })
  const ratio = aspectValue(p.aspectRatio)
  const spacing = p.spacing ?? 16
  const scroller = useRef<HTMLDivElement | null>(null)
  const grid = useRef<CardGridHandle>(null)
  const [width, setWidth] = useState(0)
  const loaded = paged.status === 'success'
  useLayoutEffect(() => {
    const el = scroller.current
    if (!el) return
    setWidth(gridContentWidthPx(el))
    return observeResize(el, () => setWidth(gridContentWidthPx(el)))
  }, [loaded])
  const columns = webColumns(width / dp(1), p.columns ?? 6, spacing)
  const title = s.titleIsKey ? t(s.title) : s.title
  const [position, setPosition] = useState(-1)

  // Open on `initialPosition` (focused), except when coming Back (the shell restores focus).
  const jumped = useRef(false)
  useEffect(() => {
    if (jumped.current || !loaded || paged.total === 0 || width === 0) return
    jumped.current = true
    if (navType === 'POP') return
    const index = Math.min(Math.max(0, s.initialPosition ?? 0), paged.total - 1)
    setPosition(index)
    requestAnimationFrame(() => grid.current?.scrollToIndex(index, { focus: !matchMedia('(hover: none)').matches }))
  }, [loaded, paged.total, width, navType, s.initialPosition])

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'MediaPlayPause' && e.key !== 'MediaPlay' && !(e.key === ' ' && !e.ctrlKey && !e.altKey && !e.metaKey)) return
    const cell = (e.target as HTMLElement).closest<HTMLElement>('[data-grid-index]')
    if (!cell) return
    e.preventDefault()
    const item = paged.peek(Number(cell.dataset.gridIndex))
    if (item?.Id && isPlayKeyType(item.Type)) void navigate(nav.play(item.Id, { t: resumeMs(item) }))
  }

  let body
  if (paged.status === 'error') {
    body = <ErrorMessage title={t('compose_error_message_title')} detail={paged.error instanceof Error ? paged.error.message : String(paged.error)} />
  } else if (!loaded) {
    body = <LoadingPage />
  } else if (paged.total === 0) {
    body = <div className={styles.empty}>{t('no_results')}</div>
  } else {
    body = (
      <div className={styles.bodyRow}>
        <div className={styles.gridBox}>
          <div
            ref={scroller}
            className={styles.scroller}
            data-grid-scroller
            onKeyDown={onKeyDown}
            onFocus={(e) => {
              const cell = (e.target as HTMLElement).closest<HTMLElement>('[data-grid-index]')
              if (cell) setPosition(Number(cell.dataset.gridIndex))
            }}
            data-focus-group
          >
            <CardGrid
              ref={grid}
              count={paged.total}
              columns={{ kind: 'fixed', columns }}
              gap={spacing}
              getScrollElement={() => scroller.current}
              restoreKey={`${location.key}:itemGrid`}
              estimateRowHeight={(w) => w / Math.max(ratio, 2 / 3) + dp(48)}
              renderItem={(i, widthPx) => {
                const item = paged.get(i)
                if (!item) return <GridCard aspectRatio={ratio} title={' '} subtitle={' '} surfaceProps={{ 'data-focus-key': `grid:${i}`, tabIndex: -1 }} />
                const { href, ...card } = gridCardProps(item, ctx, { widthCss: widthPx, aspectRatio: ratio, fit: contentScaleFit('FIT') })
                const unplayed = item.UserData?.UnplayedItemCount ?? 0
                return (
                  <GridCard
                    {...card}
                    unplayedCount={unplayed > 0 ? String(unplayed) : undefined}
                    href={href}
                    onClick={linkClick(href)}
                    {...menu.cardActions(item)}
                    surfaceProps={{ 'data-focus-key': `grid:${i}` }}
                  />
                )
              }}
            />
          </div>
          <div className={styles.footer} dir="ltr">
            {/* upstream's focused index always exists (starts at the grid's start position) */}
            {Math.max(position, 0) + 1} / {paged.total}
          </div>
        </div>
        <div className={styles.lettersSpacer} />
      </div>
    )
  }

  return (
    <div className={styles.root}>
      <h1 className={page.title}>
        <span className={page.titleText} dir="auto">
          {title}
        </span>
      </h1>
      <div className={styles.body}>{body}</div>
      {menu.element}
    </div>
  )
}
