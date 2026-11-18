// Sort / filter / view options of one grid with their persistence (CollectionFolderViewModel.init and
// saveLibraryDisplayInfo, CollectionFolderView.kt:164-300).
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models'
import { getLibraryApi } from '@jellyfin/sdk/lib/utils/api/library-api'
import { useQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useState } from 'react'
import { qk } from '../../../api/queryKeys'
import { useApi, useSession } from '../../../api/session'
import { loadDisplayInfo, saveDisplayInfo, type LibraryDisplayInfo } from '../model/displayInfo'
import { mergeFilter, type GetItemsFilter } from '../model/filter'
import { DEFAULT_SORT, type SortAndDirection } from '../model/sort'
import type { ViewOptions } from '../model/viewOptions'

export type GridState = { sort: SortAndDirection; filter: GetItemsFilter; viewOptions: ViewOptions }

export type GridStateOptions = {
  /** `libraryDisplayInfoIdOverride ?: itemId`. */
  displayId: string
  /** `CollectionFolderFilter.useSavedLibraryDisplayInfo`: restore and save sort + filter (and save view options). */
  useSaved: boolean
  /** Whether `displayId` is an override (genre / studio / favorites keys): no ancestor lookup. */
  isOverride: boolean
  /** The folder item, for the ancestor lookup of sub-folders. */
  item?: BaseItemDto | null
  pageFilter: GetItemsFilter
  initialSort?: SortAndDirection | null
  defaultViewOptions: ViewOptions
}

function initial(o: GridStateOptions, saved: LibraryDisplayInfo | null, ancestor: LibraryDisplayInfo | null): GridState {
  return {
    // saved view options are read even when useSaved is off (CollectionFolderView.kt:190-196)
    viewOptions: saved?.viewOptions ?? ancestor?.viewOptions ?? o.defaultViewOptions,
    sort: (o.useSaved ? (saved?.sort ?? ancestor?.sort) : null) ?? o.initialSort ?? DEFAULT_SORT,
    filter: o.useSaved && saved?.filter ? mergeFilter(o.pageFilter, saved.filter) : o.pageFilter,
  }
}

/** `null` until resolved (sub-folders first look up their ancestors' saved options). */
export function useGridState(o: GridStateOptions): {
  state: GridState | null
  setSort: (s: SortAndDirection) => void
  setFilter: (f: GetItemsFilter) => void
  setViewOptions: (v: ViewOptions) => void
} {
  const api = useApi()
  const session = useSession()
  const serverId = session?.server.id ?? ''
  const userId = session?.user.id ?? ''
  const [saved] = useState(() => loadDisplayInfo(serverId, userId, o.displayId))
  // A sub-folder without its own view options inherits from the closest ancestor that has some.
  const needAncestors = !o.isOverride && o.item?.Type === 'Folder' && saved?.viewOptions == null
  const ancestors = useQuery({
    queryKey: qk('browse', 'ancestors', o.item?.Id),
    enabled: needAncestors && !!o.item?.Id,
    staleTime: 5 * 60_000,
    queryFn: async ({ signal }) => (await getLibraryApi(api).getAncestors({ itemId: o.item!.Id!, userId }, { signal })).data,
  })
  const [state, setState] = useState<GridState | null>(() => (needAncestors ? null : initial(o, saved, null)))

  useEffect(() => {
    if (state || !needAncestors || ancestors.isPending) return
    const found = (ancestors.data ?? []).map((a) => (a.Id ? loadDisplayInfo(serverId, userId, a.Id) : null)).find((x) => x != null) ?? null
    setState(initial(o, saved, found))
    // `o` is read once when the ancestors arrive
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, needAncestors, ancestors.isPending, ancestors.data])

  const persist = useCallback(
    (next: GridState) => {
      if (o.useSaved) saveDisplayInfo(serverId, userId, o.displayId, { sort: next.sort, filter: next.filter, viewOptions: next.viewOptions })
    },
    [o.useSaved, o.displayId, serverId, userId],
  )

  const update = useCallback(
    (patch: Partial<GridState>) =>
      setState((cur) => {
        if (!cur) return cur
        const next = { ...cur, ...patch }
        persist(next)
        return next
      }),
    [persist],
  )

  return {
    state,
    setSort: useCallback((sort) => update({ sort }), [update]),
    setFilter: useCallback((filter) => update({ filter }), [update]),
    setViewOptions: useCallback((viewOptions) => update({ viewOptions }), [update]),
  }
}
