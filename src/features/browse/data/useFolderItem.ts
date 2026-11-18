import { getLibraryApi } from '@jellyfin/sdk/lib/utils/api/library-api'
import { useQuery } from '@tanstack/react-query'
import { itemKey } from '../../../api/queryKeys'
import { useApi, useSession } from '../../../api/session'

/** `GET /Items/{id}` of the library / folder (CollectionFolderViewModel.init). */
export function useFolderItem(itemId: string | undefined) {
  const api = useApi()
  const session = useSession()
  return useQuery({
    queryKey: itemKey(itemId),
    enabled: !!itemId && !!session,
    staleTime: 5 * 60_000,
    queryFn: async ({ signal }) => (await getLibraryApi(api).getItem({ itemId: itemId!, userId: session!.user.id }, { signal })).data,
  })
}
