import type { BaseItemKind, CollectionType } from '@jellyfin/sdk/lib/generated-client/models'
import { getLibraryApi } from '@jellyfin/sdk/lib/utils/api/library-api'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { itemKey } from '../../api/queryKeys'
import { useApi, useSession } from '../../api/session'
import { clearBackdrop } from '../../app/backdrop'
import { ErrorMessage, LoadingPage } from '../../ui'
import { useTranslate } from '../common/useTranslate'
import { MusicGenrePage } from '../music/MusicGenrePage'
import { useFolderItem } from './data/useFolderItem'
import { LibraryGrid } from './components/LibraryGrid'
import { FullHeightPage } from './components/TabbedPage'
import { folderSource, playAllPath } from './data/librarySource'
import { GENRES_FILTER_OPTIONS, STUDIOS_FILTER_OPTIONS, type GetItemsFilter } from './model/filter'
import { sortOptionsForCollection } from './model/sort'
import { VIEW_OPTIONS_POSTER } from './model/viewOptions'

/**
 * `Destination.FilteredCollection` (DestinationContent.kt:290-306): the library grid narrowed to one genre or
 * studio, titled "{genre} {library}", saved sort/filter/view under "{libraryId}_genres" / "_studios",
 * Play/Shuffle on. Everything comes from the URL, so a reload rebuilds the same page.
 */
export default function FilteredCollectionPage() {
  const { t } = useTranslate()
  const api = useApi()
  const session = useSession()
  const navigate = useNavigate()
  const { itemId } = useParams()
  const [params] = useSearchParams()
  const parentType = params.get('type') === 'Studio' ? 'Studio' : 'Genre'
  const filterId = params.get('filter') ?? ''
  const collectionType = (params.get('collectionType') || null) as CollectionType | null
  const recursive = params.get('recursive') === '1' || params.get('recursive') === 'true'
  const types = useMemo(() => (params.get('types')?.split(',').filter(Boolean) ?? null) as BaseItemKind[] | null, [params])
  const library = useFolderItem(itemId)
  const userId = session?.user.id ?? ''
  const filterItem = useQuery({
    queryKey: itemKey(filterId),
    enabled: !!filterId && !!session,
    staleTime: 5 * 60_000,
    queryFn: async ({ signal }) => (await getLibraryApi(api).getItem({ itemId: filterId, userId }, { signal })).data,
  })
  useEffect(() => clearBackdrop(), [])

  const pageFilter = useMemo<GetItemsFilter>(
    () => (parentType === 'Genre' ? { genres: [filterId], includeItemTypes: types } : { studios: [filterId], includeItemTypes: types }),
    [parentType, filterId, types],
  )
  const source = useMemo(
    () => (library.data ? folderSource(api, userId, library.data, recursive) : null),
    [api, userId, library.data, recursive],
  )

  // A music library's genre tile -> the albums of that genre (GenreCardGrid click, BaseItem.kt:380-407)
  if (parentType === 'Genre' && collectionType === 'music' && itemId && filterId) {
    return <MusicGenrePage key={filterId} libraryId={itemId} genreId={filterId} />
  }
  const err = library.error ?? null
  if (err) {
    return (
      <FullHeightPage>
        <ErrorMessage title={t('compose_error_message_title')} detail={err instanceof Error ? err.message : String(err)} />
      </FullHeightPage>
    )
  }
  if (!library.data || !source || filterItem.isPending) {
    return (
      <FullHeightPage>
        <LoadingPage />
      </FullHeightPage>
    )
  }
  // nameOverride = listOfNotNull(genreName, parentName).joinToString(" ")
  const title = [filterItem.data?.Name, library.data.Name].filter((s) => s != null && s !== '').join(' ')
  const lib = library.data
  return (
    <FullHeightPage>
      <LibraryGrid
        key={`${parentType}:${filterId}`}
        displayId={`${lib.Id}_${parentType === 'Genre' ? 'genres' : 'studios'}`}
        isOverride
        item={lib}
        recursive={recursive}
        pageFilter={pageFilter}
        defaultViewOptions={VIEW_OPTIONS_POSTER}
        source={source}
        sortOptions={sortOptionsForCollection(parentType === 'Studio' ? null : collectionType)}
        filterOptions={parentType === 'Genre' ? GENRES_FILTER_OPTIONS : STUDIOS_FILTER_OPTIONS}
        filterParentId={lib.Id ?? null}
        playEnabled
        onPlayAll={(s, shuffle) => void navigate(playAllPath(lib, recursive, s, shuffle))}
        title={title || null}
        showTitle
        collectionType={lib.CollectionType ?? null}
      />
    </FullHeightPage>
  )
}
