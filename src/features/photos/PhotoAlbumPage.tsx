import { PhotoFolderView } from './PhotoFolderView'

export type PhotoAlbumPageProps = {
  /** Id of a `PhotoAlbum` item. */
  itemId: string
}

/**
 * Photo album page (DestinationContent.kt:246-252: PHOTO_ALBUM -> CollectionFolderPhotoAlbum, recursive = false).
 * Mount it from the item route (`/item/:itemId`) when the item's type is PhotoAlbum.
 */
export function PhotoAlbumPage({ itemId }: PhotoAlbumPageProps) {
  return <PhotoFolderView key={itemId} itemId={itemId} recursive={false} />
}
