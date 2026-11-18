import type { BaseItemDto, CollectionType, ItemSortBy } from '@jellyfin/sdk/lib/generated-client/models'
import { useQueryClient } from '@tanstack/react-query'
import { useVirtualizer } from '@tanstack/react-virtual'
import clsx from 'clsx'
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode, type RefObject } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { useApi, useSession } from '../../../api/session'
import { clearBackdrop, submitBackdrop } from '../../../app/backdrop'
import { itemDestination, nav } from '../../../app/nav'
import { toast } from '../../../app/toast'
import { usePrefs } from '../../../stores/preferences'
import { useDp } from '../../../theme/scale'
import { AlphabetPicker, bringIntoView, CardGrid, ErrorMessage, GridCard, LoadingPage, letterForSortName, observeResize, type CardActions, type CardGridHandle } from '../../../ui'
import { gridCardProps, useCardContext } from '../../common/cardAdapters'
import type { ItemDep } from '../../common/itemCache'
import { isPlayKeyType } from '../../common/itemKinds'
import { resumeMs, type ItemMenuOptions } from '../../common/itemMenu'
import { isHoverPointer, useHoverIntent } from '../../common/hoverIntent'
import { useLinkClick } from '../../common/links'
import { useItemContextMenu } from '../../common/useItemContextMenu'
import { useTranslate } from '../../common/useTranslate'
import { aspectValue, contentScaleFit } from '../../common/viewOptions'
import { HomeHeader } from '../../home/HomeHeader'
import { getFilterValues } from '../data/filterValues'
import { useGridState, type GridState } from '../data/useGridState'
import { usePagedItems, type PageFetcher } from '../data/usePagedItems'
import { useVisitKey } from '../data/visit'
import type { FilterDef, GetItemsFilter } from '../model/filter'
import { gridContentWidthPx, jumpStep, webColumns } from '../model/gridColumns'
import type { SortAndDirection } from '../model/sort'
import type { ViewOptions } from '../model/viewOptions'
import { GridHeader } from './GridHeader'
import { enterLetterColumn, leaveLetterColumn } from './letterFocus'
import styles from './LibraryGrid.module.css'
import { ListDetails } from './ListDetails'
import { ListRow } from './ListRow'
import { ViewOptionsDialog } from './ViewOptionsDialog'
import { mayTakeInitialFocus } from '../../../app/shell'

/** What a grid shows for a given sort / filter (CollectionFolderViewModel.createPager). */
export type GridSource = {
  key: readonly unknown[]
  fetchPage: PageFetcher
  pageSize?: number
  deps?: ItemDep[]
  /** `positionOfLetter`; absent = no letter jump (`/Persons`). */
  letterIndex?: (letter: string, total: number) => Promise<number>
}

export type LibraryGridProps = {
  displayId: string
  useSaved?: boolean
  isOverride?: boolean
  /** The library / folder (ancestor lookup, photo-album play). */
  item?: BaseItemDto | null
  /** The grid's request is recursive (Random on a photo opens the slideshow with it). Default true. */
  recursive?: boolean
  pageFilter: GetItemsFilter
  initialSort?: SortAndDirection | null
  defaultViewOptions: ViewOptions
  source: (s: GridState) => GridSource
  sortOptions: readonly ItemSortBy[]
  filterOptions: readonly FilterDef[]
  /** Parent for the filter values (`null` = whole server, favorites). */
  filterParentId: string | null
  playEnabled: boolean
  /**
   * Grid cards of episodes show the series image (CollectionFolderViewModel: useSeriesForPrimary = true).
   * Favorites builds its own pagers with the default false, so its episode cards show the episode image.
   */
  useSeriesForPrimary?: boolean
  onPlayAll?: (s: GridState, shuffle: boolean) => void
  title?: string | null
  showTitle?: boolean
  collectionType?: CollectionType | null
  menuOptions?: ItemMenuOptions
  /** Collapse the page's tab row while the grid is scrolled (upstream showHeader = position < columns). */
  onScrolled?: (scrolled: boolean) => void
  /** Content for an empty result instead of "No results". */
  emptyContent?: ReactNode
  /** List-mode row override (`listItemContent`, e.g. PlaylistDetails' PlaylistItem); default ListRow. */
  renderListRow?: (row: ListRowArgs) => ReactNode
  /** Per-item menu options on top of `menuOptions` (e.g. "Remove from playlist" with the item's index). */
  menuOptionsFor?: (item: BaseItemDto, index: number, s: GridState) => ItemMenuOptions | undefined
  /**
   * Another menu for an item instead of the item menu (the music menu on a playlist's songs, PlaylistDetails.kt
   * `ContextMenu.ForMusic`); undefined = the item menu.
   */
  menuFor?: (item: BaseItemDto, index: number, s: GridState) => ItemMenuActions | undefined
  /** TV Play key on a focused item (`onClickPlayRemoteButton`); default plays the item itself (grid mode only). */
  onPlayItem?: (index: number, item: BaseItemDto, s: GridState) => void
}

