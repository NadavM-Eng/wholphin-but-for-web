import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models'
import { useQueries, useQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useLocation } from 'react-router'
import { qk } from '../../../api/queryKeys'
import { useApi, useSession } from '../../../api/session'
import { submitBackdrop } from '../../../app/backdrop'
import { nav, useNav, type ItemGridState } from '../../../app/nav'
import { mayTakeInitialFocus } from '../../../app/shell'
import { usePrefs } from '../../../stores/preferences'
import { ItemRow, LoadingPage, LoadingRow } from '../../../ui'
import { fetchGridPage, type GridRequestParams } from '../../browse/data/gridRequestKinds'
import { recommendedReady } from '../../browse/data/recommended'
import { itemHref, useCardContext } from '../../common/cardAdapters'
import { itemQueryMeta } from '../../common/itemCache'
import { useLinkClick } from '../../common/links'
import { getSuggestions } from '../../common/suggestions'
import { useItemContextMenu } from '../../common/useItemContextMenu'
import { useTranslate } from '../../common/useTranslate'
import { CARD_HEIGHT } from '../../common/viewOptions'
import { HomeCard, HomeViewMoreCard } from '../../home/HomeCard'
import { HomeHeader } from '../../home/HomeHeader'
import { cardWidthDp, POS_ATTR, viewMoreWidthDp } from '../../home/homeCardLayout'
import { viewOptions } from '../../home/model/homeRowConfig'
import { parsePos, ROW_ATTR, useHomeFocus, type HomePos } from '../../home/useHomeFocus'
import { playItem } from '../service/musicService'
import { musicRecommendedRows } from './musicSources'
import styles from './RecommendedMusic.module.css'

type RowData = { items: BaseItemDto[]; showViewMore: boolean }
type RowView = { titleKey: string; data: RowData | undefined; error: unknown; viewMore: ItemGridState | null }

/** `HomeRowViewOptions(aspectRatio = SQUARE, heightDp = Cards.HEIGHT_EPISODE, showTitles = true)` (RecommendedMusic.kt). */
const VIEW = Object.freeze(viewOptions({ aspectRatio: 'SQUARE', heightDp: CARD_HEIGHT.episode, showTitles: true }))
const HIDE_AFTER_PX = 24

/**
 * `RecommendedMusic` (W/ui/components/RecommendedMusic.kt on RecommendedContent -> HomePageContent): the header of
 * the focused album stays on top, the rows scroll below it: Recently Released, Recently added, Top Rated and
 * Suggestions (albums), each limited to the home page's "max items per row" with a View more card when full.
 * Same structure as the browse feature's RecommendedTab, with square titled cards.
 */
