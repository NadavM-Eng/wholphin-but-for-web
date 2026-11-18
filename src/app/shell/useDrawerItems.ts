import type { Api } from '@jellyfin/sdk'
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models'
import { getLiveTvApi } from '@jellyfin/sdk/lib/utils/api/live-tv-api'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useUserViews } from '../../api/hooks/useUserViews'
import { qk } from '../../api/queryKeys'
import { useApi, useSession } from '../../api/session'
import { normalizeId } from '../../lib/ids'
import { toast } from '../toast'
import { buildDrawerState, builtinItems, librariesFromViews, type DrawerState } from './drawerItems'
import { useNavPins } from './navPins'
import { useShellFlags } from './shellFlags'

function httpStatus(err: unknown): number | undefined {
  const r = (err as { response?: { status?: unknown } } | null)?.response
  return typeof r?.status === 'number' ? r.status : undefined
}

/**
 * Live TV recording folders (`GET /LiveTv/Recordings/Folders`). One cache entry shared by the drawer, Home's
 * library list (features/common/libraries.ts) and the Live TV page's folder tabs, so they are requested once.
 */
export function recordingFoldersQuery(api: Api, userId: string) {
  return {
    queryKey: qk('recordingFolders'),
    staleTime: 5 * 60_000,
    queryFn: async ({ signal }: { signal?: AbortSignal }): Promise<BaseItemDto[]> => {
      try {
        const res = await getLiveTvApi(api).getRecordingFolders({ userId }, { signal })
        return (res.data.Items ?? []).filter((i) => !!i.Id)
      } catch (err) {
        const status = httpStatus(err)
        // 401/403 are swallowed upstream (NavDrawerService.getAllUserLibraries)
        if (status === 401 || status === 403) return []
        throw err
      }
    },
  }
}

/**
 * NavDrawerService.updateNavDrawer: Favorites (+ Discover when Seerr is active) + supported libraries and
 * Live TV recording folders, ordered and split into pinned / "More" by the user's pins.
 */
export function useDrawerItems(): DrawerState {
  const { t } = useTranslation()
  const api = useApi()
  const session = useSession()
  const userId = session?.user.id
  const tvAccess = session?.userDto.Policy?.EnableLiveTvAccess === true
  const views = useUserViews()
  const folders = useQuery({ ...recordingFoldersQuery(api, userId ?? ''), enabled: !!userId && tvAccess })
  const pins = useNavPins()
  const discover = useShellFlags((s) => s.discoverEnabled)

  const failed = views.isError || folders.isError
  useEffect(() => {
    if (failed) toast(t('web_error_fetching_views'), { long: true })
  }, [failed, t])

  const viewItems = views.data
  const folderItems = folders.data
  return useMemo(() => {
    if (!viewItems) return { items: [], moreItems: [] }
    const libs = librariesFromViews(viewItems, new Set((folderItems ?? []).map((f) => normalizeId(f.Id ?? ''))))
    return buildDrawerState([...builtinItems(discover), ...libs], pins)
  }, [viewItems, folderItems, discover, pins])
}
