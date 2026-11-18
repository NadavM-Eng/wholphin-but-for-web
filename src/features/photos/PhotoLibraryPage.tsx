import { PhotoFolderView } from './PhotoFolderView'

export type PhotoLibraryPageProps = {
  /** Id of a library whose CollectionType is `photos` or `homevideos`. */
  itemId: string
  /** `recursiveOverride` of DestinationContent (default false). */
  recursive?: boolean
}

/**
 * Photos / Home videos library page (DestinationContent.kt:496-504 -> CollectionFolderPhotoAlbum). Mount it from
 * the library route (`/library/:itemId`) when the library's collection type is photos or homevideos.
 */
export function PhotoLibraryPage({ itemId, recursive = false }: PhotoLibraryPageProps) {
  return <PhotoFolderView key={itemId} itemId={itemId} recursive={recursive} />
}
