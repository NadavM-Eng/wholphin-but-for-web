import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models'
import { getLibraryApi } from '@jellyfin/sdk/lib/utils/api/library-api'
import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { Navigate } from 'react-router'
import { itemKey } from '../../api/queryKeys'
import { useApi, useSession } from '../../api/session'
import { nav } from '../../app/nav'
import { PhotoAlbumPage } from './PhotoAlbumPage'
import { PhotoLibraryPage } from './PhotoLibraryPage'

/**
 * Route dispatch for photo kinds, for the library (`/library/:itemId`) and item (`/item/:itemId`) pages:
 * - a library with collection type photos / homevideos -> PhotoLibraryPage
 * - a PhotoAlbum -> PhotoAlbumPage
 * - a Photo (item route only; upstream has no page for it) -> the viewer on its parent, opened on that photo
 * Returns `undefined` while the item loads, `null` when the item is not a photo kind (the caller renders its own
 * page). The item query is shared with PhotoFolderView, so the page does not fetch it twice.
 */
export function usePhotoRoute(itemId: string | undefined, route: 'library' | 'item'): ReactNode | null | undefined {
  const api = useApi()
  const session = useSession()
  const q = useQuery({
    queryKey: itemKey(itemId),
    enabled: !!itemId && !!session,
    queryFn: async ({ signal }) => (await getLibraryApi(api).getItem({ itemId: itemId!, userId: session!.user.id }, { signal })).data,
  })
  if (!itemId) return null
  if (q.isPending && q.fetchStatus !== 'idle') return undefined
  const item = q.data
  if (!item) return null
  return photoPageFor(item, route)
}

/**
 * The pure form of {@link usePhotoRoute} for pages that already loaded the item: the photo page for `item`, or
 * null when it is not a photo kind.
 */
export function photoPageFor(item: BaseItemDto, route: 'library' | 'item'): ReactNode | null {
  const id = item.Id
  if (!id) return null
  const ct = item.CollectionType
  if (route === 'library' && (ct === 'photos' || ct === 'homevideos') && item.Type !== 'Folder') {
    return <PhotoLibraryPage key={id} itemId={id} />
  }
  if (item.Type === 'PhotoAlbum') return <PhotoAlbumPage key={id} itemId={id} />
  if (route === 'item' && item.Type === 'Photo' && item.ParentId) {
    return <Navigate replace to={nav.slideshow(item.ParentId, { id })} />
  }
  return null
}
