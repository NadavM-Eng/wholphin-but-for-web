import { useQueries, useQuery, useQueryClient, type QueryClient, type UseQueryResult } from '@tanstack/react-query'
import { useMemo } from 'react'
import { qk } from '../../../api/queryKeys'
import { libraryDrawerId } from '../../../app/shell/drawerItems'
import { getNavPins } from '../../../app/shell/navPins'
import { useApi, useSession } from '../../../api/session'
import { createLimiter } from '../../common/concurrency'
import { itemQueryMeta, type ItemDep } from '../../common/itemCache'
import { librariesQuery, type Library } from '../../common/libraries'
import { usePrefs } from '../../../stores/preferences'
import { rowDataKey, SUPPORTED_HOME_PAGE_SETTINGS_VERSION, type HomeRowConfig } from '../model/homeRowConfig'
import { resolveHomeSettings, saveLocal, setSource, type ResolvedHomeSettings, type HomeSettingsSource } from '../model/homeSettings'
import { configTitle, fetchHomeRow, type HomeRowData } from './rowFetchers'

/** Rows load at most 4 at a time (HomeViewModel `Semaphore(4)`). */
const rowLimiter = createLimiter(4)

/** Prefix of every home row query (for refetch / reset). */
export const homeRowsKey = () => qk('home', 'row')
export const homeSettingsKey = () => qk('home', 'settings')

/** The resolved home row list of the signed-in user (see model/homeSettings.ts). */
export function useHomeSettings(): UseQueryResult<ResolvedHomeSettings> {
  const api = useApi()
  const qc = useQueryClient()
  const session = useSession()
  return useQuery({
    queryKey: homeSettingsKey(),
    enabled: !!session,
    staleTime: Infinity,
    queryFn: async ({ signal }) => {
      const user = session!.userDto
      const libraries = await qc.ensureQueryData(librariesQuery(qc, api, user))
      // `getFilteredUserLibraries`: the default rows skip libraries unpinned from the drawer.
      const pins = getNavPins()
      const pinned = libraries.filter((l) => pins[libraryDrawerId(l.id)]?.type !== 'UNPINNED')
      return resolveHomeSettings({ api, serverId: session!.server.id, user, defaultLibraries: pinned, allLibraries: libraries, signal })
    },
  })
}

/** Saves the row list on this device and makes LOCAL the user's source (upstream "Save only to this device"). */
export function saveHomeSettingsLocally(qc: QueryClient, serverId: string, userId: string, rows: HomeRowConfig[]): void {
  saveLocal(serverId, userId, { rows, version: SUPPORTED_HOME_PAGE_SETTINGS_VERSION })
  setSource(serverId, userId, 'LOCAL')
  qc.setQueryData<ResolvedHomeSettings>(homeSettingsKey(), { source: 'LOCAL' satisfies HomeSettingsSource, rows })
}

/** What a row's content depends on (for narrow invalidation after a mutation). */
export function rowDeps(c: HomeRowConfig): ItemDep[] {
  switch (c.type) {
    case 'ContinueWatching':
    case 'NextUp':
    case 'ContinueWatchingCombined':
      return ['played', 'nextUp', 'deleted']
    case 'RecentlyAdded':
      // the server hides played items in "latest" per the user's setting
      return ['played', 'deleted']
    case 'Favorite':
      return ['favorite', 'deleted']
    case 'GetItems':
      return ['played', 'favorite', 'deleted']
    default:
      return ['deleted']
  }
}

function status(err: unknown): number | null {
  const s = (err as { response?: { status?: unknown } } | null)?.response?.status
  return typeof s === 'number' ? s : null
}

export type HomeRowState = {
  config: HomeRowConfig
  index: number
  query: UseQueryResult<HomeRowData>
}

/**
 * One TanStack query per row, rendered as each arrives. A 404 makes the row empty (hidden); any other
 * failure is that row's error. Rows refetch on return to Home once 5 s old (upstream reloads every
 * time Home starts) and keep their data on screen while refreshing.
 */
export function useHomeRows(
  rows: readonly HomeRowConfig[] | undefined,
  libraries: readonly Library[] | undefined,
  /** Items per row; default the `max_items_per_row` preference (the customization preview uses 8). */
  limitOverride?: number,
): HomeRowState[] {
  const api = useApi()
  const qc = useQueryClient()
  const session = useSession()
  const prefLimit = usePrefs('homePageItems')
  const limit = limitOverride ?? prefLimit
  const enableRewatching = usePrefs('rewatchNextUp')
  const maxDaysNextUp = usePrefs('maxDaysNextUp')
  const list = useMemo(() => rows ?? [], [rows])

  const queries = useQueries({
    queries: list.map((config) => {
      const queryKey = [...homeRowsKey(), rowDataKey(config), { limit, enableRewatching, maxDaysNextUp }]
      return {
        queryKey,
        enabled: !!session && !!libraries,
        staleTime: 5_000,
        meta: itemQueryMeta(...rowDeps(config)),
        queryFn: ({ signal }: { signal: AbortSignal }) =>
          rowLimiter(async (): Promise<HomeRowData> => {
            const ctx = {
              api,
              serverId: session!.server.id,
              userId: session!.user.id,
              user: session!.userDto,
              libraries: libraries ?? [],
              limit,
              enableRewatching,
              maxDaysNextUp,
              isRefresh: qc.getQueryData(queryKey) !== undefined,
              signal,
            }
            try {
              return await fetchHomeRow(config, ctx)
            } catch (err) {
              if (status(err) === 404) return { title: configTitle(config, libraries), items: [], showViewMore: false }
              throw err
            }
          }),
      }
    }),
  })
  return list.map((config, index) => ({ config, index, query: queries[index] }))
}
