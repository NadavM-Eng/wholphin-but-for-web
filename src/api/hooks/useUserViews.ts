import { getUserViewApi } from '@jellyfin/sdk/lib/utils/api/user-view-api'
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models'
import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { qk } from '../queryKeys'
import { useApi, useSession } from '../session'

/**
 * The signed-in user's libraries (GET /UserViews). Shared by the nav drawer, home rows and settings,
 * so there is exactly one query for it. Upstream: NavDrawerService / HomeDataService both call
 * userViewsApi.getUserViews(userId).
 */
export function useUserViews(): UseQueryResult<BaseItemDto[]> {
  const api = useApi()
  const session = useSession()
  const userId = session?.user.id
  return useQuery({
    queryKey: qk('userViews'),
    enabled: !!userId,
    staleTime: 5 * 60_000,
    queryFn: async ({ signal }) => {
      const res = await getUserViewApi(api).getUserViews({ userId }, { signal })
      return res.data.Items ?? []
    },
  })
}
