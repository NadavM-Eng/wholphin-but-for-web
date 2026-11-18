import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useApi, useSession } from '../../api/session'
import { clearBackdrop } from '../../app/backdrop'
import { usePrefs } from '../../stores/preferences'
import { ErrorMessage, LoadingPage } from '../../ui'
import { useTranslate } from '../common/useTranslate'
import { useLiveTvRoute } from '../livetv/useLiveTvRoute'
import { musicPageFor } from '../music/useMusicRoute'
import { photoPageFor } from '../photos/usePhotoRoute'
import { FullHeightPage, TabbedPage } from './components/TabbedPage'
import { LibraryGrid } from './components/LibraryGrid'
import { RecommendedTab } from './components/RecommendedTab'
import { TileGrid } from './components/TileGrid'
import { folderSource, playAllPath } from './data/librarySource'
import { movieRecommendedRows, tvRecommendedRows } from './data/recommended'
import { useFolderItem } from './data/useFolderItem'
import { useTabState } from './data/useTabState'
import { DEFAULT_FILTER_OPTIONS, DEFAULT_TV_FILTER_OPTIONS, type GetItemsFilter } from './model/filter'
import { MOVIE_SORT_OPTIONS, PLAYLIST_SORT_OPTIONS, SERIES_SORT_OPTIONS, VIDEO_SORT_OPTIONS } from './model/sort'
import { VIEW_OPTIONS_POSTER, VIEW_OPTIONS_SQUARE, VIEW_OPTIONS_WIDE } from './model/viewOptions'

/**
 * Library / folder page (`Destination.MediaItem` for CollectionFolder / Folder / UserView,
 * W/ui/nav/DestinationContent.kt:434-536): movie and TV libraries get their tabs, box sets, playlists
 * and other folders the generic grid. Live TV, recording folders, music, photo and home-video libraries and photo
 * albums dispatch to their own feature pages first (DestinationContent.kt:481-504, NavDrawerService.kt:200-215).
 */
export default function CollectionFolderPage() {
  const { t } = useTranslate()
  const { itemId } = useParams()
  const item = useFolderItem(itemId)
  // Live TV user view -> Live TV page; recording folder -> Recordings page. Needs the drawer library list (shared
  // query), so it is decided before the folder item: undefined = still loading.
  const liveTv = useLiveTvRoute(itemId)
  // DestinationContent: libraries clear the app backdrop on enter
  useEffect(() => clearBackdrop(), [itemId])

  if (item.isError) {
    return (
      <FullHeightPage>
        <ErrorMessage title={t('compose_error_message_title')} detail={item.error instanceof Error ? item.error.message : String(item.error)} />
      </FullHeightPage>
    )
  }
  if (liveTv === undefined || !item.data) return <FullHeightPage>{<LoadingPage />}</FullHeightPage>
  if (liveTv) return liveTv
  const folder = item.data
  // Photos / home-video libraries and photo albums -> photo grid; music libraries -> music tabs
  const feature = photoPageFor(folder, 'library') ?? musicPageFor(folder)
  if (feature) return feature
  switch (folder.CollectionType) {
    case 'movies':
      return <MovieLibrary key={folder.Id} item={folder} />
    case 'tvshows':
      return <TvLibrary key={folder.Id} item={folder} />
    default:
      return <FolderPage key={folder.Id} item={folder} />
  }
}

/** `CollectionFolder(...)` for everything but movies / TV: overrides by item type, then by collection type. */
function FolderPage({ item }: { item: BaseItemDto }) {
  const api = useApi()
  const session = useSession()
  const navigate = useNavigate()
  const usePostersOverride = item.Type === 'Folder' ? true : null
  const recursiveOverride = item.Type === 'UserView' ? true : null
  let usePosters = usePostersOverride ?? false
  let recursive = recursiveOverride ?? false
  let playEnabled = false
  let sortOptions = VIDEO_SORT_OPTIONS
  let defaults = usePosters ? VIEW_OPTIONS_POSTER : VIEW_OPTIONS_WIDE
  switch (item.CollectionType) {
    case 'boxsets':
      // DestinationContent.kt:468 passes MovieSortOptions, not BoxSetSortOptions
      usePosters = true
      recursive = false
      sortOptions = MOVIE_SORT_OPTIONS
      defaults = VIEW_OPTIONS_POSTER
      break
    case 'playlists':
      // CollectionFolderPlaylist(recursive = true): square cards, playlist sort, no play buttons
      recursive = true
      sortOptions = PLAYLIST_SORT_OPTIONS
      defaults = VIEW_OPTIONS_SQUARE
      break
    case 'musicvideos':
    case 'books':
      playEnabled = true
      break
    default:
      // folders, trailers, mixed (music, live TV, photo and home-video libraries have their own pages)
      break
  }
  const source = useMemo(() => folderSource(api, session?.user.id ?? '', item, recursive), [api, session, item, recursive])
  return (
    <FullHeightPage>
      <LibraryGrid
        displayId={item.Id ?? ''}
        item={item}
        recursive={recursive}
        pageFilter={EMPTY_FILTER}
        defaultViewOptions={defaults}
        source={source}
        sortOptions={sortOptions}
        filterOptions={DEFAULT_FILTER_OPTIONS}
        filterParentId={item.Id ?? null}
        playEnabled={playEnabled}
        onPlayAll={(s, shuffle) => void navigate(playAllPath(item, recursive, s, shuffle))}
        title={item.Name ?? item.CollectionType ?? null}
        showTitle
        collectionType={item.CollectionType ?? null}
      />
    </FullHeightPage>
  )
}

