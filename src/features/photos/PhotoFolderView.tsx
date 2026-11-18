import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models'
import { getLibraryApi } from '@jellyfin/sdk/lib/utils/api/library-api'
import { useQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { itemKey, qk } from '../../api/queryKeys'
import { useApi, useSession } from '../../api/session'
import { clearBackdrop, submitBackdrop } from '../../app/backdrop'
import { nav } from '../../app/nav'
import { mayTakeInitialFocus } from '../../app/shell'
import { usePrefs } from '../../stores/preferences'
import { useDp } from '../../theme/scale'
import {
  AlphabetPicker,
  CardGrid,
  DrawableIcon,
  ErrorMessage,
  ExpandableButton,
  FaIcon,
  GridCard,
  JUMP_LETTERS,
  ListItem,
  LoadingPage,
  letterForSortName,
  observeResize,
  type CardGridHandle,
  type GridColumns,
} from '../../ui'
import { leaveLetterColumn } from '../browse/components/letterFocus'
import { webColumns } from '../browse/model/gridColumns'
import { gridCardProps, itemHref, useCardContext } from '../common/cardAdapters'
import { isHoverPointer, useHoverIntent } from '../common/hoverIntent'
import { useLinkClick } from '../common/links'
import { itemSubtitle, itemTitle } from '../common/itemText'
import { useItemContextMenu } from '../common/useItemContextMenu'
import { useTranslate } from '../common/useTranslate'
import { aspectValue, contentScaleFit } from '../common/viewOptions'
import { useHeaderOnFirstRow } from '../common/useHeaderOnFirstRow'
import { HomeHeader } from '../home/HomeHeader'
import { formatRuntime } from '../../lib/format'
import { PhotoFilterButton } from './PhotoFilterButton'
import styles from './PhotoFolderView.module.css'
import { PhotoSortButton } from './PhotoSortButton'
import {
  DEFAULT_SORT,
  gridRequest,
  PHOTO_SORT_OPTIONS,
  queueFilterJson,
  serializeFilter,
  type PhotoFilter,
  type SortAndDirection,
} from './photoQuery'
import { loadDisplayInfo, saveDisplayInfo, VIEW_OPTIONS_WIDE, type ViewOptions } from './photoStorage'
import { usePagedItems, type Page } from './usePagedItems'
import { ViewOptionsPanel } from './ViewOptionsPanel'

export type PhotoFolderViewProps = {
  /** The photo / home-video library (CollectionFolder) or the PhotoAlbum to list. */
  itemId: string
  /** `recursive` of CollectionFolderPhotoAlbum: false for libraries and albums upstream. */
  recursive?: boolean
}

/** `jump1` of CardGrid: columns x 6 / 15 / 50 / 500 by list size. */
function jumpSize(columns: number, total: number): number {
  if (total >= 25000) return columns * 500
  if (total >= 7000) return columns * 50
  if (total >= 2000) return columns * 15
  return columns * 6
}

/**
 * Photo and home-video browsing (W/ui/detail/CollectionFolderPhotoAlbum.kt on CollectionFolderView): title,
 * Sort / Filter / View options on the start side, Random / Play / Shuffle on the end side, a 16:9 card grid
 * (4 columns, 24dp spacing, crop) with the letter column while sorted by name, and the "n / total" footer.
 * The column count is the count at the TV's grid width: wider or narrower windows keep the TV card size and
 * change the number of columns, as the other library grids do (browse `webColumns`).
 * Opening a photo starts the viewer on it with the grid's sort and filter.
 */
export function PhotoFolderView({ itemId, recursive = false }: PhotoFolderViewProps) {
  const { t } = useTranslate()
  const api = useApi()
  const session = useSession()
  const userId = session?.user.id ?? ''
  const navigate = useNavigate()
  const location = useLocation()
  const ctx = useCardContext()
  const linkClick = useLinkClick()
  const menu = useItemContextMenu({ showGoTo: true, showStreamChoices: false })
  const dp = useDp()
  const showLogo = usePrefs('showLogos')
  const toggles = usePrefs('displayToggles')
  const grid = useRef<CardGridHandle>(null)
  const [rootEl, setRootEl] = useState<HTMLDivElement | null>(null)
  const [bodyEl, setBodyEl] = useState<HTMLDivElement | null>(null)
  const [gridEl, setGridEl] = useState<HTMLDivElement | null>(null)
  const [gridWidth, setGridWidth] = useState(0)
  // The grid area runs from under the header to the bottom of the window (the letter column is centred in it and
  // the footer sits at its bottom edge): publish where it starts, in real px, for the CSS.
  useLayoutEffect(() => {
    if (!rootEl || !bodyEl) return
    const fit = () => rootEl.style.setProperty('--photo-grid-top', `${Math.max(0, bodyEl.getBoundingClientRect().top + window.scrollY)}px`)
    fit()
    const stop = observeResize(rootEl, fit)
    window.addEventListener('resize', fit)
    return () => {
      stop()
      window.removeEventListener('resize', fit)
    }
  }, [rootEl, bodyEl])
  useLayoutEffect(() => {
    if (!gridEl) return
    const measure = () => setGridWidth(gridEl.clientWidth)
    measure()
    return observeResize(gridEl, measure)
  }, [gridEl])
  const randomButton = useRef<HTMLElement>(null)

  const folder = useQuery({
    queryKey: itemKey(itemId),
    enabled: !!session,
    queryFn: async ({ signal }) => (await getLibraryApi(api).getItem({ itemId, userId }, { signal })).data,
  })

  // CollectionFolderViewModel.init: saved sort / filter / view options for this folder, else the page defaults
  const [state, setState] = useState(() => {
    const saved = loadDisplayInfo(itemId)
    return {
      itemId,
      sort: saved.sort ?? DEFAULT_SORT,
      filter: saved.filter ?? ({} as PhotoFilter),
      viewOptions: saved.viewOptions ?? VIEW_OPTIONS_WIDE,
      /** Re-applying Random re-rolls the order. */
      seed: 0,
    }
  })
  if (state.itemId !== itemId) {
    const saved = loadDisplayInfo(itemId)
    setState({ itemId, sort: saved.sort ?? DEFAULT_SORT, filter: saved.filter ?? {}, viewOptions: saved.viewOptions ?? VIEW_OPTIONS_WIDE, seed: 0 })
  }
  const { sort, filter, viewOptions: vo } = state
  const persist = (next: { sort: SortAndDirection; filter: PhotoFilter; viewOptions: ViewOptions }) =>
    saveDisplayInfo(itemId, { sort: next.sort, filter: next.filter, viewOptions: next.viewOptions })

  const setSort = (s: SortAndDirection) =>
    setState((st) => {
      const next = { ...st, sort: s, seed: s.sort === 'Random' ? st.seed + 1 : st.seed }
      persist(next)
      return next
    })
  const setFilter = (f: PhotoFilter) =>
    setState((st) => {
      const next = { ...st, filter: f }
      persist(next)
      return next
    })
  const setViewOptions = (v: ViewOptions) =>
    setState((st) => {
      const next = { ...st, viewOptions: v }
      persist(next)
      return next
    })

  const fetchPage = useCallback(
    async (startIndex: number, limit: number, signal: AbortSignal): Promise<Page> => {
      const res = await getLibraryApi(api).getItems(
        { ...gridRequest({ userId, folderId: itemId, recursive, sort, filter }), startIndex, limit, enableTotalRecordCount: true },
        { signal },
      )
      return { items: res.data.Items ?? [], total: res.data.TotalRecordCount ?? res.data.Items?.length ?? 0 }
    },
    [api, userId, itemId, recursive, sort, filter],
  )
  const items = usePagedItems(qk('photos', 'grid', itemId, { recursive, sort, filter, seed: state.seed }), fetchPage, !!session)

  // focused (or hovered) grid index: footer, letter, details header, backdrop. Upstream focuses the grid at
  // its saved position (0) once loaded, so the footer starts at "1 / n".
  const [position, setPosition] = useState(0)
  const focusedItem = position >= 0 ? items.get(position) : undefined
  const showHeader = useHeaderOnFirstRow(rootEl)
  const [showViewOptions, setShowViewOptions] = useState(false)

  // focus the first card after the first load on keyboard / pointer devices, unless something else has focus
  // (Back restores the previous card through the shell)
  const initialFocus = useRef(false)
  useEffect(() => {
    // rootEl: with the items already cached the first run comes before the grid's element is known
    if (initialFocus.current || items.status !== 'success' || items.total === 0 || !rootEl) return
    initialFocus.current = true
    if (!matchMedia('(hover: hover)').matches) return
    requestAnimationFrame(() => {
      if (!mayTakeInitialFocus()) return
      rootEl?.querySelector<HTMLElement>('[data-grid-index="0"] [data-card-surface]')?.focus({ preventScroll: true })
    })
  }, [items.status, items.total, rootEl])

  // DestinationContent.kt clears the backdrop for photo albums; "Show backdrop" follows the focused item.
  useEffect(() => {
    if (!vo.showBackdrop) clearBackdrop()
  }, [vo.showBackdrop])
  useEffect(() => {
    if (vo.showBackdrop && focusedItem) submitBackdrop(focusedItem)
  }, [vo.showBackdrop, focusedItem])

  const isAlbum = folder.data?.Type === 'PhotoAlbum'
  const title = folder.data?.Name ?? folder.data?.CollectionType ?? t('collection')
  const total = items.total
  const nameSort = sort.sort === 'SortName'

  const slideshowHref = (index: number, item: BaseItemDto) =>
    nav.slideshow(itemId, {
      index,
      id: item.Id,
      filter: serializeFilter(filter),
      sort: sort.sort,
      order: sort.direction === 'Descending' ? 'desc' : undefined,
      recursive,
    })
  const hrefFor = (index: number, item: BaseItemDto) => (item.Type === 'Photo' ? slideshowHref(index, item) : itemHref(item))

  const playAll = (shuffle: boolean) => {
    if (isAlbum) {
      // CollectionFolderView.kt:976-997: a photo album plays as a slideshow from the start (shuffle ignored)
      void navigate(
        nav.slideshow(itemId, {
          index: 0,
          start: true,
          recursive: true,
          filter: serializeFilter(filter),
          sort: sort.sort,
          order: sort.direction === 'Descending' ? 'desc' : undefined,
        }),
      )
      return
    }
    void navigate(
      nav.playList(itemId, {
        index: 0,
        shuffle,
        recursive,
        sort: sort.sort,
        order: sort.direction === 'Descending' ? 'desc' : 'asc',
        filter: queueFilterJson(filter),
      }),
    )
  }

  const onRandom = async () => {
    if (total <= 0) return
    const index = Math.floor(Math.random() * total)
    const item = await items.fetch(index)
    if (item) void navigate(hrefFor(index, item))
  }

  /** `positionOfLetter`: the number of items whose name sorts before the letter. */
  const jumpToLetter = async (letter: string) => {
    try {
      const res = await getLibraryApi(api).getItems({
        ...gridRequest({ userId, folderId: itemId, recursive, sort, filter }),
        nameLessThan: letter,
        limit: 0,
        enableTotalRecordCount: true,
        enableImageTypes: undefined,
        fields: undefined,
        enableUserData: false,
      })
      const index = res.data.TotalRecordCount ?? -1
      if (index >= 0 && total > 0) grid.current?.scrollToIndex(Math.min(index, total - 1))
    } catch {
      // no-op like a failed upstream lookup
    }
  }

  const ratio = aspectValue(vo.aspectRatio)
  const columnCount = webColumns(gridWidth / dp(1), Math.max(1, vo.columns), vo.spacing)
  const columns: GridColumns = { kind: 'fixed', columns: columnCount }

  const gridIndexOf = (target: EventTarget | null): number | null => {
    const cell = (target as Element | null)?.closest?.('[data-grid-index]')
    const i = cell ? Number(cell.getAttribute('data-grid-index')) : NaN
    return Number.isFinite(i) ? i : null
  }
  const trackPosition = (target: EventTarget | null) => {
    const i = gridIndexOf(target)
    if (i != null) setPosition(i)
  }
  // Mouse hover moves the position (footer, letter) only after the shared intent delay, as browse's grid does.
  const hover = useHoverIntent<number>()

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return
    const target = e.target as HTMLElement
    if (target.closest('input, textarea, [contenteditable]')) return
    const inGrid = !!target.closest('[data-grid-index]')
    const cols = vo.type === 'GRID' ? columnCount : 1
    if (inGrid && (e.key === 'PageDown' || e.key === 'PageUp') && total > 0) {
      e.preventDefault()
      const step = jumpSize(cols, total) * (e.key === 'PageDown' ? 1 : -1)
      grid.current?.scrollToIndex(Math.min(total - 1, Math.max(0, Math.max(position, 0) + step)))
      return
    }
    if (inGrid && e.key === 'Escape' && position > 0) {
      // CardGrid: Back on the grid goes to the first item before leaving the page
      e.preventDefault()
      grid.current?.scrollToIndex(0)
      // the first row is the top of the page: scroll fully up so the card (and the header it brings back) shows
      // whole; aligning the row to the viewport top leaves the focused, scaled card cut off under the edge
      requestAnimationFrame(() => window.scrollTo({ top: 0 }))
      return
    }
    if (inGrid && (e.key === 'MediaPlayPause' || e.key === 'MediaPlay') && position >= 0) {
      const item = items.get(position)
      if (item?.Type === 'PhotoAlbum' && item.Id) {
        e.preventDefault()
        // Fixes upstream passing the album's own grid index as the start index inside it (CollectionFolderView.kt:1006)
        // and, like upstream, passes this grid's filter and sort to the album slideshow
        void navigate(
          nav.slideshow(item.Id, {
            index: 0,
            start: true,
            recursive: true,
            filter: serializeFilter(filter),
            sort: sort.sort,
            order: sort.direction === 'Descending' ? 'desc' : undefined,
          }),
        )
      } else if (item?.Id && (item.Type === 'Video' || item.Type === 'Movie')) {
        e.preventDefault()
        void navigate(nav.play(item.Id))
      }
      return
    }
    if (nameSort && inGrid && e.key.length === 1 && !e.shiftKey && /[a-z]/i.test(e.key)) {
      e.preventDefault()
      void jumpToLetter(e.key.toUpperCase())
    }
  }

  if (folder.isError) {
    return <ErrorMessage title={t('compose_error_message_title')} detail={folder.error.message} />
  }
  if (!folder.data) return <LoadingPage label={t('loading')} />

  const listMode = vo.type !== 'GRID'
  const dense = vo.type === 'DENSE_LIST'
  const currentLetter = letterForSortName(focusedItem?.SortName ?? focusedItem?.Name, JUMP_LETTERS)
  const empty = items.status === 'success' && total === 0

  return (
    <div
      ref={setRootEl}
      className={styles.page}
      data-photo-folder={itemId}
      onKeyDown={onKeyDown}
      onFocus={(e) => trackPosition(e.target)}
      onPointerOver={(e) => {
        if (!isHoverPointer(e)) return
        const i = gridIndexOf(e.target)
        hover.over(i, () => i != null && setPosition(i))
      }}
      onPointerLeave={hover.leave}
      onPointerDown={(e) => trackPosition(e.target)}
    >
      <div className={styles.collapse} data-hidden={showHeader || items.status !== 'success' ? undefined : ''}>
        <div className={styles.header} inert={!(showHeader || items.status !== 'success')}>
          <h1 className={styles.title}>
            <span className={styles.titleText} dir="auto">
              {title}
            </span>
          </h1>
          <div className={styles.controls} data-name-sort={nameSort ? '' : undefined}>
            <div className={styles.group} data-focus-group>
              <PhotoSortButton options={PHOTO_SORT_OPTIONS} current={sort} onChange={setSort} />
              <PhotoFilterButton current={filter} parentId={itemId} onChange={setFilter} />
              <ExpandableButton
                iconKind="fa"
                icon={<FaIcon name="sliders" size={16} />}
                label={t('view_options')}
                onClick={() => setShowViewOptions(true)}
              />
            </div>
            <div className={styles.group} data-focus-group>
              <ExpandableButton
                ref={randomButton}
                iconKind="fa"
                icon={<FaIcon name="dice" size={16} />}
                label={t('sort_by_random')}
                disabled={total === 0}
                onClick={() => void onRandom()}
              />
              <ExpandableButton
                icon={<DrawableIcon name="play" size={28} />}
                label={t('play')}
                disabled={total === 0}
                onClick={() => playAll(false)}
              />
              <ExpandableButton
                iconKind="fa"
                icon={<FaIcon name="shuffle" size={16} />}
                label={t('shuffle')}
                disabled={total === 0}
                onClick={() => playAll(true)}
              />
            </div>
          </div>
        </div>
      </div>

      {vo.showDetails && (
        <div className={styles.details}>
          <HomeHeader item={focusedItem ?? null} showLogo={showLogo} toggles={toggles} />
        </div>
      )}

      {items.status === 'pending' ? (
        <LoadingPage label={t('loading')} />
      ) : items.status === 'error' ? (
        <ErrorMessage title={t('compose_error_message_title')} detail={items.error?.message} />
      ) : (
        <div ref={setBodyEl} className={styles.body}>
          {/* CardGrid.kt focusRestorer: an arrow key entering the grid returns to the card focused there last */}
          <div ref={setGridEl} className={styles.gridWrap} data-focus-enter="last">
            <CardGrid
              ref={grid}
              count={total}
              columns={listMode ? { kind: 'fixed', columns: 1 } : columns}
              gap={vo.spacing}
              restoreKey={`photos:${itemId}:${location.key}`}
              empty={<p className={styles.empty}>{t('no_results')}</p>}
              getItemKey={(i) => `${items.get(i)?.Id ?? 'slot'}:${i}`}
              estimateRowHeight={(w) => (listMode ? dp(dense ? 40 : 64) : w / Math.max(ratio, 2 / 3) + (vo.showTitles ? dp(52) : 0))}
              renderItem={(i, widthPx) => {
                const item = items.get(i)
                if (!item) {
                  return listMode ? (
                    <div className={styles.listPlaceholder} style={{ height: dp(dense ? 40 : 64) }} />
                  ) : (
                    <GridCard
                      aspectRatio={ratio}
                      showTitle={vo.showTitles}
                      title=" "
                      subtitle=" "
                      label={t('loading')}
                      fit={contentScaleFit(vo.contentScale)}
                    />
                  )
                }
                const href = hrefFor(i, item)
                const actions = { href, onClick: linkClick(href), ...menu.cardActions(item) }
                if (listMode) {
                  const runtime = formatRuntime(t, item.RunTimeTicks)
                  return (
                    <ListItem
                      className={styles.listRow}
                      dense={dense}
                      noScale
                      href={href}
                      onClick={linkClick(href)}
                      onContextMenu={actions.onContextMenu}
                      leading={item.UserData?.IsFavorite ? <FaIcon name="heart" color="var(--fx-favorite-heart)" /> : undefined}
                      headline={<span dir="auto">{itemTitle(item)}</span>}
                      supporting={dense ? undefined : (itemSubtitle(t, item) ?? undefined)}
                      trailing={runtime ?? undefined}
                    />
                  )
                }
                const { href: _href, ...card } = gridCardProps(item, ctx, {
                  widthCss: widthPx,
                  aspectRatio: ratio,
                  fit: contentScaleFit(vo.contentScale),
                  imageType: vo.imageType,
                  useSeries: false,
                  showTitle: vo.showTitles,
                })
                return <GridCard {...card} {...actions} />
              }}
            />
            {!empty && !listMode && (
              // CardGrid.kt footer: bottom-centre of the grid box; raw integers, as upstream
              <div className={styles.footer} dir="ltr" aria-live="off">
                {Math.max(position, 0) + 1} / {total}
              </div>
            )}
          </div>
          {!empty && (
            <div className={styles.letters} data-visible={nameSort ? '' : undefined} aria-hidden={!nameSort} onKeyDown={leaveLetterColumn}>
              {nameSort && <AlphabetPicker current={currentLetter} onSelect={(l) => void jumpToLetter(l)} label={t('sort_by_name')} />}
            </div>
          )}
        </div>
      )}

      {showViewOptions && (
        <ViewOptionsPanel value={vo} defaults={VIEW_OPTIONS_WIDE} onChange={setViewOptions} onClose={() => setShowViewOptions(false)} />
      )}
      {menu.element}
    </div>
  )
}
