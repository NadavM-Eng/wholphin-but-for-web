import { useMemo } from 'react'
import { useApi, useSession } from '../../api/session'
import { LoadingPage } from '../../ui'
import { LibraryGrid } from '../browse/components/LibraryGrid'
import { FullHeightPage } from '../browse/components/TabbedPage'
import { folderSource } from '../browse/data/librarySource'
import { GENRES_FILTER_OPTIONS, type GetItemsFilter } from '../browse/model/filter'
import { ALBUM_SORT_OPTIONS } from '../browse/model/sort'
import { VIEW_OPTIONS_SQUARE } from '../browse/model/viewOptions'
import { useMusicItem } from './data/musicQueries'
import { playLibraryGenre } from './service/musicService'

export type MusicGenrePageProps = {
  /** the music library the genre was opened from */
  libraryId: string
  /** MusicGenre / Genre item id */
  genreId: string
}

/**
 * A music genre tile's destination (`Destination.FilteredCollection` with genres=[id], includeItemTypes =
 * [MusicAlbum], recursive, `nameOverride = "<genre> <library name>"`, DestinationContent.kt:291-309): the
 * shared library grid narrowed to that genre's albums, saved under "{libraryId}_genres", Play / Shuffle on.
 * Upstream passes `usePosters = true` here, which stretches the square covers to 2:3; the web keeps them
 * square. Play / Shuffle queue the genre's songs (upstream opens the video playlist player).
 */
export function MusicGenrePage({ libraryId, genreId }: MusicGenrePageProps) {
  const api = useApi()
  const session = useSession()
  const userId = session?.user.id ?? ''
  const genre = useMusicItem(genreId)
  const library = useMusicItem(libraryId).data
  const pageFilter = useMemo<GetItemsFilter>(() => ({ genres: [genreId], includeItemTypes: ['MusicAlbum'] }), [genreId])
  const source = useMemo(() => (library ? folderSource(api, userId, library, true) : null), [api, userId, library])
  if (!library || !source || genre.isPending) {
    return (
      <FullHeightPage>
        <LoadingPage />
      </FullHeightPage>
    )
  }
  // nameOverride = listOfNotNull(genreName, parentName).joinToString(" ")
  const title = [genre.data?.Name, library.Name].filter((s) => s != null && s !== '').join(' ')
  return (
    <FullHeightPage>
      <LibraryGrid
        key={genreId}
        displayId={`${libraryId}_genres`}
        isOverride
        item={library}
        recursive
        pageFilter={pageFilter}
        defaultViewOptions={VIEW_OPTIONS_SQUARE}
        source={source}
        sortOptions={ALBUM_SORT_OPTIONS}
        filterOptions={GENRES_FILTER_OPTIONS}
        filterParentId={libraryId}
        playEnabled
        useSeriesForPrimary
        onPlayAll={(_s, shuffle) => void playLibraryGenre(libraryId, genreId, shuffle)}
        title={title || null}
        showTitle
        collectionType="music"
      />
    </FullHeightPage>
  )
}