/** Right-click / Menu key / long-press and the "more" button of a card or row. */
export type ItemMenuActions = Pick<CardActions, 'onContextMenu' | 'onMore' | 'moreLabel'>

/** What a list-mode row gets (upstream GridItemDetails). */
export type ListRowArgs = {
  /** The grid's current sort / filter / view options. */
  state: GridState
  index: number
  /** The last row of the list. */
  isLast: boolean
  item: BaseItemDto | undefined
  dense: boolean
  href: string | undefined
  onClick: ((e: MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>) => void) | undefined
  onContextMenu: ((e: MouseEvent<HTMLElement>) => void) | undefined
  /** Opens the row's menu as a centered dialog (the row's "More" button, which is passed as the anchor). */
  openMenu: (anchor: HTMLElement) => void
}

const HIDE_AFTER_PX = 24

/**
 * `CollectionFolderView` (W/ui/components/CollectionFolderView.kt) with `CollectionFolderGrid` /
 * `CollectionFolderList`: the header row, a virtualized card grid (or list) paged 100 at a time, the
 * alphabet column (name sort), the "n / total" footer, the view options dialog and the item menu.
 */
export function LibraryGrid(props: LibraryGridProps) {
  const { state, setSort, setFilter, setViewOptions } = useGridState({
    displayId: props.displayId,
    useSaved: props.useSaved ?? true,
    isOverride: props.isOverride ?? false,
    item: props.item,
    pageFilter: props.pageFilter,
    initialSort: props.initialSort,
    defaultViewOptions: props.defaultViewOptions,
  })
  if (!state) return <LoadingPage />
  return <GridView {...props} state={state} setSort={setSort} setFilter={setFilter} setViewOptions={setViewOptions} />
}

