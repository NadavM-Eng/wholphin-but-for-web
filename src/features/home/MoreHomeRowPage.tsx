import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models'
import { useInfiniteQuery } from '@tanstack/react-query'
import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react'
import { useNavigationType, useParams, useSearchParams } from 'react-router'
import { qk } from '../../api/queryKeys'
import { useApi, useSession } from '../../api/session'
import { clearBackdrop } from '../../app/backdrop'
import { mayTakeInitialFocus } from '../../app/shell'
import { usePrefs } from '../../stores/preferences'
import { useDp } from '../../theme/scale'
import { CardGrid, ErrorMessage, GenreCard, GridCard, LoadingPage, StudioCard, type CardGridHandle, type GridColumns } from '../../ui'
import { gridCardProps, itemHref, useCardContext } from '../common/cardAdapters'
import { itemQueryMeta } from '../common/itemCache'
import { DEFAULT_PAGE_SIZE } from '../common/itemFields'
import { useLibraries } from '../common/libraries'
import { useLinkClick } from '../common/links'
import { useItemContextMenu } from '../common/useItemContextMenu'
import { useTranslate } from '../common/useTranslate'
import { aspectValue, contentScaleFit } from '../common/viewOptions'
import { configTitle, fetchHomeRow, isPagedRow, type HomeRowData } from './data/rowFetchers'
import { rowTitleText } from './data/rowTitle'
import { rowDeps, useHomeSettings } from './data/useHomeData'
import { rowDataKey } from './model/homeRowConfig'
import styles from './MoreHomeRowPage.module.css'
import { firstPartlyVisible, pickVisibleCell } from './pickVisibleCell'
import { watchRestoredFocus } from './restoredFocus'

/** HomeRowGridViewModel loads up to 1000 items (`limit = 1_000 // TODO`), paged by 100 where possible. */
const MAX_ITEMS = 1000

const WIDE_QUERY = '(min-width: 900px)'
function subscribeWide(cb: () => void) {
  const mq = matchMedia(WIDE_QUERY)
  mq.addEventListener('change', cb)
  return () => mq.removeEventListener('change', cb)
}

/**
 * "View more" grid of one home row (upstream `HomeRowGrid`, W/ui/detail/HomeRowGrid.kt): title, then a
 * card grid (6 columns, 4 for wide cards; fewer on narrow windows) with paging.
 */
