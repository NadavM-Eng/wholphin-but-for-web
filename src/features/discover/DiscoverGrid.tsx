import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation } from 'react-router'
import {
  DEFAULT_SORT,
  filterOptionsFor,
  sortOptionsFor,
  useDiscoverPager,
  type DiscoverFilter,
  type DiscoverRequestType,
  type DiscoverSortAndDirection,
} from '../../api/seerr'
import { mayTakeInitialFocus } from '../../app/shell'
import { bringIntoView, Button, CardGrid, ErrorMessage, focusFromScript, LoadingPage, type CardGridHandle } from '../../ui'
import { gridArrivalStep } from './gridArrival'
import { loadScroll } from '../../ui/rows/scrollMemory'
import { DiscoverCard } from './DiscoverCard'
import { DiscoverFilterButton } from './DiscoverFilterButton'
import collapse from '../common/Collapse.module.css'
import styles from './DiscoverGrid.module.css'
import { DiscoverSortButton } from './DiscoverSortButton'
import { itemDestinationHref } from './links'
import { useHeaderOnFirstRow } from '../common/useHeaderOnFirstRow'

export type DiscoverGridProps = {
  type: DiscoverRequestType
  /** Filter fixed by the entry point (genre card); its filter kind is not offered in the menu. */
  initialFilter?: DiscoverFilter
  /** Title above the controls (the "view more" pages; the Movies/TV tabs show none). */
  title?: string | null
  /** Index to scroll to on first load (upstream `startIndex`, 20 for "view more"). */
  startIndex?: number
  /** Separate state per tab (`viewModelKey`). */
  stateKey: string
}

/**
 * Upstream `DiscoverRequestGrid`: optional title, Sort and Filter buttons (Movies / TV only), then a
 * poster grid paged 20 at a time. Changing sort or filter restarts from the top.
 */