function GridView({
  state,
  setSort,
  setFilter,
  setViewOptions,
  ...p
}: LibraryGridProps & {
  state: GridState
  setSort: (s: SortAndDirection) => void
  setFilter: (f: GetItemsFilter) => void
  setViewOptions: (v: ViewOptions) => void
}) {
  const { t } = useTranslate()
  const api = useApi()
  const qc = useQueryClient()
  const session = useSession()
  const navigate = useNavigate()
  const location = useLocation()
  const dp = useDp()
  const ctx = useCardContext()
  const linkClick = useLinkClick()
  const showLogos = usePrefs('showLogos')
  const toggles = usePrefs('displayToggles')
  const menu = useItemContextMenu({ showGoTo: true, showStreamChoices: false, ...p.menuOptions })
  /** The page's own menu for the item when it has one (`menuFor`), else the item menu. */
  const menuActions = (item: BaseItemDto, index: number): ItemMenuActions =>
    p.menuFor?.(item, index, state) ?? menu.cardActions(item, p.menuOptionsFor?.(item, index, state))
  const vo = state.viewOptions
  const source = p.source(state)
  const paged = usePagedItems({ key: source.key, fetchPage: source.fetchPage, pageSize: source.pageSize, deps: source.deps })
  const total = paged.total
  const loaded = paged.status === 'success'
  const sortByName = state.sort.sort === 'SortName'
  const letters = sortByName && !!source.letterIndex
  const requestKey = JSON.stringify(source.key)

  // ---- position (TV focused index): keyboard focus, mouse hover, touch tap ----
  // Upstream's focused index starts at 0 (CardGrid startPosition), so before any focus / hover / tap the
  // footer, letter and details follow the first item, as on the TV.
  const [position, setPosition] = useState(-1)
  const shownIndex = Math.max(position, 0)
  const focused = total > 0 ? paged.peek(shownIndex) : undefined
  useEffect(() => setPosition(-1), [requestKey])

  // ---- backdrop: library pages clear it; "Show backdrop" follows the focused item ----
  useEffect(() => {
    if (!vo.showBackdrop) clearBackdrop()
  }, [vo.showBackdrop])
  useEffect(() => {
    if (vo.showBackdrop && focused) submitBackdrop(focused)
  }, [vo.showBackdrop, focused])

  // ---- scroll container, header collapse ----
  const scroller = useRef<HTMLDivElement | null>(null)
  const [width, setWidth] = useState(0)
  const [scrolled, setScrolled] = useState(false)
  const scrolledByFocus = useRef(false)
  const onScrolledRef = useRef(p.onScrolled)
  useEffect(() => {
    onScrolledRef.current = p.onScrolled
  })
  useLayoutEffect(() => {
    const el = scroller.current
    if (!el) return
    setWidth(gridContentWidthPx(el))
    const stopObserving = observeResize(el, () => setWidth(gridContentWidthPx(el)))
    const onScroll = () => {
      const s = el.scrollTop > HIDE_AFTER_PX
      setScrolled((cur) => (cur === s ? cur : s))
    }
    // what moved the grid last: a focus change (arrow keys) or the user scrolling it (wheel, touch, scrollbar,
    // Page Down); a keydown that moves focus is followed by its focusin
    const byUser = () => {
      scrolledByFocus.current = false
    }
    const byFocus = () => {
      scrolledByFocus.current = true
    }
    const userEvents = ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const
    el.addEventListener('scroll', onScroll, { passive: true })
    el.addEventListener('focusin', byFocus)
    for (const t of userEvents) el.addEventListener(t, byUser, { passive: true, capture: true })
    onScroll()
    return () => {
      stopObserving()
      el.removeEventListener('scroll', onScroll)
      el.removeEventListener('focusin', byFocus)
      for (const t of userEvents) el.removeEventListener(t, byUser, { capture: true })
    }
  }, [loaded])
  useEffect(() => onScrolledRef.current?.(scrolled), [scrolled])
  // The header going away changes the list's viewport after the focused item was brought into view: once the
  // collapse has run (250 ms), put the keyboard-focused item on the pivot of the viewport it now has. Not after
  // a wheel or touch scroll: focus did not move, and pulling the card back would undo the user's scroll.
  useEffect(() => {
    if (!scrolled) return
    const id = setTimeout(() => {
      if (!scrolledByFocus.current) return
      const a = document.activeElement
      if (a instanceof HTMLElement && scroller.current?.contains(a) && a.matches(':focus-visible')) bringIntoView(a)
    }, 280)
    return () => clearTimeout(id)
  }, [scrolled])
  useEffect(() => () => onScrolledRef.current?.(false), [])

  const columns = webColumns(width / dp(1), vo.columns, vo.spacing)
  const grid = useRef<CardGridHandle>(null)
  const gridId = `${p.displayId}:${requestKey}:${vo.type}`
  // Scroll memory belongs to the history entry (Back returns to its current location.key).
  const restoreKey = `${location.key}:${gridId}`
  // The grid itself is re-created per visit, not per location.key: a tab page writes ?tab= with a replace
  // navigation right after its first render, and a grid keyed by location.key was then built twice, the
  // second time dropping focus from the first card to <body> (an arrow key pressed in that gap went to the
  // page's first element, the tab row, and stayed there).
  const gridKey = `${useVisitKey()}:${gridId}`

  // ---- first focus: the first card once loaded (CollectionFolderView.kt:1103), never stealing focus ----
  // Also on POP (a direct load or reload is POP); on Back the shell's focus restore puts the remembered card
  // back over it.
  // When the grid is re-created (Back / Forward between two entries of the same page), the first card takes
  // focus again only if focus fell to <body> with the old cards.
  const autoFocusedKey = useRef<string | null>(null)
  useEffect(() => {
    if (!loaded || total === 0 || autoFocusedKey.current === gridKey) return
    const again = autoFocusedKey.current !== null
    autoFocusedKey.current = gridKey
    if (matchMedia('(hover: none)').matches) return
    requestAnimationFrame(() => {
      if (!mayTakeInitialFocus()) return
      if (again && document.activeElement && document.activeElement !== document.body) return
      scroller.current?.querySelector<HTMLElement>('[data-grid-index="0"] [data-focusable]')?.focus({ preventScroll: true })
    })
  }, [loaded, total, gridKey])

  // ---- jumps ----
  const jumpTo = useCallback(
    (index: number, focus = true) => {
      if (index < 0 || total === 0) return
      const i = Math.min(index, total - 1)
      setPosition(i)
      if (vo.type === 'GRID') grid.current?.scrollToIndex(i, { focus })
      else listJump.current?.(i, focus)
    },
    [total, vo.type],
  )
  const listJump = useRef<((i: number, focus: boolean) => void) | null>(null)

  const letterIndex = source.letterIndex
  const jumpToLetter = useCallback(
    (letter: string) => {
      if (!letterIndex) return
      void letterIndex(letter, total)
        .then((i) => jumpTo(i))
        .catch((err: unknown) => toast(`${t('error')}: ${err instanceof Error ? err.message : String(err)}`))
    },
    [letterIndex, total, jumpTo, t],
  )

  // ---- actions ----
  const onRandom = async () => {
    if (!loaded || total === 0) return
    try {
      const index = Math.floor(Math.random() * total)
      const item = await paged.fetchAt(index)
      if (!item?.Id) return
      if (item.Type === 'Photo' && p.item?.Id) {
        // RandomButtonUtils.goToRandom: the grid's own filter, sort and recursive flag, not started
        void navigate(
          nav.slideshow(p.item.Id, {
            index,
            recursive: p.recursive ?? true,
            filter: JSON.stringify(state.filter),
            sort: state.sort.sort,
            order: state.sort.direction === 'Descending' ? 'desc' : 'asc',
          }),
        )
      } else void navigate(itemDestination(item))
    } catch (err) {
      toast(`${t('error')}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const playItem = (index: number) => {
    const item = paged.peek(index)
    if (item && p.onPlayItem) {
      p.onPlayItem(index, item, state)
      return true
    }
    if (!item?.Id || !isPlayKeyType(item.Type)) return false
    if (item.Type === 'PhotoAlbum') {
      void navigate(nav.slideshow(item.Id, { index, recursive: true, start: true }))
    } else void navigate(nav.play(item.Id, { t: resumeMs(item) }))
    return true
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement
    const cell = target.closest<HTMLElement>('[data-grid-index]')
    if (!cell || e.defaultPrevented) return
    const index = Number(cell.dataset.gridIndex)
    const plain = !e.altKey && !e.ctrlKey && !e.metaKey
    // TV media Play key on a focused card: MediaPlay / MediaPlayPause, or Space on the web.
    // A custom play action (playlists) works in list mode too, on the row itself (its own buttons keep Space).
    const playKeys = vo.type === 'GRID' || (p.onPlayItem != null && target === cell.querySelector('[data-focusable]'))
    if ((e.key === 'MediaPlayPause' || e.key === 'MediaPlay' || (e.key === ' ' && plain && !e.shiftKey)) && playKeys) {
      if (playItem(index) || e.key === ' ') e.preventDefault()
      return
    }
    if (!plain) return
    if (letters && vo.type === 'GRID' && columns > 0 && enterLetterColumn(e, index % columns === columns - 1 || index === total - 1)) return
    // Down from a column the shorter last row does not have: the last item (Compose LazyVerticalGrid), not
    // whatever lies below on screen (the letter column).
    if (e.key === 'ArrowDown' && !e.shiftKey && vo.type === 'GRID' && columns > 0) {
      const lastRow = Math.floor((total - 1) / columns)
      if (Math.floor(index / columns) < lastRow && index + columns >= total) {
        e.preventDefault()
        jumpTo(total - 1)
        return
      }
    }
    if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault()
      jumpTo(e.key === 'Home' ? 0 : total - 1)
      return
    }
    if ((e.key === 'PageDown' || e.key === 'PageUp') && vo.type === 'GRID') {
      e.preventDefault()
      // CardGrid.kt jump: from the first visible item (gridState.firstVisibleItemIndex), not the focused one
      const step = jumpStep(total, columns)
      const from = firstVisibleIndex(scroller.current) ?? index
      jumpTo(Math.max(0, Math.min(total - 1, from + (e.key === 'PageDown' ? step : -step))))
      return
    }
    // Physical A-Z keys jump like the letter column (grid mode, name sort).
    if (letters && vo.type === 'GRID' && !e.shiftKey && /^[a-z]$/i.test(e.key)) {
      e.preventDefault()
      jumpToLetter(e.key.toUpperCase())
    }
  }

  const cellIndex = (target: EventTarget | null) => {
    const cell = target instanceof Element ? target.closest<HTMLElement>('[data-grid-index]') : null
    return cell ? Number(cell.dataset.gridIndex) : null
  }
  const trackPosition = (target: EventTarget | null) => {
    const i = cellIndex(target)
    if (i != null) setPosition(i)
  }
  // Mouse hover moves the position (details header, backdrop, footer) only after the shared intent delay.
  const hover = useHoverIntent<number>()

  const [showViewOptions, setShowViewOptions] = useState(false)
  const getValues = (def: FilterDef) => getFilterValues(api, qc, session?.user.id ?? '', p.filterParentId, def.kind)

  const header = (
    <div className={clsx(styles.collapse, scrolled && loaded && styles.collapsed)}>
      <div className={styles.collapseInner}>
        <GridHeader
          title={p.title}
          showTitle={p.showTitle ?? false}
          sortOptions={p.sortOptions}
          sort={state.sort}
          onSortChange={setSort}
          filterOptions={p.filterOptions}
          filter={state.filter}
          onFilterChange={setFilter}
          getFilterValues={getValues}
          onViewOptions={() => setShowViewOptions(true)}
          onRandom={() => void onRandom()}
          playEnabled={p.playEnabled}
          onPlay={(shuffle) => p.onPlayAll?.(state, shuffle)}
          listNotEmpty={loaded && total > 0}
          letters={letters}
        />
      </div>
    </div>
  )

  let body: ReactNode
  if (paged.status === 'error') {
    const err = paged.error
    body = <ErrorMessage title={t('compose_error_message_title')} detail={err instanceof Error ? err.message : String(err)} />
  } else if (!loaded) {
    body = <LoadingPage />
  } else if (total === 0) {
    body = <div className={styles.empty}>{p.emptyContent ?? t('no_results')}</div>
  } else {
    const ratio = aspectValue(vo.aspectRatio)
    const currentLetter = letterForSortName(focused?.SortName ?? focused?.Name)
    body = (
      <div className={clsx(styles.bodyRow, vo.type !== 'GRID' && styles.bodyRowList, vo.type !== 'GRID' && scrolled && styles.bodyRowListHeaderHidden)}>
        {vo.type !== 'GRID' && vo.showDetails && <ListDetails item={focused ?? paged.peek(0)} />}
        <div className={styles.gridBox}>
          <div
            ref={scroller}
            className={styles.scroller}
            onKeyDown={onKeyDown}
            onFocus={(e) => trackPosition(e.target)}
            onPointerOver={(e) => {
              if (!isHoverPointer(e)) return
              const i = cellIndex(e.target)
              hover.over(i, () => i != null && setPosition(i))
            }}
            onPointerLeave={() => hover.leave()}
            onPointerDown={(e) => trackPosition(e.target)}
            data-focus-group
            data-focus-enter="last"
          >
            {vo.type === 'GRID' ? (
              <CardGrid
                key={gridKey}
                ref={grid}
                count={total}
                columns={{ kind: 'fixed', columns }}
                gap={vo.spacing}
                getScrollElement={() => scroller.current}
                restoreKey={restoreKey}
                estimateRowHeight={(w) => w / Math.max(ratio, 2 / 3) + (vo.showTitles ? dp(48) : 0)}
                renderItem={(i, widthPx) => {
                  const item = paged.get(i)
                  const focusKey = `${p.displayId}:${i}`
                  if (!item) {
                    return (
                      <GridCard
                        aspectRatio={ratio}
                        showTitle={vo.showTitles}
                        title={' '}
                        subtitle={' '}
                        surfaceProps={{ 'data-focus-key': focusKey, tabIndex: -1 }}
                      />
                    )
                  }
                  const { href, ...card } = gridCardProps(item, ctx, {
                    widthCss: widthPx,
                    aspectRatio: ratio,
                    fit: contentScaleFit(vo.contentScale),
                    imageType: vo.imageType,
                    useSeries: p.useSeriesForPrimary,
                    showTitle: vo.showTitles,
                  })
                  const unplayed = item.UserData?.UnplayedItemCount ?? 0
                  return (
                    <GridCard
                      {...card}
                      // ItemCardImage.kt:248-262: the raw integer on grid cards
                      unplayedCount={unplayed > 0 ? String(unplayed) : undefined}
                      href={href}
                      onClick={linkClick(href)}
                      {...menuActions(item, i)}
                      surfaceProps={{ 'data-focus-key': focusKey }}
                    />
                  )
                }}
              />
            ) : (
              <ListView
                key={gridKey}
                count={total}
                dense={vo.type === 'DENSE_LIST'}
                spacing={vo.spacing}
                scroller={scroller}
                restoreKey={restoreKey}
                jumpRef={listJump}
                renderRow={(i) => {
                  const item = paged.get(i)
                  const href = item ? itemDestination(item) : undefined
                  const actions = item ? menuActions(item, i) : undefined
                  if (p.renderListRow) {
                    return p.renderListRow({
                      state,
                      index: i,
                      isLast: i === total - 1,
                      item,
                      dense: vo.type === 'DENSE_LIST',
                      href,
                      onClick: href ? linkClick(href) : undefined,
                      onContextMenu: actions?.onContextMenu,
                      openMenu: (anchor) => actions?.onMore?.(anchor),
                    })
                  }
                  return (
                    <ListRow
                      item={item}
                      dense={vo.type === 'DENSE_LIST'}
                      collectionType={p.collectionType}
                      href={href}
                      onClick={href ? linkClick(href) : undefined}
                      onContextMenu={actions?.onContextMenu}
                    />
                  )
                }}
              />
            )}
          </div>
          {vo.type === 'GRID' && (
            <div className={styles.footer} dir="ltr">
              {shownIndex + 1} / {total}
            </div>
          )}
        </div>
        {letters ? (
          <div className={styles.letters} onKeyDown={leaveLetterColumn}>
            <AlphabetPicker current={currentLetter} onSelect={jumpToLetter} label={t('web_jump_to_letter')} />
          </div>
        ) : (
          vo.type === 'GRID' && <div className={styles.lettersSpacer} />
        )}
      </div>
    )
  }

  return (
    <div className={styles.root} data-focus-group>
      {header}
      {vo.showDetails && vo.type === 'GRID' && loaded && total > 0 && (
        <div className={styles.details}>
          <HomeHeader item={focused ?? null} showLogo={showLogos} toggles={toggles} />
        </div>
      )}
      <div className={styles.body}>{body}</div>
      <ViewOptionsDialog
        open={showViewOptions}
        value={vo}
        defaults={p.defaultViewOptions}
        onChange={setViewOptions}
        onClose={() => setShowViewOptions(false)}
      />
      {menu.element}
    </div>
  )
}

/** Index of the first (partly) visible grid cell in the scroller, like LazyGridState.firstVisibleItemIndex. */
function firstVisibleIndex(scroller: HTMLElement | null): number | null {
  if (!scroller) return null
  const top = scroller.getBoundingClientRect().top
  let best: number | null = null
  scroller.querySelectorAll<HTMLElement>('[data-grid-index]').forEach((cell) => {
    if (cell.getBoundingClientRect().bottom <= top + 1) return
    const i = Number(cell.dataset.gridIndex)
    if (best === null || i < best) best = i
  })
  return best
}

type ListViewProps = {
  count: number
  dense: boolean
  spacing: number
  scroller: RefObject<HTMLDivElement | null>
  restoreKey: string
  jumpRef: RefObject<((i: number, focus: boolean) => void) | null>
  renderRow: (index: number) => ReactNode
}

/** `CollectionFolderListContent`: a virtualized column of list rows, gap = spacing. */
function ListView({ count, dense, spacing, scroller, jumpRef, renderRow }: ListViewProps) {
  const dp = useDp()
  const virtualizer = useVirtualizer({
    count,
    getScrollElement: () => scroller.current,
    estimateSize: () => dp(dense ? 40 : 64),
    gap: dp(spacing),
    paddingStart: dp(8),
    paddingEnd: dp(16),
    overscan: 6,
  })
  const container = useRef<HTMLDivElement>(null)
  useEffect(() => {
    jumpRef.current = (i, focus) => {
      virtualizer.scrollToIndex(i, { align: 'start' })
      if (!focus) return
      let tries = 0
      const tryFocus = () => {
        const el = container.current?.querySelector<HTMLElement>(`[data-grid-index="${i}"] [data-focusable]`)
        if (el) el.focus({ preventScroll: true })
        else if (tries++ < 10) requestAnimationFrame(tryFocus)
      }
      requestAnimationFrame(tryFocus)
    }
  })
  return (
    <div ref={container} className={styles.list} style={{ height: virtualizer.getTotalSize() }}>
      {virtualizer.getVirtualItems().map((r) => (
        <div key={r.key} ref={virtualizer.measureElement} data-index={r.index} data-grid-index={r.index} className={styles.listRow} style={{ top: r.start }}>
          {renderRow(r.index)}
        </div>
      ))}
    </div>
  )
}

