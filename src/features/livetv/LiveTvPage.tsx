import { useLibraries } from '../common/libraries'
import { LiveTvView } from './LiveTvView'

/**
 * /livetv (drawer entry for the Live TV library, `NavDrawerService` -> `CollectionFolderLiveTv`). The library id
 * only keys the remembered tab, so the page does not wait for the library list.
 */
export default function LiveTvPage() {
  const libraries = useLibraries()
  const libraryId = libraries.data?.find((l) => l.collectionType === 'livetv')?.id ?? null
  return <LiveTvView libraryId={libraryId} />
}