export function DiscoverGrid({ type, initialFilter, title, startIndex = 0, stateKey }: DiscoverGridProps) {
  const { t } = useTranslation()
  const location = useLocation()
  const fixed = useMemo(() => initialFilter ?? {}, [initialFilter])
  const [state, setState] = useState<{
    sort: DiscoverSortAndDirection
    filter: DiscoverFilter
    start: number
  }>(() => ({
    sort: DEFAULT_SORT,
    filter: fixed,
    start: startIndex,
  }))
  const sortOptions = sortOptionsFor(type)
  const filterOptions = useMemo(() => filterOptionsFor(type, fixed), [type, fixed])
  const isTv = type === 'DISCOVER_TV'
  const pager = useDiscoverPager(type, state.filter, state.sort)
  const items = useMemo(() => pager.data?.pages.flatMap((p) => p.items) ?? [], [pager.data])
  const restoreKey = `discover-grid-${stateKey}-${location.key}`
  const gridRef = useRef<CardGridHandle>(null)
  const sentinel = useRef<HTMLDivElement>(null)
  const [rootEl, setRootEl] = useState<HTMLDivElement | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const setRoot = useCallback((el: HTMLDivElement | null) => {
    rootRef.current = el
    setRootEl(el)
  }, [])
  // SE-15: the header starts hidden when opening deep in the list (startIndex >= 6) and hides past row 1.
  const showHeader = useHeaderOnFirstRow(rootEl, startIndex < 6)
  const positioned = useRef(loadScroll(restoreKey) != null)

  // Load pages until `start` is in range, then arrive there once (start 0 too: upstream focuses the grid on load).
  useEffect(() => {
    const step = gridArrivalStep({
      done: positioned.current,
      isPending: pager.isPending,
      fetchError: pager.isFetchNextPageError,
      loaded: items.length,
      start: state.start,
      hasNextPage: pager.hasNextPage,
      isFetchingNextPage: pager.isFetchingNextPage,
    })
    if (step === 'fetch') void pager.fetchNextPage()
    if (step !== 'arrive' && step !== 'give-up') return
    positioned.current = true
    if (step === 'give-up') return
    const start = state.start
    if (start > 0) gridRef.current?.scrollToIndex(start, { focus: false })
    if (!matchMedia('(hover: hover)').matches) return
    // Focus once the card is rendered. A deep start card goes to the pivot like any focus move (CardGrid's
    // align-start jump would cut off its focus scale and ring at the window top).
    // (Not cancelled on re-run: the effect re-runs on every pager change and this runs only once.)
    let tries = 0
    requestAnimationFrame(function tryFocus() {
      const cell = rootRef.current?.querySelector(`[data-grid-index="${start}"]`)
      const target = cell?.querySelector<HTMLElement>('[data-card-surface], [data-focusable]')
      if (!target) {
        if (tries++ < 20 && rootRef.current?.isConnected) requestAnimationFrame(tryFocus)
        return
      }
      if (!mayTakeInitialFocus()) return
      focusFromScript(target)
      if (start > 0) bringIntoView(target)
    })
  }, [items.length, state.start, pager])

  // Fetch the next page when the end of the grid comes near.
  useEffect(() => {
    const el = sentinel.current
    if (!el) return
    const io = new IntersectionObserver(
      (entries) => {
        // After a failed page, wait for the Retry button instead of re-requesting on every re-subscribe.
        if (
          entries.some((e) => e.isIntersecting) &&
          pager.hasNextPage &&
          !pager.isFetchingNextPage &&
          !pager.isFetchNextPageError
        ) {
          void pager.fetchNextPage()
        }
      },
      { rootMargin: '800px 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [pager])

  const showControls = sortOptions.length > 0 || filterOptions.length > 0
  return (
    <div ref={setRoot} className={styles.root}>
      {(title || showControls) && (
        <div className={collapse.collapse} data-hidden={showHeader ? undefined : ''} inert={!showHeader}>
          <div className={styles.header}>
            {title && (
              <h1 className={styles.title} dir="auto">
                {title}
              </h1>
            )}
            {showControls && (
              <div className={styles.controls} data-focus-group>
                {sortOptions.length > 0 && (
                  <DiscoverSortButton
                    options={sortOptions}
                    current={state.sort}
                    onChange={(sort) => setState((s) => ({ ...s, sort, start: 0 }))}
                  />
                )}
                {filterOptions.length > 0 && (
                  <DiscoverFilterButton
                    options={filterOptions}
                    current={state.filter}
                    isTv={isTv}
                    onChange={(filter) => setState((s) => ({ ...s, filter, start: 0 }))}
                  />
                )}
              </div>
            )}
          </div>
        </div>
      )}
      {pager.isPending ? (
        <LoadingPage delayMs={300} label={t('loading')} />
      ) : pager.isError && !pager.data?.pages.length ? (
        <ErrorMessage title={t('web_seerr_error_occurred')} detail={pager.error.message} />
      ) : (
        <>
          <CardGrid
            ref={gridRef}
            count={items.length}
            columns={{ kind: 'auto', minCardWidth: 140 }}
            gap={16}
            restoreKey={restoreKey}
            getItemKey={(i) => `${items[i].type}-${items[i].id}-${i}`}
            empty={<p className={styles.empty}>{t('no_results')}</p>}
            renderItem={(i) => <DiscoverCard item={items[i]} href={itemDestinationHref(items[i])} width="fill" index={i} />}
          />
          <div ref={sentinel} className={styles.sentinel} aria-hidden />
          {pager.isFetchingNextPage ? (
            <LoadingPage label={t('loading')} className={styles.more} />
          ) : pager.isFetchNextPageError ? (
            // A failed later page keeps the loaded cards and offers a retry for the next page only.
            <div className={styles.pageError} role="alert">
              <p className={styles.pageErrorText} dir="auto">
                {t('web_seerr_error_occurred')}
                {pager.error?.message ? ` ${pager.error.message}` : ''}
              </p>
              <Button onClick={() => void pager.fetchNextPage()}>{t('retry')}</Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}
