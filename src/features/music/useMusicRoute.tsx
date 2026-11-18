// Entry points of the music pages from the generic routes (DestinationContent.kt): the item route dispatches
// MUSIC_ALBUM / MUSIC_ARTIST / AUDIO items (a playlist, audio or not, is the detail feature's PlaylistDetails), the library route dispatches music libraries, the
// filtered-collection route dispatches a music library's genre. `musicPageFor` is the pure dispatch the real
// item/library pages can call once they have the item.
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models'
import type { ReactElement } from 'react'
import { LoadingPage } from '../../ui'
import { AlbumPage } from './AlbumPage'
import { ArtistPage } from './ArtistPage'
import { useMusicItem } from './data/musicQueries'
import { MusicGenrePage } from './MusicGenrePage'
import { MusicLibraryPage } from './MusicLibraryPage'
import { SongPage } from './SongPage'

/** The music page for `item`, or null when the item is not a music kind. */
export function musicPageFor(item: BaseItemDto, opts: { songId?: string | null } = {}): ReactElement | null {
  const id = item.Id
  if (!id) return null
  switch (item.Type) {
    case 'MusicAlbum':
      return <AlbumPage key={id} itemId={id} initialSongId={opts.songId} />
    case 'MusicArtist':
      return <ArtistPage key={id} itemId={id} />
    case 'Audio':
      // BaseItem.destination(): a song with an album opens the album page focused on it
      return item.AlbumId ? <AlbumPage key={item.AlbumId} itemId={item.AlbumId} initialSongId={id} /> : <SongPage key={id} itemId={id} />
    case 'CollectionFolder':
    case 'UserView':
      return item.CollectionType === 'music' ? <MusicLibraryPage key={id} library={item} /> : null
    default:
      return null
  }
}

/**
 * Stub-page hook: the music page for the route's item, a loading page while the item loads, or null.
 * `filtered` = the FilteredCollection route of a music genre (`?type=Genre&filter=<id>&collectionType=music`).
 */
export function useMusicRoute(
  itemId: string | undefined,
  where: 'item' | 'library' | 'filtered',
  params?: URLSearchParams,
): ReactElement | null {
  const isGenre = where === 'filtered' && params?.get('collectionType') === 'music' && params.get('type') === 'Genre'
  const q = useMusicItem(where === 'filtered' ? null : itemId)
  if (where === 'filtered') {
    const genreId = params?.get('filter')
    return isGenre && itemId && genreId ? <MusicGenrePage key={genreId} libraryId={itemId} genreId={genreId} /> : null
  }
  if (q.isPending) return <LoadingPage delayMs={300} />
  if (!q.data) return null
  const page = musicPageFor(q.data, { songId: params?.get('song') })
  if (where === 'library' && q.data.Type !== 'CollectionFolder' && q.data.Type !== 'UserView') return null
  return page
}
