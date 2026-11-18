import type { ReactNode } from 'react'
import { findLibrary, useLibraries } from '../common/libraries'
import { LiveTvView } from './LiveTvView'
import { RecordingsView } from './RecordingsView'

/**
 * For the library page (/library/:id): the Live TV page for the Live TV user view (DestinationContent.kt:481,
 * CollectionType.LIVETV -> CollectionFolderLiveTv) and the Recordings page for a recording folder
 * (NavDrawerService.kt:200-215 -> Destination.Recordings). `undefined` while the library list loads, `null` when
 * the id is neither.
 */
export function useLiveTvRoute(itemId: string | undefined): ReactNode | null | undefined {
  const libraries = useLibraries()
  if (!itemId) return null
  if (!libraries.data) return libraries.isError ? null : undefined
  const lib = findLibrary(libraries.data, itemId)
  if (!lib) return null
  if (lib.isRecordingFolder) return <RecordingsView key={itemId} folderId={itemId} />
  if (lib.collectionType === 'livetv') return <LiveTvView key={itemId} libraryId={itemId} />
  return null
}
