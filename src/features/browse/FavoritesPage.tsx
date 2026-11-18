import type { BaseItemKind } from '@jellyfin/sdk/lib/generated-client/models'
import { useQueries } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useApi, useSession } from '../../api/session'
import { usePrefs } from '../../stores/preferences'
import { clearBackdrop } from '../../app/backdrop'
import { ErrorMessage, LoadingPage } from '../../ui'
import { itemQueryMeta } from '../common/itemCache'
import { typeNameKey } from '../common/itemKinds'
import { useLibraries } from '../common/libraries'
import { useTranslate } from '../common/useTranslate'
import { LibraryGrid } from './components/LibraryGrid'
import { FullHeightPage, TabbedPage } from './components/TabbedPage'
import { FAVORITES_PAGE_SIZE, favoritesSource } from './data/favoritesSource'
import { useTabState } from './data/useTabState'
import { staleBefore, useVisitStart } from './data/visit'
import { FAVORITES_ID, loadDisplayInfo, loadRememberedTab } from './model/displayInfo'
import { FAVORITE_OPTIONS, favoritesDisplayId, favoriteTypes, initialFavoriteTab, type FavoriteTabResult } from './model/favorites'
import { FAVORITES_FILTER_OPTIONS, mergeFilter, type GetItemsFilter } from './model/filter'
import { DEFAULT_SORT, sortOptionsForKind } from './model/sort'
import { defaultViewOptionsForKind } from './model/viewOptions'
import styles from './FavoritesPage.module.css'

const FAVORITE_FILTER: GetItemsFilter = Object.freeze({ favorite: true })
const NO_TABS: readonly string[] = []

/**
 * Favorites (W/ui/detail/FavoritesPage.kt + FavoritesViewModel.kt): one tab per favorite type that has
 * results, in `favoriteOptions` order, each a library-style grid (no Play / Shuffle). All types are
 * fetched at once; the page opens on the remembered (or first) type, falling forward to the first type
 * with results. Un-favoriting from the menu drops the item from the list (upstream's menu called the
 * watched API instead); a tab that becomes empty stays and shows "No results" instead of "Invalid tab".
 */
export default function FavoritesPage() {
  const { t } = useTranslate()
  const api = useApi()
  const session = useSession()
  const libraries = useLibraries()
  const serverId = session?.server.id ?? ''
  const userId = session?.user.id ?? ''
  useEffect(() => clearBackdrop(), [])

  const staleTime = staleBefore(useVisitStart())

  const types = useMemo(() => (libraries.data ? favoriteTypes(libraries.data.map((l) => l.collectionType)) : []), [libraries.data])

  // First page of every type with its saved sort / filter: the same queries the tab grids use.
  const probes = useQueries({
    queries: types.map((kind) => {
      const saved = loadDisplayInfo(serverId, userId, favoritesDisplayId(kind))
      const state = {
        sort: saved?.sort ?? DEFAULT_SORT,
        filter: saved?.filter ? mergeFilter(FAVORITE_FILTER, saved.filter) : FAVORITE_FILTER,
        viewOptions: defaultViewOptionsForKind(kind),
      }
      const source = favoritesSource(api, userId, kind)(state)
      const pageSize = source.pageSize ?? FAVORITES_PAGE_SIZE
      return {
        queryKey: [...source.key, 'page', pageSize, 0],
        staleTime,
        gcTime: 30 * 60_000,
        meta: itemQueryMeta(...(source.deps ?? [])),
        queryFn: ({ signal }: { signal: AbortSignal }) => source.fetchPage(0, pageSize, true, signal),
      }
    }),
  })
  const results: FavoriteTabResult[] = types.map((kind, i) => {
    const q = probes[i]
    return { kind, status: q.isPending ? 'pending' : q.isError ? 'error' : (q.data?.items.length ?? 0) > 0 ? 'items' : 'empty' }
  })

  // Tabs that appeared stay for this visit (a filter with no result or the last un-favorite keeps the tab).
  const [seen, setSeen] = useState<ReadonlySet<BaseItemKind>>(() => new Set())
  const showable = results.filter((r) => r.status === 'items' || r.status === 'error').map((r) => r.kind)
  useEffect(() => {
    setSeen((cur) => (showable.every((k) => cur.has(k)) ? cur : new Set([...cur, ...showable])))
    // showable is derived from the probe results
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showable.join(',')])
  const tabKinds = FAVORITE_OPTIONS.filter((k) => seen.has(k) || showable.includes(k))

  // Preferred tab: the URL's (Back / reload), else the remembered one (preference), else the first type.
  const [params] = useSearchParams()
  const remember = usePrefs('rememberSelectedTab')
  const urlTab = params.get('tab') as BaseItemKind | null
  const rememberedIndex = remember ? loadRememberedTab(serverId, userId, FAVORITES_ID) : null
  const preferred =
    (urlTab && types.includes(urlTab) ? urlTab : null) ??
    (rememberedIndex != null && types.includes(FAVORITE_OPTIONS[rememberedIndex]) ? FAVORITE_OPTIONS[rememberedIndex] : null) ??
    types[0] ??
    null
  const initial = initialFavoriteTab(preferred, results)
  // upstream stores the BaseItemKind ordinal; the web stores the index in favoriteOptions (local only)
  const toStored = useCallback((k: string) => FAVORITE_OPTIONS.indexOf(k as BaseItemKind), [])
  const fromStored = useCallback((n: number) => FAVORITE_OPTIONS[n] ?? null, [])
  // No tab is chosen (or written to the URL) until the initial tab is known.
  const [tab, setTab] = useTabState(FAVORITES_ID, initial === null ? NO_TABS : tabKinds, {
    toStored,
    fromStored,
    fallback: initial === null ? null : initial !== 'none' ? initial : (tabKinds[0] ?? null),
  })

  const [scrolled, setScrolled] = useState(false)
  const onScrolled = useCallback((s: boolean) => setScrolled(s), [])
  useEffect(() => setScrolled(false), [tab])
  const source = useMemo(() => (tab ? favoritesSource(api, userId, tab as BaseItemKind) : null), [api, userId, tab])

  if (libraries.isError) {
    return (
      <FullHeightPage>
        <ErrorMessage title={t('compose_error_message_title')} detail={libraries.error instanceof Error ? libraries.error.message : String(libraries.error)} />
      </FullHeightPage>
    )
  }
  if (!libraries.data || initial === null) {
    return (
      <FullHeightPage>
        <LoadingPage />
      </FullHeightPage>
    )
  }
  if (initial === 'none' && tabKinds.length === 0) {
    return (
      <FullHeightPage>
        <div className={styles.none} tabIndex={0} data-focusable>
          {t('no_favorites_found')}
        </div>
      </FullHeightPage>
    )
  }

  const kind = tab as BaseItemKind | null
  return (
    <TabbedPage tabs={tabKinds.map((k) => ({ key: k, label: t(typeNameKey(k)) }))} selected={tab} onSelect={setTab} showTabs={!scrolled}>
      {kind && source && (
        <LibraryGrid
          key={kind}
          displayId={favoritesDisplayId(kind)}
          isOverride
          pageFilter={FAVORITE_FILTER}
          defaultViewOptions={defaultViewOptionsForKind(kind)}
          source={source}
          sortOptions={sortOptionsForKind(kind)}
          filterOptions={FAVORITES_FILTER_OPTIONS}
          filterParentId={null}
          playEnabled={false}
          // FavoritesViewModel.createPager: ApiRequestPager's default useSeriesForPrimary = false
          useSeriesForPrimary={false}
          onScrolled={onScrolled}
        />
      )}
    </TabbedPage>
  )
}
