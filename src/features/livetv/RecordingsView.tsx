import { getLibraryApi } from '@jellyfin/sdk/lib/utils/api/library-api'
import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { itemKey } from '../../api/queryKeys'
import { useApi, useSession } from '../../api/session'
import { clearBackdrop } from '../../app/backdrop'
import { LoadingPage } from '../../ui'
import { FullHeightPage } from '../browse/components/TabbedPage'
import { LiveTvError } from './LiveTvError'
import { RecordingFolderGrid } from './RecordingFolderGrid'

/**
 * `CollectionFolderRecordings` (W/ui/detail/CollectionFolderRecordings.kt): a recording folder opened from the
 * drawer. `CollectionFolderView` with `recursive = false`, `ViewOptionsPoster`, `MovieSortOptions`, play
 * disabled, the folder name as the grid title.
 */
export function RecordingsView({ folderId }: { folderId: string }) {
  const { t } = useTranslation()
  const api = useApi()
  const session = useSession()

  // DestinationContent.kt:320-321
  useEffect(() => clearBackdrop(), [])

  const folder = useQuery({
    queryKey: itemKey(folderId),
    enabled: !!session,
    staleTime: 5 * 60_000,
    queryFn: async ({ signal }) => (await getLibraryApi(api).getItem({ itemId: folderId, userId: session?.user.id }, { signal })).data,
  })

  return (
    <FullHeightPage>
      {folder.isError ? (
        <LiveTvError error={folder.error} />
      ) : folder.data ? (
        <RecordingFolderGrid key={folderId} folder={folder.data} variant="page" />
      ) : (
        <LoadingPage label={t('loading')} />
      )}
    </FullHeightPage>
  )
}