export function RecommendedMusic({ libraryId, onScrolled }: { libraryId: string; onScrolled: (scrolled: boolean) => void }) {
  const { t } = useTranslate()
  const api = useApi()
  const session = useSession()
  const go = useNav()
  const location = useLocation()
  const limit = usePrefs('homePageItems')
  const showLogo = usePrefs('showLogos')
  const toggles = usePrefs('displayToggles')
  const ctx = useCardContext()
  const linkClick = useLinkClick()
  const menu = useItemContextMenu({ showGoTo: true, showStreamChoices: false, canRemoveContinueWatching: false, canRemoveNextUp: false })
  const userId = session?.user.id ?? ''
  const rows = useMemo(() => musicRecommendedRows(libraryId, userId), [libraryId, userId])

  const queries = useQueries({
    queries: rows.map((row) => ({
      queryKey: qk('music', 'recommended', libraryId, row.titleKey, { limit }),
      staleTime: 30_000,
      meta: itemQueryMeta('favorite', 'played', 'deleted'),
      queryFn: async ({ signal }: { signal: AbortSignal }): Promise<RowData> => {
        const page = await fetchGridPage(api, row, 0, limit, false, signal)
        return { items: page.items, showViewMore: page.items.length >= limit }
      },
    })),
  })
  const suggestions = useQuery({
    queryKey: qk('music', 'suggestions', libraryId, { limit }),
    staleTime: 30_000,
    enabled: !!session,
    queryFn: async ({ signal }): Promise<RowData> => {
      const items = await getSuggestions(api, { serverId: session!.server.id, userId: session!.user.id, parentId: libraryId, kind: 'MusicAlbum', count: limit }, signal)
      return { items, showViewMore: items.length >= limit }
    },
  })

  const views: RowView[] = [
    ...rows.map((row, i) => ({
      titleKey: row.titleKey,
      data: queries[i].data,
      error: queries[i].isError ? queries[i].error : null,
      viewMore: gridState(row.titleKey, { query: row.query }, row.request, queries[i].data?.items.length ?? 0),
    })),
    {
      titleKey: 'suggestions',
      data: suggestions.data,
      error: null,
      viewMore: gridState('suggestions', { query: { userId, ids: (suggestions.data?.items ?? []).map((i) => i.Id) } }, 'items', suggestions.data?.items.length ?? 0),
    },
  ]
  const ready = recommendedReady(queries.map((q) => ({ pending: q.isPending, nonEmpty: (q.data?.items.length ?? 0) > 0 })))

  // ---- header follows the focused / hovered card (TV: focused), else the first card ----
  const [pos, setPos] = useState<HomePos | null>(null)
  const list = useRef<HTMLDivElement | null>(null)
  const onPosition = useCallback((p: HomePos) => setPos((cur) => (cur && cur.row === p.row && cur.col === p.col ? cur : p)), [])
  useHomeFocus(list, onPosition, ready)
  const first = views.findIndex((v) => (v.data?.items.length ?? 0) > 0)
  const headerItem = (pos ? views[pos.row]?.data?.items[pos.col] : undefined) ?? (first >= 0 ? views[first].data?.items[0] : undefined) ?? null
  useEffect(() => {
    if (headerItem) submitBackdrop(headerItem)
  }, [headerItem])

  // ---- first focus: the first card once the rows show (HomePageContent, HomePage.kt:317-336) ----
  // Never steals focus; on Back the shell's focus restore puts the remembered card back over it.
  const autoFocused = useRef(false)
  useEffect(() => {
    if (autoFocused.current || !ready) return
    autoFocused.current = true
    if (matchMedia('(hover: none)').matches) return
    requestAnimationFrame(() => {
      if (!mayTakeInitialFocus()) return
      list.current?.querySelector<HTMLElement>(`[${POS_ATTR}]`)?.focus({ preventScroll: true })
    })
  }, [ready])

  // ---- the tab row collapses once the rows scroll (CollectionFolderMusic.kt: showHeader = pos.row < 1) ----
  useEffect(() => {
    const el = list.current
    if (!el) return
    const onScroll = () => onScrolled(el.scrollTop > HIDE_AFTER_PX)
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      el.removeEventListener('scroll', onScroll)
      onScrolled(false)
    }
  }, [ready, onScrolled])

  // TV Play key on a focused album (RecommendedContent onClickPlay): plays it through the music queue.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'MediaPlayPause' && e.key !== 'MediaPlay' && !(e.key === ' ' && !e.ctrlKey && !e.altKey && !e.metaKey)) return
    const p = parsePos((e.target as HTMLElement).closest(`[${POS_ATTR}]`)?.getAttribute(POS_ATTR))
    const item = p ? views[p.row]?.data?.items[p.col] : undefined
    if (!item) return
    e.preventDefault()
    void playItem(item)
  }

  const nothing = ready && views.every((v) => v.data && v.data.items.length === 0)

  if (!ready) return <LoadingPage />

  return (
    <div className={styles.page}>
      <HomeHeader item={headerItem} showLogo={showLogo} toggles={toggles} />
      <div ref={list} className={styles.rows} onKeyDown={onKeyDown} data-focus-group>
        {nothing && <p className={styles.empty}>{t('no_results')}</p>}
        {views.map((v, rowIndex) => {
          const title = t(v.titleKey)
          if (!v.data) {
            if (v.error) return <LoadingRow key={v.titleKey} title={title} message={v.error instanceof Error ? v.error.message : String(v.error)} error focusable />
            return <LoadingRow key={v.titleKey} title={title} message={t('loading')} focusable />
          }
          const items = v.data.items
          if (items.length === 0) return null
          const count = items.length + (v.data.showViewMore ? 1 : 0)
          return (
            <div key={v.titleKey} className={styles.row} {...{ [ROW_ATTR]: rowIndex }} data-focus-group>
              <ItemRow
                title={title}
                count={count}
                gap={VIEW.spacing}
                itemWidth={(i) => (i < items.length ? cardWidthDp(items[i], VIEW) : viewMoreWidthDp(items[items.length - 1], VIEW))}
                restoreKey={`${location.key}:music-rec:${libraryId}:${v.titleKey}`}
                previousLabel={t('web_previous')}
                nextLabel={t('web_next')}
                getItemKey={(i) => (i < items.length ? `${items[i].Id}:${i}` : 'view-more')}
                renderItem={(i) => {
                  if (i >= items.length) {
                    const state = v.viewMore
                    return (
                      <HomeViewMoreCard
                        lastItem={items[items.length - 1]}
                        viewOptions={VIEW}
                        label={t('view_more')}
                        href={nav.grid()}
                        pos={`${rowIndex}:${i}`}
                        onClick={(e) => {
                          e.preventDefault()
                          if (state) go.openGrid(state)
                        }}
                      />
                    )
                  }
                  const item = items[i]
                  const href = itemHref(item)
                  return (
                    <HomeCard
                      item={item}
                      pos={`${rowIndex}:${i}`}
                      viewOptions={VIEW}
                      ctx={ctx}
                      href={href}
                      onClick={linkClick(href)}
                      menu={menu.cardActions(item)}
                      tabStop={i === 0}
                    />
                  )
                }}
              />
            </div>
          )
        })}
      </div>
      {menu.element}
    </div>
  )
}

/** `onClickViewMore`: an ItemGrid of the row's request starting after the cards the row showed. */
function gridState(titleKey: string, params: Omit<GridRequestParams, 'aspectRatio'>, request: string, shown: number): ItemGridState {
  return {
    title: titleKey,
    titleIsKey: true,
    request,
    params: { ...params, aspectRatio: VIEW.aspectRatio } satisfies GridRequestParams,
    initialPosition: shown,
  }
}