export default function MoreHomeRowPage() {
  const { t } = useTranslate()
  const { rowId } = useParams()
  const [search] = useSearchParams()
  const navType = useNavigationType()
  const api = useApi()
  const session = useSession()
  const settings = useHomeSettings()
  const libraries = useLibraries()
  const ctx = useCardContext()
  const menu = useItemContextMenu()
  const linkClick = useLinkClick()
  const enableRewatching = usePrefs('rewatchNextUp')
  const maxDaysNextUp = usePrefs('maxDaysNextUp')
  const wide = useSyncExternalStore(subscribeWide, () => matchMedia(WIDE_QUERY).matches, () => true)
  const grid = useRef<CardGridHandle>(null)
  const dp = useDp()

  // DestinationContent.kt:311-312 clears the backdrop for MoreHomeRow; HomeRowGrid never sets one.
  useEffect(() => clearBackdrop(), [])

  const config = settings.data?.rows[Number(rowId)]
  const paged = config ? isPagedRow(config) : false

  const query = useInfiniteQuery({
    queryKey: qk('home', 'more', config ? rowDataKey(config) : null, { enableRewatching, maxDaysNextUp }),
    enabled: !!config && !!libraries.data && !!session,
    meta: itemQueryMeta(...(config ? rowDeps(config) : [])),
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }): Promise<HomeRowData> =>
      fetchHomeRow(config!, {
        api,
        serverId: session!.server.id,
        userId: session!.user.id,
        user: session!.userDto,
        libraries: libraries.data ?? [],
        limit: paged ? Math.min(DEFAULT_PAGE_SIZE, MAX_ITEMS - pageParam) : MAX_ITEMS,
        enableRewatching,
        maxDaysNextUp,
        isRefresh: true,
        signal,
        startIndex: paged ? pageParam : undefined,
      }),
    getNextPageParam: (last, pages, lastParam) => {
      if (!paged) return undefined
      const loaded = pages.reduce((n, p) => n + p.items.length, 0)
      const total = last.total ?? (last.items.length < DEFAULT_PAGE_SIZE ? loaded : Infinity)
      return loaded < Math.min(total, MAX_ITEMS) && last.items.length > 0 ? lastParam + last.items.length : undefined
    },
  })

  const pages = query.data?.pages ?? []
  const items: BaseItemDto[] = pages.flatMap((p) => p.items)
  const imageOverrides = Object.assign({}, ...pages.map((p) => p.imageOverrides ?? {})) as Record<string, string | null>
  const hrefOverrides = Object.assign({}, ...pages.map((p) => p.hrefOverrides ?? {})) as Record<string, string>
  const title = config ? rowTitleText(t, pages[0]?.title ?? configTitle(config, libraries.data)) : ''

  // Load the next page when the grid renders near the end (renderItem runs inside the grid's own
  // renders, so the request is scheduled from there).
  const fetchScheduled = useRef(false)
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query
  const nearEnd = () => {
    if (fetchScheduled.current || !hasNextPage || isFetchingNextPage) return
    fetchScheduled.current = true
    setTimeout(() => {
      void fetchNextPage().finally(() => {
        fetchScheduled.current = false
      })
    }, 0)
  }

  // "View more" opens the grid focused on the first item the row did not show (HomeRowGrid.kt:285-296
  // initialPosition + gridFocusRequester). A POP (Back, but also a reload or a link opened in a new tab) keeps the
  // restored scroll: a card already in view takes focus if nothing else has it, and the shell's restore on Back
  // puts the remembered card over it.
  const position = Number(search.get('position') ?? 0)
  const initial = Number.isFinite(position) && position > 0 ? position : 0
  const jumped = useRef(false)
  const pageRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    if (jumped.current || items.length === 0) return
    if (navType === 'POP') {
      jumped.current = true
      if (matchMedia('(hover: none)').matches) return
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          const root = pageRef.current
          if (!root) return
          // The card that ends up focused (picked here, or the remembered one the shell's restore puts over it)
          // may sit partly outside the restored scroll: bring it into view as an arrow-key move would.
          watchRestoredFocus(root)
          if (!mayTakeInitialFocus()) return
          const cells = Array.from(root.querySelectorAll<HTMLElement>('[data-grid-index]'))
          const cell = pickVisibleCell(cells, initial) ?? firstPartlyVisible(cells)
          cell?.querySelector<HTMLElement>('[data-card-surface], [data-focusable]')?.focus({ preventScroll: true })
        }),
      )
      return
    }
    if (items.length <= initial && hasNextPage) return
    jumped.current = true
    const index = Math.min(initial, items.length - 1)
    // after the router's scroll reset for the new entry; never steal focus from something already chosen
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        grid.current?.scrollToIndex(index, { focus: mayTakeInitialFocus() })
      }),
    )
  }, [initial, items.length, navType, hasNextPage])

  if (settings.isError || libraries.isError || query.isError) {
    const err = settings.error ?? libraries.error ?? query.error
    return <ErrorMessage title={t('compose_error_message_title')} detail={err instanceof Error ? err.message : String(err)} />
  }
  if (!settings.data || !libraries.data || (config && query.isPending)) return <LoadingPage label={t('loading')} />
  if (!config) return <ErrorMessage title={t('no_results')} />

  const o = config.viewOptions
  const isTiles = config.type === 'Genres' || config.type === 'Studios'
  const ratio = isTiles ? 16 / 9 : aspectValue(o.aspectRatio)
  const columns: GridColumns = wide
    ? { kind: 'fixed', columns: ratio > 1 ? 4 : 6 }
    : { kind: 'auto', minCardWidth: ratio > 1 ? 160 : 104 }

  return (
    <div ref={pageRef} className={styles.page}>
      <h1 className={styles.title}>
        <span className={styles.titleText}>{title}</span>
      </h1>
      <CardGrid
        ref={grid}
        count={items.length}
        columns={columns}
        gap={o.spacing}
        restoreKey={`more:${rowId}`}
        empty={t('no_results')}
        getItemKey={(i) => `${items[i]?.Id}:${i}`}
        estimateRowHeight={(w) => (isTiles ? w / ratio : w / Math.max(ratio, 2 / 3) + dp(52))}
        renderItem={(i, widthPx) => {
          if (i >= items.length - 24) nearEnd()
          const item = items[i]
          const id = item.Id ?? ''
          const href = hrefOverrides[id] ?? itemHref(item)
          const actions = { href, onClick: linkClick(href), ...menu.cardActions(item, { goToHref: hrefOverrides[id] }) }
          if (item.Type === 'Genre') return <GenreCard id={id} name={item.Name} imageSrc={imageOverrides[id]} {...actions} />
          if (item.Type === 'Studio') return <StudioCard id={id} name={item.Name} imageSrc={imageOverrides[id]} {...actions} />
          const { href: _h, ...card } = gridCardProps(item, ctx, {
            widthCss: widthPx,
            aspectRatio: ratio,
            fit: contentScaleFit(o.contentScale),
            imageType: o.imageType,
            useSeries: o.useSeries,
          })
          return <GridCard {...card} {...actions} />
        }}
      />
      {menu.element}
    </div>
  )
}