const EMPTY_FILTER: GetItemsFilter = Object.freeze({})
const MOVIES_FILTER: GetItemsFilter = { includeItemTypes: ['Movie'] }
const BOX_SETS_FILTER: GetItemsFilter = { includeItemTypes: ['BoxSet'] }
const SERIES_FILTER: GetItemsFilter = { includeItemTypes: ['Series'] }

function useTabLabels(keys: readonly string[]) {
  const { t } = useTranslate()
  return keys.map((k) => ({ key: k, label: t(k) }))
}

/** `CollectionFolderMovie`: Recommended, Library, Collections, Genres. */
function MovieLibrary({ item }: { item: BaseItemDto }) {
  const api = useApi()
  const session = useSession()
  const navigate = useNavigate()
  const id = item.Id ?? ''
  const userId = session?.user.id ?? ''
  const keys = ['recommended', 'library', 'collections', 'genres'] as const
  const tabs = useTabLabels(keys)
  const [tab, setTab] = useTabState(id, keys)
  const [scrolled, setScrolled] = useState(false)
  const onScrolled = useCallback((s: boolean) => setScrolled(s), [])
  useEffect(() => setScrolled(false), [tab])
  const rows = useMemo(() => movieRecommendedRows(id, userId), [id, userId])
  const source = useMemo(() => folderSource(api, userId, item, true), [api, userId, item])
  return (
    <TabbedPage tabs={tabs} selected={tab} onSelect={setTab} showTabs={!scrolled}>
      {tab === 'recommended' && <RecommendedTab key="rec" parentId={id} rows={rows} suggestionsKind="Movie" onScrolled={onScrolled} />}
      {(tab === 'library' || tab === 'collections') && (
        // Both tabs read and write the library's one LibraryDisplayInfo (same item id), as upstream.
        <LibraryGrid
          key={tab}
          displayId={id}
          item={item}
          pageFilter={tab === 'library' ? MOVIES_FILTER : BOX_SETS_FILTER}
          defaultViewOptions={VIEW_OPTIONS_POSTER}
          source={source}
          sortOptions={tab === 'library' ? MOVIE_SORT_OPTIONS : VIDEO_SORT_OPTIONS}
          filterOptions={DEFAULT_FILTER_OPTIONS}
          filterParentId={id}
          playEnabled={tab === 'library'}
          onPlayAll={(s, shuffle) => void navigate(playAllPath(item, true, s, shuffle))}
          collectionType={item.CollectionType ?? null}
          onScrolled={onScrolled}
        />
      )}
      {tab === 'genres' && <TileGrid key="genres" kind="Genre" parent={item} includeItemTypes={['Movie']} collectionType="movies" />}
    </TabbedPage>
  )
}

/** `CollectionFolderTv`: Recommended, Library, Genres, Studios. */
function TvLibrary({ item }: { item: BaseItemDto }) {
  const api = useApi()
  const session = useSession()
  const navigate = useNavigate()
  const rewatch = usePrefs('rewatchNextUp')
  const id = item.Id ?? ''
  const userId = session?.user.id ?? ''
  const keys = ['recommended', 'library', 'genres', 'studios'] as const
  const tabs = useTabLabels(keys)
  const [tab, setTab] = useTabState(id, keys)
  const [scrolled, setScrolled] = useState(false)
  const onScrolled = useCallback((s: boolean) => setScrolled(s), [])
  useEffect(() => setScrolled(false), [tab])
  const rows = useMemo(() => tvRecommendedRows(id, userId, rewatch), [id, userId, rewatch])
  const source = useMemo(() => folderSource(api, userId, item, true), [api, userId, item])
  return (
    <TabbedPage tabs={tabs} selected={tab} onSelect={setTab} showTabs={!scrolled}>
      {tab === 'recommended' && <RecommendedTab key="rec" parentId={id} rows={rows} suggestionsKind="Series" onScrolled={onScrolled} />}
      {tab === 'library' && (
        <LibraryGrid
          key="library"
          displayId={id}
          item={item}
          pageFilter={SERIES_FILTER}
          defaultViewOptions={VIEW_OPTIONS_POSTER}
          source={source}
          sortOptions={SERIES_SORT_OPTIONS}
          filterOptions={DEFAULT_TV_FILTER_OPTIONS}
          filterParentId={id}
          playEnabled={false}
          onPlayAll={(s, shuffle) => void navigate(playAllPath(item, true, s, shuffle))}
          collectionType={item.CollectionType ?? null}
          onScrolled={onScrolled}
        />
      )}
      {tab === 'genres' && <TileGrid key="genres" kind="Genre" parent={item} includeItemTypes={['Series']} collectionType="tvshows" />}
      {tab === 'studios' && <TileGrid key="studios" kind="Studio" parent={item} includeItemTypes={['Series']} collectionType={null} />}
    </TabbedPage>
  )
}
